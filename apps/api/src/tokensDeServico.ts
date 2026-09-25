import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { hashDoToken, type VariaveisAutenticadas } from './auth';

export const ESCOPOS = ['agenda:read', 'agenda:write'] as const;

const esquemaNovo = z
  .object({
    label: z.string().trim().min(1, { error: 'dê um nome ao token' }).max(100),
    scopes: z
      .array(z.enum(ESCOPOS))
      .min(1, { error: 'escolha ao menos um escopo' })
      .default([...ESCOPOS]),
  })
  .strict();

/**
 * Tokens de serviço (ADR-0012): gerados e revogados no app, com a sessão do aparelho. O token em
 * claro aparece uma vez, na resposta do POST; o banco guarda só o SHA-256, como os de sessão.
 */
export function rotasDeTokensDeServico() {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.get('/service-tokens', async (c) =>
    c.json(await c.var.transacao((r) => r.acesso.tokensDeServico())),
  );

  rotas.post(
    '/service-tokens',
    bodyLimit({ maxSize: 4096, onError: (c) => c.json({ erro: 'corpo grande demais' }, 413) }),
    async (c) => {
      const corpo = esquemaNovo.safeParse(await c.req.json().catch(() => null));
      if (!corpo.success) {
        return c.json({ erro: corpo.error.issues[0]?.message ?? 'payload inválido' }, 400);
      }
      const escopos = [...new Set(corpo.data.scopes)].sort();
      const token = randomBytes(32).toString('base64url');
      const id = await c.var.transacao((r) =>
        r.acesso.emitirTokenDeServico(hashDoToken(token), corpo.data.label, escopos),
      );
      if (!id) return c.json({ erro: 'limite de 10 tokens de serviço ativos' }, 409);
      const lista = await c.var.transacao((r) => r.acesso.tokensDeServico());
      return c.json({ ...lista.find((t) => t.id === id)!, token }, 201);
    },
  );

  rotas.delete('/service-tokens/:id', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return c.json({ erro: 'token não encontrado' }, 404);
    const ok = await c.var.transacao((r) => r.acesso.revogarTokenDeServico(id));
    return ok ? c.body(null, 204) : c.json({ erro: 'token não encontrado' }, 404);
  });

  return rotas;
}
