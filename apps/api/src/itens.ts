import { entradaParaJson } from '@compasso/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { VariaveisAutenticadas } from './auth';
import { ErroDeOcorrencia, type MudancaDeOcorrencia } from './db/repositorios';

const dataOc = z.iso.date();
const instante = z.iso.datetime({ offset: true });

const esquemaAlteracao = z
  .object({
    startAt: instante.nullable().optional(),
    endAt: instante.nullable().optional(),
    titleOverride: z.string().trim().min(1).max(500).nullable().optional(),
    notesOverride: z.string().max(20_000).nullable().optional(),
  })
  .refine((m) => Object.keys(m).length > 0, 'nada para alterar');

/**
 * Rotas de ocorrência (especificação §6.3) e `GET /agenda`. O app usa o sync para as mesmas
 * operações; estas rotas existem para quem fala com a API direto e para o teste de paridade.
 */
export function rotasDeItens() {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.onError((erro, c) => {
    if (erro instanceof ErroDeOcorrencia) return c.json({ erro: erro.message }, erro.status);
    throw erro;
  });

  const validarData = (valor: string) => dataOc.safeParse(valor).success;

  rotas.post('/items/:id/occurrences/:date/complete', async (c) => {
    const { id, date } = c.req.param();
    if (!validarData(date)) return c.json({ erro: 'data inválida' }, 400);
    return c.json(await c.var.transacao((r) => r.ocorrencias.registrar(id, date, 'complete')));
  });

  rotas.post('/items/:id/occurrences/:date/cancel', async (c) => {
    const { id, date } = c.req.param();
    if (!validarData(date)) return c.json({ erro: 'data inválida' }, 400);
    return c.json(await c.var.transacao((r) => r.ocorrencias.registrar(id, date, 'cancel')));
  });

  rotas.patch('/items/:id/occurrences/:date', async (c) => {
    const { id, date } = c.req.param();
    if (!validarData(date)) return c.json({ erro: 'data inválida' }, 400);
    const corpo = esquemaAlteracao.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: 'payload inválido', detalhes: corpo.error.issues }, 400);
    const m: MudancaDeOcorrencia = {};
    for (const [k, v] of Object.entries(corpo.data)) {
      (m as Record<string, unknown>)[k] =
        (k === 'startAt' || k === 'endAt') && typeof v === 'string' ? new Date(v) : v;
    }
    if (m.endAt && (!m.startAt || m.endAt < m.startAt)) {
      return c.json({ erro: 'fim precisa de início e não pode ser anterior a ele' }, 400);
    }
    return c.json(await c.var.transacao((r) => r.ocorrencias.registrar(id, date, 'alterar', m)));
  });

  rotas.get('/agenda', async (c) => {
    const de = instante.safeParse(c.req.query('from'));
    const ate = instante.safeParse(c.req.query('to'));
    if (!de.success || !ate.success) {
      return c.json({ erro: 'from e to são obrigatórios, em ISO 8601 com fuso' }, 400);
    }
    const inicio = new Date(de.data);
    const fim = new Date(ate.data);
    if (fim <= inicio || fim.getTime() - inicio.getTime() > 400 * 86_400_000) {
      return c.json({ erro: 'intervalo precisa ter entre 1 ms e 400 dias' }, 400);
    }
    const entradas = await c.var.transacao((r) => r.agenda.projetar(inicio, fim));
    return c.json({ entradas: entradas.map(entradaParaJson) });
  });

  return rotas;
}
