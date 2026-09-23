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
    const resposta: RespostaPush = await c.var.transacao(async (r) => {
      const semestres = await r.grade.aplicarPush('semestres', d.semestres);
      const disciplinas = await r.grade.aplicarPush('disciplinas', d.disciplinas);
      const horarios = await r.grade.aplicarPush('horarios', d.horarios);
      const excecoes = await r.grade.aplicarPush('excecoes', d.excecoes);
      const itens = await r.itens.aplicarPush(d.itens);
      const ocorrencias = await r.ocorrencias.aplicarPush(d.ocorrencias);
      // Depois de itens e desvios: o evento de conclusão enxerga o item já atualizado.
      const { aplicados, ignorados } = await r.conclusoes.aplicarPush(d.conclusoes);
      // O status volta a ser o do ledger, mesmo que um aparelho desatualizado o tenha
      // sobrescrito pelo LWW (ADR-0006).
      await r.status.derivarDosEnviados(
        d.itens.filter((i) => i.effort !== null && !i.rrule).map((i) => i.id),
        d.ocorrencias,
      );
      return {
        semestres,
        disciplinas,
        horarios,
        excecoes,
        itens,
        ocorrencias,
        conclusoes: { aplicados, ignorados },
      };
    });
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
