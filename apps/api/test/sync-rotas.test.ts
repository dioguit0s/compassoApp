import type { ItemWire, RespostaPull, RespostaPush } from '@compasso/core';
import { novoId } from '@compasso/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ambiente, comToken } from './ajuda';
import { evento } from './fixtures';

let env: Awaited<ReturnType<typeof ambiente>>;
let dono: pg.Client;
beforeAll(async () => {
  env = await ambiente();
  dono = new pg.Client({ connectionString: inject('urlAdmin') });
  await dono.connect();
});
afterAll(async () => {
  await dono.end();
  await env.fechar();
});

async function push(token: string, itens: unknown[]) {
  const r = await env.app.request(
    '/sync/push',
    comToken(token, { method: 'POST', body: JSON.stringify({ itens }) }),
  );
  const json = (await r.json()) as RespostaPush;
  return { status: r.status, corpo: json.itens, ocorrencias: json.ocorrencias };
}

async function pull(token: string, cursor: string | null = null) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const r = await env.app.request(`/sync/pull${q}`, comToken(token));
  return (await r.json()) as RespostaPull;
}

const mais = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe('POST /sync/push', () => {
  it('insere, e o mesmo push repetido não duplica nem muda nada', async () => {
    const { token } = await env.admin.criarConta('Push');
    const itens = [evento(), evento({ title: 'Aniversário' })];
    const r1 = await push(token, itens);
    expect(r1.corpo.aplicados.sort()).toEqual(itens.map((i) => i.id).sort());
    const r2 = await push(token, itens);
    expect(r2.corpo).toEqual({
      aplicados: [],
      ignorados: expect.arrayContaining(itens.map((i) => i.id)),
    });
    expect((await pull(token)).itens).toHaveLength(2);
  });

  it('updatedAt mais velho que o do servidor não sobrescreve; mais novo sobrescreve', async () => {
    const { token } = await env.admin.criarConta('LWW');
    const item = evento({ title: 'original' });
    await push(token, [item]);

    const velho = { ...item, title: 'velho', updatedAt: mais(item.updatedAt, -1000) };
    expect((await push(token, [velho])).corpo.ignorados).toEqual([item.id]);
    const empate = { ...item, title: 'empate' };
    expect((await push(token, [empate])).corpo.ignorados).toEqual([item.id]);
    expect((await pull(token)).itens[0]!.title).toBe('original');

    const novo = { ...item, title: 'novo', updatedAt: mais(item.updatedAt, 1000) };
    expect((await push(token, [novo])).corpo.aplicados).toEqual([item.id]);
    expect((await pull(token)).itens[0]!.title).toBe('novo');
  });

  it('tombstone segue o LWW e chega ao pull', async () => {
    const { token } = await env.admin.criarConta('Tombstone');
    const item = evento();
    await push(token, [item]);
    const t = mais(item.updatedAt, 500);
    await push(token, [{ ...item, deletedAt: t, updatedAt: t }]);
    const [linha] = (await pull(token)).itens;
    expect(linha!.deletedAt).toBe(t);
  });

  it('userId enviado é ignorado: a linha fica com a conta do token', async () => {
    const a = await env.admin.criarConta('Dono A');
    const b = await env.admin.criarConta('Dono B');
    const item = { ...evento(), userId: b.userId };
    await push(a.token, [item]);
    const r = await dono.query('select user_id from items where id = $1', [item.id]);
    expect(r.rows[0].user_id).toBe(a.userId);
    expect((await pull(b.token)).itens).toHaveLength(0);
  });

  it('não sobrescreve um item de outra conta com o mesmo id', async () => {
    const a = await env.admin.criarConta('Colisão A');
    const b = await env.admin.criarConta('Colisão B');
    const item = evento({ title: 'de A' });
    await push(a.token, [item]);
    const r = await push(b.token, [
      { ...item, title: 'de B', updatedAt: mais(item.updatedAt, 1000) },
    ]);
    expect(r.corpo).toEqual({ aplicados: [], ignorados: [item.id] });
    const linha = await dono.query('select title, user_id from items where id = $1', [item.id]);
    expect(linha.rows[0]).toEqual({ title: 'de A', user_id: a.userId });
  });

  it('payload que viola invariante → 400, nada gravado', async () => {
    const { token } = await env.admin.criarConta('Inválido');
    const valido = evento();
    const invalido: ItemWire = { ...evento(), kind: 'task' };
    const r = await push(token, [valido, invalido]);
    expect(r.status).toBe(400);
    expect((await pull(token)).itens).toHaveLength(0);
  });
});

describe('GET /sync/pull', () => {
  it('sem cursor devolve tudo; com cursor, só o que mudou depois (mais a janela)', async () => {
    const { token } = await env.admin.criarConta('Pull');
    const a = evento({ title: 'A' });
    await push(token, [a]);
    const p1 = await pull(token);
    expect(p1.itens.map((i) => i.id)).toEqual([a.id]);
    expect(p1.retencaoDias).toBe(30);

    // Janela de 60 s: repetir o mesmo pull devolve de novo o que está dentro dela.
    const p2 = await pull(token, p1.cursor);
    expect(p2.itens.map((i) => i.id)).toEqual([a.id]);

    const b = evento({ title: 'B' });
    await push(token, [b]);
    const p3 = await pull(token, p1.cursor);
    expect(p3.itens.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('linha fora da janela não volta; alterada depois do cursor, volta', async () => {
    const { token, userId } = await env.admin.criarConta('Janela');
    const velho = evento({ title: 'velho' });
    await push(token, [velho]);
    // Envelhece o carimbo do servidor, como se a escrita fosse de horas atrás.
    await dono.query('alter table items disable trigger items_carimbar_servidor');
    await dono.query(
      `update items set server_updated_at = now() - interval '1 hour' where user_id = $1`,
      [userId],
    );
    await dono.query('alter table items enable trigger items_carimbar_servidor');

    const { cursor } = await pull(token);
    expect((await pull(token, cursor)).itens).toHaveLength(0);

    const editado = { ...velho, title: 'editado', updatedAt: mais(velho.updatedAt, 1000) };
    await push(token, [editado]);
    const p = await pull(token, cursor);
    expect(p.itens.map((i) => i.title)).toEqual(['editado']);
  });

  it('o cursor vem do relógio do banco, não do client', async () => {
    const { token } = await env.admin.criarConta('Relógio');
    const { cursor } = await pull(token);
    const r = await dono.query(`select abs(extract(epoch from (now() - $1::timestamptz))) as d`, [
      cursor,
    ]);
    expect(Number(r.rows[0].d)).toBeLessThan(5);
    expect(cursor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it('cursor inválido → 400', async () => {
    const { token } = await env.admin.criarConta('Cursor ruim');
    const r = await env.app.request('/sync/pull?cursor=1', comToken(token));
    expect(r.status).toBe(400);
  });

  it('não devolve itens de outra conta', async () => {
    const a = await env.admin.criarConta('Isolado A');
    const b = await env.admin.criarConta('Isolado B');
    await push(a.token, [evento({ id: novoId() })]);
    expect((await pull(b.token)).itens).toHaveLength(0);
  });
});
