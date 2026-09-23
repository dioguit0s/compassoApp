import { esquemaPush, type RespostaPull, type RespostaPush } from '@compasso/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { VariaveisAutenticadas } from './auth';
import type { Config } from './config';

/** O cursor é o que o próprio pull devolveu: ISO 8601 com fuso, precisão de microssegundos. */
const cursorValido = z.iso.datetime({ offset: true });

/** Protocolo de sincronização (especificação §6.6): `items` e `item_occurrences`. */
export function rotasDeSync(config: Config) {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.post('/push', async (c) => {
    const corpo = esquemaPush.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) {
      return c.json({ erro: 'payload inválido', detalhes: corpo.error.issues }, 400);
    }
    // Uma transação, cada tabela depois das que ela referencia (ordem de TABELAS_SYNC).
    const d = corpo.data;
    const resposta: RespostaPush = await c.var.transacao(async (r) => ({
      semestres: await r.grade.aplicarPush('semestres', d.semestres),
      disciplinas: await r.grade.aplicarPush('disciplinas', d.disciplinas),
      horarios: await r.grade.aplicarPush('horarios', d.horarios),
      excecoes: await r.grade.aplicarPush('excecoes', d.excecoes),
      itens: await r.itens.aplicarPush(d.itens),
      ocorrencias: await r.ocorrencias.aplicarPush(d.ocorrencias),
    }));
    return c.json(resposta);
  });

  rotas.get('/pull', async (c) => {
    const cursor = c.req.query('cursor') || null;
    if (cursor !== null && !cursorValido.safeParse(cursor).success) {
      return c.json({ erro: 'cursor inválido' }, 400);
    }
    const r = await c.var.transacao((repos) =>
      repos.sync.alteradosDesde(cursor, config.syncCursorWindowSeconds),
    );
    const resposta: RespostaPull = { ...r, retencaoDias: config.trashRetentionDays };
    return c.json(resposta);
  });

  return rotas;
}
