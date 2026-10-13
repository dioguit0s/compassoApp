import {
  diaDe,
  FUSO_PADRAO,
  instantesDaAula,
  partesNoFuso,
  type Aula,
  type Dia,
  type EntradaAgenda,
} from '@compasso/core';
import type { LinhaItem } from '../db/repositorios';

/**
 * Forma enxuta dos itens na /api/v1 (ADR-0012): só o que a Luna precisa para falar. Todo
 * instante sai em ISO 8601 com o deslocamento de São Paulo (`-03:00`), nunca em UTC; dia inteiro
 * sai só com a data.
 */

export const TAMANHO_DO_TITULO = 200;

const d2 = (n: number) => String(n).padStart(2, '0');

/** `2026-09-26T14:00:00-03:00`: o instante na hora de parede do fuso, com o deslocamento. */
export function isoComFuso(instante: Date, fuso: string = FUSO_PADRAO): string {
  const t = instante.getTime();
  const p = partesNoFuso(instante, fuso);
  const minutoLocal = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  const deslocamentoMin = Math.round((minutoLocal - Math.floor(t / 60_000) * 60_000) / 60_000);
  const local = new Date(t + deslocamentoMin * 60_000);
  const sinal = deslocamentoMin < 0 ? '-' : '+';
  const abs = Math.abs(deslocamentoMin);
  return (
    `${local.getUTCFullYear()}-${d2(local.getUTCMonth() + 1)}-${d2(local.getUTCDate())}` +
    `T${d2(local.getUTCHours())}:${d2(local.getUTCMinutes())}:${d2(local.getUTCSeconds())}` +
    `${sinal}${d2(Math.floor(abs / 60))}:${d2(abs % 60)}`
  );
}

/**
 * Título pronto para entrar no contexto do modelo: sem caracteres de controle, espaços
 * colapsados e no máximo 200 caracteres. Itens importados de ICS podem ter títulos longos.
 */
export function tituloLimpo(titulo: string): string {
  const t = titulo
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > TAMANHO_DO_TITULO ? `${t.slice(0, TAMANHO_DO_TITULO - 1)}…` : t;
}

export const TAMANHO_DA_NOTA = 2000;

/**
 * Observações prontas para o contexto do modelo: texto puro, quebras de linha preservadas, sem
 * outros caracteres de controle e no máximo 2000 caracteres. Vazia vira `null`.
 */
export function notaLimpa(notas: string | null): string | null {
  if (notas === null) return null;
  const t = notas
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .trim();
  if (!t) return null;
  return t.length > TAMANHO_DA_NOTA ? `${t.slice(0, TAMANHO_DA_NOTA - 1)}…` : t;
}

interface Base {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  location: string | null;
  recurring: boolean;
  occurrence_date: Dia | null;
}
/**
 * O que só evento e tarefa têm: as observações (`notes`, texto puro ou `null`) e os lembretes, em
 * minutos antes do início ou do prazo (ADR-0018); `[]` = sem lembrete.
 */
interface ComLembretes {
  notes: string | null;
  reminders_minutes_before: number[];
}
export type EventoV1 = Base & ComLembretes & { type: 'event' };
export type AulaV1 = Base & {
  type: 'class';
  subject: string;
  professor: string | null;
  cancelled: boolean;
};
export type TarefaV1 = Base & ComLembretes & { type: 'task'; due: string | null; done: boolean };
export type ItemV1 = EventoV1 | AulaV1 | TarefaV1;

/** O que os formatadores precisam de um item, venha da tabela ou da projeção da agenda. */
interface Fonte {
  itemId: string;
  title: string;
  allDay: boolean;
  dueAt: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  status: 'open' | 'done';
  ocorrencia: Dia | null;
  recorrente: boolean;
  lembretes: number[];
  notes: string | null;
}

export const deLinha = (l: LinhaItem): Fonte => ({
  itemId: l.id,
  title: l.title,
  allDay: l.allDay,
  dueAt: l.dueAt,
  startAt: l.startAt,
  endAt: l.endAt,
  status: l.status,
  ocorrencia: null,
  recorrente: l.rrule !== null,
  lembretes: l.remindersMinutesBefore,
  notes: l.notes,
});

export const deEntrada = (e: EntradaAgenda): Fonte => ({
  itemId: e.itemId,
  title: e.title,
  allDay: e.allDay,
  dueAt: e.dueAt,
  startAt: e.startAt,
  endAt: e.endAt,
  status: e.status,
  ocorrencia: e.ocorrencia,
  recorrente: e.ocorrencia !== null,
  lembretes: e.remindersMinutesBefore,
  // Numa ocorrência editada, a nota é a dela (`notesOverride`), já resolvida pela projeção.
  notes: e.notes,
});

/**
 * Evento. Dia inteiro: `start` e `end` são datas e `end` é o ÚLTIMO dia, inclusive (no banco o
 * fim é a meia-noite do dia seguinte, ADR-0003) — "de sexta a domingo" sai como sexta e domingo.
 */
export function eventoV1(f: Fonte): EventoV1 {
  const inicio = f.startAt!;
  let start: string;
  let end: string | null;
  if (f.allDay) {
    start = diaDe(inicio);
    end = f.endAt && f.endAt > inicio ? diaDe(new Date(f.endAt.getTime() - 1)) : start;
  } else {
    start = isoComFuso(inicio);
    end = f.endAt ? isoComFuso(f.endAt) : null;
  }
  return {
    id: f.itemId,
    type: 'event',
    title: tituloLimpo(f.title),
    start,
    end,
    all_day: f.allDay,
    location: null,
    recurring: f.recorrente,
    occurrence_date: f.ocorrencia,
    notes: notaLimpa(f.notes),
    reminders_minutes_before: f.lembretes,
  };
}

/** Tarefa. `start` repete o prazo para a agenda ordenar tudo por um campo só. */
export function tarefaV1(f: Fonte): TarefaV1 {
  const due = f.dueAt ? (f.allDay ? diaDe(f.dueAt) : isoComFuso(f.dueAt)) : null;
  return {
    id: f.itemId,
    type: 'task',
    title: tituloLimpo(f.title),
    start: due,
    end: null,
    all_day: f.dueAt ? f.allDay : false,
    location: null,
    recurring: f.recorrente,
    occurrence_date: f.ocorrencia,
    notes: notaLimpa(f.notes),
    reminders_minutes_before: f.lembretes,
    due,
    done: f.status === 'done',
  };
}

/** Aula projetada da grade: `id` é o do horário semanal (a "série"), a data vem à parte. */
export function aulaV1(a: Aula): AulaV1 {
  const { inicio, fim } = instantesDaAula(a);
  return {
    id: a.slotId,
    type: 'class',
    title: tituloLimpo(a.disciplina),
    start: isoComFuso(inicio),
    end: isoComFuso(fim),
    all_day: false,
    location: a.sala ? tituloLimpo(a.sala) : null,
    recurring: true,
    occurrence_date: a.dia,
    subject: tituloLimpo(a.disciplina),
    professor: a.professor ? tituloLimpo(a.professor) : null,
    cancelled: a.cancelada,
  };
}
