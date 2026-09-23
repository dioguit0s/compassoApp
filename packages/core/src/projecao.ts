/**
 * Projeção da agenda: itens simples + séries expandidas + desvios de ocorrência → uma lista de
 * entradas num intervalo. A MESMA função roda na API (`GET /agenda`) e no app offline — a regra
 * não pode existir em duas versões (especificação §6.3 e §6.6, roadmap F3).
 */
import { itemNoIntervalo, type ItemDeAgenda } from './agenda';
import type { Dia } from './calendario';
import { FUSO_PADRAO } from './calendario';
import { ehOcorrencia, ocorrencias } from './rrule';

export interface ItemParaProjecao extends ItemDeAgenda {
  notes: string | null;
  rrule: string | null;
  timezone: string;
  recurrenceEndsAt: Date | null;
  reminderMinutesBefore: number | null;
  courseId: string | null;
  postponeCount: number;
  deletedAt: Date | null;
}

export interface DesvioParaProjecao {
  itemId: string;
  occurrenceDate: Dia;
  type: 'completed' | 'cancelled' | 'moved' | 'edited';
  status: 'open' | 'done';
  startAt: Date | null;
  endAt: Date | null;
  titleOverride: string | null;
  notesOverride: string | null;
  deletedAt: Date | null;
}

export interface EntradaAgenda extends ItemDeAgenda {
  /** Chave única da entrada: `itemId` para item simples, `itemId@AAAA-MM-DD` para ocorrência. */
  id: string;
  itemId: string;
  /** Data original da ocorrência na série; null para item simples. */
  ocorrencia: Dia | null;
  notes: string | null;
  reminderMinutesBefore: number | null;
  /** Disciplina ligada (prova, trabalho) — o selo na interface. */
  courseId: string | null;
  /** Quantas vezes foi adiado — exibido sem julgamento (§4.7). */
  postponeCount: number;
  /** Ocorrência movida ou editada em relação à regra. */
  desviada: boolean;
}

function inicioDoItem(i: ItemDeAgenda): Date | null {
  return i.kind === 'task' ? i.dueAt : i.startAt;
}

export function projetarAgenda(
  itens: ItemParaProjecao[],
  desvios: DesvioParaProjecao[],
  de: Date,
  ate: Date,
): EntradaAgenda[] {
  const saida: EntradaAgenda[] = [];
  const desviosPorItem = new Map<string, Map<Dia, DesvioParaProjecao>>();
  for (const d of desvios) {
    if (d.deletedAt) continue;
    let m = desviosPorItem.get(d.itemId);
    if (!m) desviosPorItem.set(d.itemId, (m = new Map()));
    m.set(d.occurrenceDate, d);
  }

  for (const item of itens) {
    if (item.deletedAt) continue;
    if (!item.rrule) {
      if (itemNoIntervalo(item, de, ate)) {
        saida.push({
          ...base(item),
          id: item.id,
          itemId: item.id,
          ocorrencia: null,
          desviada: false,
        });
      }
      continue;
    }

    const inicio = inicioDoItem(item);
    if (!inicio) continue;
    const fim = item.kind === 'event' ? item.endAt : null;
    const duracaoMs = fim && fim > inicio ? fim.getTime() - inicio.getTime() : 0;
    const serie = { rrule: item.rrule, inicio, duracaoMs, fuso: item.timezone || FUSO_PADRAO };
    const meusDesvios = desviosPorItem.get(item.id) ?? new Map<Dia, DesvioParaProjecao>();

    // Posições originais no intervalo, mais ocorrências movidas de fora para dentro dele.
    const candidatas = new Map<Dia, { inicio: Date; fim: Date | null }>();
    const encerrada = item.recurrenceEndsAt !== null && item.recurrenceEndsAt < de;
    if (!encerrada) {
      for (const o of ocorrencias(serie, de, ate)) candidatas.set(o.data, o);
    }
    for (const [data, d] of meusDesvios) {
      if (!candidatas.has(data) && d.startAt && ehOcorrencia(serie, data)) {
        candidatas.set(data, { inicio: d.startAt, fim: d.endAt });
      }
    }

    for (const [data, original] of candidatas) {
      const d = meusDesvios.get(data);
      if (d?.type === 'cancelled') continue;
      const ini = d?.startAt ?? original.inicio;
      const fimOc = d?.startAt ? d.endAt : original.fim;
      const entrada: EntradaAgenda = {
        ...base(item),
        id: `${item.id}@${data}`,
        itemId: item.id,
        ocorrencia: data,
        title: d?.titleOverride ?? item.title,
        notes: d?.notesOverride ?? item.notes,
        status: d?.status ?? 'open',
        dueAt: item.kind === 'task' ? ini : null,
        startAt: item.kind === 'event' ? ini : null,
        endAt: item.kind === 'event' ? fimOc : null,
        desviada:
          !!d && (d.startAt !== null || d.titleOverride !== null || d.notesOverride !== null),
      };
      if (itemNoIntervalo(entrada, de, ate)) saida.push(entrada);
    }
  }

  return saida.sort(
    (a, b) =>
      (inicioDoItem(a)?.getTime() ?? 0) - (inicioDoItem(b)?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

function base(item: ItemParaProjecao) {
  return {
    title: item.title,
    kind: item.kind,
    effort: item.effort,
    allDay: item.allDay,
    dueAt: item.dueAt,
    startAt: item.startAt,
    endAt: item.endAt,
    status: item.status,
    notes: item.notes,
    reminderMinutesBefore: item.reminderMinutesBefore,
    courseId: item.courseId,
    postponeCount: item.postponeCount,
  };
}

/** Forma JSON estável de uma entrada — o que `GET /agenda` devolve e o teste de paridade compara. */
export function entradaParaJson(e: EntradaAgenda) {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: e.id,
    itemId: e.itemId,
    ocorrencia: e.ocorrencia,
    title: e.title,
    notes: e.notes,
    kind: e.kind,
    effort: e.effort,
    allDay: e.allDay,
    dueAt: iso(e.dueAt),
    startAt: iso(e.startAt),
    endAt: iso(e.endAt),
    status: e.status,
    desviada: e.desviada,
    reminderMinutesBefore: e.reminderMinutesBefore,
    courseId: e.courseId,
    postponeCount: e.postponeCount,
  };
}
export type EntradaAgendaJson = ReturnType<typeof entradaParaJson>;
