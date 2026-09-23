import { entradaParaJson, novoId } from '@compasso/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { VariaveisAutenticadas } from './auth';
import { ErroDeOcorrencia, type MudancaDeOcorrencia } from './db/repositorios';

const dataOc = z.iso.date();
const uuid = z.uuid();
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

  /**
   * Concluir/desfazer (§6.3, §6.4): viram um evento de conclusão, o mesmo caminho do sync. A
   * chave de idempotência é o header `Idempotency-Key` (UUID); sem ele, cada chamada é um evento
   * novo — mas ainda assim concluir o concluído não credita de novo (ADR-0006).
   */
  const conclusao =
    (acao: 'complete' | 'uncomplete') =>
    async (c: Context<{ Variables: VariaveisAutenticadas }>) => {
      const { id, date } = c.req.param() as { id: string; date?: string };
      if (date !== undefined && !validarData(date)) return c.json({ erro: 'data inválida' }, 400);
      const chave = c.req.header('idempotency-key') ?? novoId();
      if (!uuid.safeParse(chave).success)
        return c.json({ erro: 'Idempotency-Key precisa ser um UUID' }, 400);
      const agora = new Date().toISOString();
      const resultado = await c.var.transacao(async (r) => {
        const item = await r.itens.obterLinha(id);
        if (!item) throw new ErroDeOcorrencia(404, 'item não encontrado');
        if (acao === 'complete' && item.effort === null) {
          throw new ErroDeOcorrencia(409, 'compromisso sem esforço não é concluível');
        }
        const { efeitos } = await r.conclusoes.aplicarPush([
          {
            id: chave,
            itemId: id,
            occurrenceDate: date ?? null,
            action: acao,
            at: agora,
            createdAt: agora,
            updatedAt: agora,
          },
        ]);
        const efeito = efeitos.get(chave);
        return {
          conclusao: chave,
          efeito: efeito
            ? efeito.tipo === 'nada'
              ? `nada: ${efeito.motivo}`
              : efeito.tipo
            : 'repetido',
          lancamentos: await r.conclusoes.lancamentosDaConclusao(chave),
        };
      });
      if (
        resultado.efeito.startsWith('nada: data não é') ||
        resultado.efeito.startsWith('nada: série')
      ) {
        return c.json({ erro: resultado.efeito.slice(6) }, 422);
      }
      return c.json(resultado);
    };
  rotas.post('/items/:id/complete', conclusao('complete'));
  rotas.post('/items/:id/uncomplete', conclusao('uncomplete'));
  rotas.post('/items/:id/occurrences/:date/complete', conclusao('complete'));
  rotas.post('/items/:id/occurrences/:date/uncomplete', conclusao('uncomplete'));

  rotas.patch('/items/:id', async (c) => {
    const corpo = await c.req.json().catch(() => null);
    if (!corpo || typeof corpo !== 'object') return c.json({ erro: 'payload inválido' }, 400);
    const permitidos = [
      'title',
      'notes',
      'kind',
      'effort',
      'primaryAttribute',
      'secondaryAttribute',
      'dueAt',
      'startAt',
      'endAt',
      'allDay',
      'rrule',
      'reminderMinutesBefore',
      'courseId',
    ];
    const m = Object.fromEntries(Object.entries(corpo).filter(([k]) => permitidos.includes(k)));
    return c.json(await c.var.transacao((r) => r.itens.editar(c.req.param('id'), m)));
  });

  rotas.post('/items/:id/postpone', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { para?: string };
    let para: Date;
    if (corpo.para !== undefined) {
      if (!instante.safeParse(corpo.para).success) return c.json({ erro: 'para inválido' }, 400);
      para = new Date(corpo.para);
    } else {
      const item = await c.var.transacao((r) => r.itens.obterLinha(c.req.param('id')));
      if (!item) return c.json({ erro: 'item não encontrado' }, 404);
      const inicio = (item.kind === 'task' ? item.dueAt : item.startAt) ?? new Date();
      para = new Date(inicio.getTime() + 86_400_000); // padrão: amanhã, mesma hora
    }
    return c.json(await c.var.transacao((r) => r.itens.adiar(c.req.param('id'), para)));
  });

  rotas.get('/stats/attributes', async (c) =>
    c.json({ atributos: await c.var.transacao((r) => r.estatisticas.atributos()) }),
  );

  rotas.get('/wallet', async (c) =>
    c.json({ saldo: await c.var.transacao((r) => r.estatisticas.saldo()) }),
  );

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
    const { entradas, aulas } = await c.var.transacao(async (r) => ({
      entradas: await r.agenda.projetar(inicio, fim),
      aulas: await r.agenda.aulas(inicio, fim),
    }));
    return c.json({ entradas: entradas.map(entradaParaJson), aulas });
  });

  return rotas;
}
