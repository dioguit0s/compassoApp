import { esquemaPush, type RespostaPull, type RespostaPush } from '@compasso/core';
import { z } from 'zod';
import { Hono } from 'hono';
import type { VariaveisAutenticadas } from './auth';
import type { Config } from './config';

/** O cursor é o que o próprio pull devolveu: ISO 8601 com fuso, precisão de microssegundos. */
const cursorValido = z.iso.datetime({ offset: true });

/** Protocolo de sincronização (especificação §6.6). Só `items` na F1. */
export function rotasDeSync(config: Config) {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.post('/push', async (c) => {
    const corpo = esquemaPush.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) {
      return c.json({ erro: 'payload inválido', detalhes: corpo.error.issues }, 400);
    }
    const resposta: RespostaPush = await c.var.transacao((r) =>
      r.itens.aplicarPush(corpo.data.itens),
    );
    return c.json(resposta);
  });

  rotas.get('/pull', async (c) => {
    const cursor = c.req.query('cursor') || null;
    if (cursor !== null && !cursorValido.safeParse(cursor).success) {
      return c.json({ erro: 'cursor inválido' }, 400);
    }
    const { itens, cursor: novo } = await c.var.transacao((r) =>
      r.itens.alteradosDesde(cursor, config.syncCursorWindowSeconds),
    );
    const resposta: RespostaPull = {
      itens,
      cursor: novo,
      retencaoDias: config.trashRetentionDays,
    };
    return c.json(resposta);
  });

  return rotas;
}
