/** F8 — perfil: avatar de iniciais (#83), foto (#84), PATCH /me (#85), lixeira (#86). */
import { corDerivadaDoNome } from '@compasso/core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { comToken, config } from './ajuda';
import { novoEvento, usarClientes, type Cliente } from './clientes';

const { ctx, doisAparelhos } = usarClientes();

async function sincronizar(...cs: Cliente[]) {
  for (const c of cs) {
    c.online = true;
    await c.motor.sincronizar();
  }
}

async function enviarAvatar(token: string, dados: Buffer, nome = 'foto.jpg') {
  const form = new FormData();
  form.append('arquivo', new File([new Uint8Array(dados)], nome, { type: 'image/jpeg' }));
  const r = await ctx.env.app.request('/me/avatar', comToken(token, { method: 'PUT', body: form }));
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

describe('PATCH /me (#85)', () => {
  it('muda nome (e a cor das iniciais acompanha) e lembrete padrão', async () => {
    const { token } = await doisAparelhos('Nome Antigo');
    const r = await ctx.env.app.request(
      '/me',
      comToken(token, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: '  Ágata Nova ', defaultReminderMinutes: 30 }),
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      displayName: 'Ágata Nova',
      accentColor: corDerivadaDoNome('Ágata Nova'),
      defaultReminderMinutes: 30,
    });
    const ruim = await ctx.env.app.request(
      '/me',
      comToken(token, { method: 'PATCH', body: JSON.stringify({ displayName: '', admin: true }) }),
    );
    expect(ruim.status).toBe(400);
  });
});

describe('foto de perfil (#84)', () => {
  it('foto grande vira 256px sem EXIF; trocar apaga a anterior; remover volta às iniciais', async () => {
    const { token } = await doisAparelhos('Foto');
    // ~4 MB de ruído, com EXIF (inclui GPS falso no comentário do fabricante).
    const grande = await sharp({
      create: {
        width: 2200,
        height: 1500,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .jpeg({ quality: 100 })
      .withExif({ IFD0: { Make: 'Teste', Model: 'GPS -23.5,-46.6' } })
      .toBuffer();
    expect(grande.length).toBeGreaterThan(2_000_000);
    expect(grande.length).toBeLessThan(config.avatarMaxBytes);
    const r = await enviarAvatar(token, grande);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ avatarKind: 'uploaded' });
    const caminho = join(config.avatarDir, r.corpo.avatarPath as string);
    const meta = await sharp(caminho).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([256, 256, 'jpeg']);
    expect(meta.exif).toBeUndefined();

    const segunda = await enviarAvatar(
      token,
      await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00f' } })
        .png()
        .toBuffer(),
      'x.png',
    );
    expect(existsSync(caminho)).toBe(false);
    expect(segunda.corpo.avatarPath).not.toBe(r.corpo.avatarPath);

    const del = await ctx.env.app.request('/me/avatar', comToken(token, { method: 'DELETE' }));
    expect(await del.json()).toMatchObject({ avatarKind: 'initials', avatarPath: null });
    expect(readdirSync(config.avatarDir)).not.toContain(segunda.corpo.avatarPath);
  });

  it('GET /avatares/:arquivo serve a foto sem token; nome fora do padrão → 404', async () => {
    const { token } = await doisAparelhos('Foto servida');
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#0a0' } })
      .png()
      .toBuffer();
    const r = await enviarAvatar(token, png, 'x.png');
    const foto = await ctx.env.app.request(`/avatares/${r.corpo.avatarPath as string}`);
    expect(foto.status).toBe(200);
    expect(foto.headers.get('content-type')).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await foto.arrayBuffer())).metadata()).width).toBe(256);

    for (const ruim of ['..%2F..%2Fpackage.json', 'x.jpg', `${crypto.randomUUID()}.jpg`]) {
      expect((await ctx.env.app.request(`/avatares/${ruim}`)).status).toBe(404);
    }
  });

  it('arquivo que não é imagem é recusado pelo conteúdo, não pela extensão', async () => {
    const { token } = await doisAparelhos('Não é imagem');
    const r = await enviarAvatar(token, Buffer.from('#!/bin/sh\necho oi'), 'foto.jpg');
    expect(r.status).toBe(415);
  });
});

describe('lixeira (#86)', () => {
  it('excluir e restaurar traz de volta nos dois aparelhos; offline também', async () => {
    const { a, b, token } = await doisAparelhos('Lixeira');
    const item = a.repo.criar(novoEvento('apagado sem querer'));
    await sincronizar(a, b);
    a.tempo(1000);
    a.repo.excluir(item.id);
    await sincronizar(a, b);
    expect(b.repo.obter(item.id)).toBeNull();
    const lixo = await ctx.env.app.request('/trash', comToken(token));
    expect(((await lixo.json()) as { id: string }[]).map((x) => x.id)).toContain(item.id);

    // Restaurar no aparelho B, offline, e sincronizar.
    b.online = false;
    b.tempo(5000);
    expect(b.repo.lixeira().map((x) => x.id)).toEqual([item.id]);
    b.repo.restaurar(item.id);
    expect(b.repo.obter(item.id)?.title).toBe('apagado sem querer');
    await sincronizar(b, a);
    expect(a.repo.obter(item.id)?.title).toBe('apagado sem querer');
  });

  it('POST /trash/:id/restore pela API; item fora da lixeira → 404', async () => {
    const { a, token } = await doisAparelhos('Restaurar API');
    const item = a.repo.criar(novoEvento('x'));
    a.repo.excluir(item.id);
    await sincronizar(a);
    const r = await ctx.env.app.request(
      `/trash/${item.id}/restore`,
      comToken(token, { method: 'POST' }),
    );
    expect(r.status).toBe(200);
    const de_novo = await ctx.env.app.request(
      `/trash/${item.id}/restore`,
      comToken(token, { method: 'POST' }),
    );
    expect(de_novo.status).toBe(404);
    await sincronizar(a);
    expect(a.repo.obter(item.id)).not.toBeNull();
  });
});
