import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';
import { z } from 'zod';
import { serializarUsuario } from './serializar';
import type { VariaveisAutenticadas } from './auth';
import type { Config } from './config';
import { ErroDeOcorrencia } from './db/repositorios';

const esquemaMe = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    defaultReminderMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  })
  .strict();

/** Nome de arquivo aleatório: não enumera contas, não sobrescreve outra, e troca a URL (cache). */
export const ARQUIVO_AVATAR = /^[0-9a-f-]{36}\.jpg$/;
const FORMATOS_ACEITOS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

/**
 * Perfil (especificação §6.3, §7): `PATCH /me`, `PUT`/`DELETE /me/avatar`, lixeira.
 * A foto é redimensionada para 256px no servidor, sem metadados (EXIF/GPS), e salva como um
 * arquivo em `AVATAR_DIR`, servido pela própria API em `/avatares/` (`app.ts`, ADR-0011).
 */
export function rotasDePerfil(config: Config) {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();
  rotas.onError((erro, c) => {
    if (erro instanceof ErroDeOcorrencia) return c.json({ erro: erro.message }, erro.status);
    throw erro;
  });

  rotas.patch('/me', async (c) => {
    const corpo = esquemaMe.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: 'payload inválido', detalhes: corpo.error.issues }, 400);
    const u = await c.var.transacao((r) => r.usuarios.editar(corpo.data));
    return c.json(serializarUsuario(u));
  });

  rotas.put(
    '/me/avatar',
    bodyLimit({
      maxSize: config.avatarMaxBytes + 64 * 1024,
      onError: (c) =>
        c.json(
          { erro: `imagem maior que ${Math.round(config.avatarMaxBytes / 1024 / 1024)} MB` },
          413,
        ),
    }),
    async (c) => {
      const corpo = await c.req.parseBody().catch(() => null);
      const arquivo = corpo?.['arquivo'];
      if (!arquivo || typeof arquivo === 'string') {
        return c.json({ erro: 'envie a imagem no campo multipart "arquivo"' }, 400);
      }
      if (arquivo.size > config.avatarMaxBytes)
        return c.json({ erro: 'imagem grande demais' }, 413);
      const entrada = Buffer.from(await arquivo.arrayBuffer());
      // O conteúdo decide, não a extensão nem o content-type.
      const meta = await sharp(entrada)
        .metadata()
        .catch(() => null);
      if (!meta?.format || !FORMATOS_ACEITOS.has(meta.format)) {
        return c.json(
          { erro: 'o arquivo não é uma imagem aceita (JPEG, PNG, WebP, HEIC, AVIF)' },
          415,
        );
      }
      const saida = await sharp(entrada)
        .rotate() // aplica a orientação do EXIF antes de descartá-lo
        .resize(256, 256, { fit: 'cover' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer(); // sem withMetadata(): EXIF, GPS e ICC saem
      const nome = `${randomUUID()}.jpg`;
      await mkdir(config.avatarDir, { recursive: true });
      await writeFile(join(config.avatarDir, nome), saida);
      const anterior = await c.var.transacao((r) => r.usuarios.definirAvatar(nome));
      await apagar(config.avatarDir, anterior);
      const u = await c.var.transacao((r) => r.usuarios.atual());
      return c.json(serializarUsuario(u!));
    },
  );

  rotas.delete('/me/avatar', async (c) => {
    const anterior = await c.var.transacao((r) => r.usuarios.definirAvatar(null));
    await apagar(config.avatarDir, anterior);
    const u = await c.var.transacao((r) => r.usuarios.atual());
    return c.json(serializarUsuario(u!));
  });

  rotas.get('/trash', async (c) =>
    c.json(await c.var.transacao((r) => r.lixeira.listar(config.trashRetentionDays))),
  );

  rotas.post('/trash/:id/restore', async (c) =>
    c.json(await c.var.transacao((r) => r.lixeira.restaurar(c.req.param('id')))),
  );

  return rotas;
}

async function apagar(dir: string, nome: string | null): Promise<void> {
  if (nome && ARQUIVO_AVATAR.test(nome)) await rm(join(dir, nome), { force: true });
}
