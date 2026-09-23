/**
 * Grade acadêmica (especificação §5 e §7, ADR-0005). Aula NÃO é item: é dado de referência,
 * projetado para o dia sem gravar nada — não gera XP, não é concluída, não vira ocorrência.
 *
 * Horários são strings `HH:mm` de hora de parede em São Paulo (ADR-0003): a aula das 19:00
 * acontece às 19:00 toda terça, sem timestamp para deslocar na mudança de regra de fuso.
 */
import { z } from 'zod';
import { diaDaSemana, FUSO_PADRAO, instanteDeParede, partesDoDia, type Dia } from './calendario';

export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const hora = z.string().regex(REGEX_HORA, 'horário no formato HH:mm (00:00 a 23:59)');
const dataIso = z.iso.datetime({ offset: true });
const dia = z.iso.date();
const carimbos = {
  deletedAt: dataIso.nullable(),
  createdAt: dataIso,
  updatedAt: dataIso,
};

export const esquemaSemestre = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(100),
    startDate: dia,
    endDate: dia,
    active: z.boolean(),
    ...carimbos,
  })
  .refine((s) => s.endDate >= s.startDate, 'o semestre termina antes de começar');

export const esquemaDisciplina = z.object({
  id: z.uuid(),
  semesterId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  code: z.string().max(50).nullable(),
  professor: z.string().max(200).nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor em #RRGGBB'),
  defaultRoom: z.string().max(100).nullable(),
  notes: z.string().max(20_000).nullable(),
  ...carimbos,
});

export const esquemaHorario = z
  .object({
    id: z.uuid(),
    courseId: z.uuid(),
    weekday: z.number().int().min(0).max(6),
    startTime: hora,
    endTime: hora,
    room: z.string().max(100).nullable(),
    ...carimbos,
  })
  .refine((h) => h.endTime > h.startTime, 'a aula termina antes de começar');

export const TIPOS_EXCECAO = ['cancelled', 'room_change', 'extra'] as const;
export type TipoExcecao = (typeof TIPOS_EXCECAO)[number];

export const esquemaExcecao = z
  .object({
    id: z.uuid(),
    slotId: z.uuid(),
    date: dia,
    type: z.enum(TIPOS_EXCECAO),
    room: z.string().max(100).nullable(),
    note: z.string().max(2000).nullable(),
    /** Só em `extra`: horário da reposição, quando difere do horário regular (ADR-0005). */
    startTime: hora.nullable(),
    endTime: hora.nullable(),
    ...carimbos,
  })
  .superRefine((e, ctx) => {
    for (const m of violacoesDeExcecao(e)) ctx.addIssue({ code: 'custom', message: m });
  });

export function violacoesDeExcecao(e: {
  type: TipoExcecao;
  room: string | null;
  startTime: string | null;
  endTime: string | null;
}): string[] {
  const v: string[] = [];
  if (e.type === 'room_change' && !e.room?.trim()) v.push('troca de sala exige a sala nova');
  if ((e.startTime === null) !== (e.endTime === null)) v.push('horário da reposição incompleto');
  if (e.startTime && e.endTime && e.endTime <= e.startTime)
    v.push('a reposição termina antes de começar');
  if (e.type !== 'extra' && e.startTime) v.push('só aula extra tem horário próprio');
  return v;
}

export type SemestreWire = z.infer<typeof esquemaSemestre>;
export type DisciplinaWire = z.infer<typeof esquemaDisciplina>;
export type HorarioWire = z.infer<typeof esquemaHorario>;
export type ExcecaoWire = z.infer<typeof esquemaExcecao>;

// ---- projeção das aulas ----------------------------------------------------------------------

export interface GradeParaProjecao {
  semestres: {
    id: string;
    label: string;
    startDate: Dia;
    endDate: Dia;
    active: boolean;
    deletedAt: unknown;
  }[];
  disciplinas: {
    id: string;
    semesterId: string;
    name: string;
    code: string | null;
    professor: string | null;
    color: string;
    defaultRoom: string | null;
    deletedAt: unknown;
  }[];
  horarios: {
    id: string;
    courseId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    room: string | null;
    deletedAt: unknown;
  }[];
  excecoes: {
    id: string;
    slotId: string;
    date: Dia;
    type: TipoExcecao;
    room: string | null;
    note: string | null;
    startTime: string | null;
    endTime: string | null;
    deletedAt: unknown;
  }[];
}

export interface Aula {
  /** `slotId@AAAA-MM-DD` — nunca gravado, só chave de interface. */
  id: string;
  slotId: string;
  courseId: string;
  dia: Dia;
  disciplina: string;
  codigo: string | null;
  professor: string | null;
  cor: string;
  inicio: string;
  fim: string;
  sala: string | null;
  /** A sala do dia difere da regular por uma exceção de troca de sala. */
  salaTrocada: boolean;
  cancelada: boolean;
  extra: boolean;
  nota: string | null;
}

/**
 * Semestre que vale para o dia (ADR-0005, decisão da issue #55): o ATIVO cujo intervalo contém o
 * dia. Só um semestre fica ativo por vez; se dois aparelhos ativarem semestres diferentes offline,
 * vale o de início mais recente que contém o dia. Fora do intervalo (férias), nenhum.
 */
export function semestreDoDia(g: GradeParaProjecao, d: Dia) {
  const candidatos = g.semestres.filter(
    (s) => !s.deletedAt && s.active && s.startDate <= d && d <= s.endDate,
  );
  candidatos.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  return candidatos[0] ?? null;
}

/**
 * Aulas de um dia, em ordem de horário. Exceções: cancelada (a aula aparece marcada como tal),
 * troca de sala (sala em destaque), extra (aparece mesmo fora do dia da semana do horário).
 */
export function aulasDoDia(g: GradeParaProjecao, d: Dia): Aula[] {
  const semestre = semestreDoDia(g, d);
  if (!semestre) return [];
  const disciplinas = new Map(
    g.disciplinas.filter((c) => !c.deletedAt && c.semesterId === semestre.id).map((c) => [c.id, c]),
  );
  const horarios = g.horarios.filter((h) => !h.deletedAt && disciplinas.has(h.courseId));
  const excecoesDoDia = g.excecoes.filter((e) => !e.deletedAt && e.date === d);
  const semana = diaDaSemana(d);
  const aulas: Aula[] = [];

  for (const h of horarios) {
    const c = disciplinas.get(h.courseId)!;
    const doSlot = excecoesDoDia.filter((e) => e.slotId === h.id);
    const extra = doSlot.find((e) => e.type === 'extra');
    const regular = h.weekday === semana;
    if (!regular && !extra) continue;
    const cancelada = doSlot.some((e) => e.type === 'cancelled');
    const troca = doSlot.find((e) => e.type === 'room_change');
    const salaBase = h.room ?? c.defaultRoom;
    const sala = troca?.room ?? extra?.room ?? salaBase;
    aulas.push({
      id: `${h.id}@${d}`,
      slotId: h.id,
      courseId: c.id,
      dia: d,
      disciplina: c.name,
      codigo: c.code,
      professor: c.professor,
      cor: c.color,
      inicio: (!regular && extra?.startTime) || h.startTime,
      fim: (!regular && extra?.endTime) || h.endTime,
      sala,
      salaTrocada: !!troca || (!!extra?.room && extra.room !== salaBase),
      cancelada,
      extra: !regular && !!extra,
      nota: doSlot.map((e) => e.note).find((n) => n) ?? null,
    });
  }
  return aulas.sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || a.disciplina.localeCompare(b.disciplina),
  );
}

/** Instantes de início e fim de uma aula (hora de parede em São Paulo). */
export function instantesDaAula(
  a: Pick<Aula, 'dia' | 'inicio' | 'fim'>,
  fuso: string = FUSO_PADRAO,
) {
  const { ano, mes, dia: d } = partesDoDia(a.dia);
  const [hi, mi] = a.inicio.split(':').map(Number);
  const [hf, mf] = a.fim.split(':').map(Number);
  return {
    inicio: instanteDeParede(ano, mes, d, hi!, mi!, fuso),
    fim: instanteDeParede(ano, mes, d, hf!, mf!, fuso),
  };
}

/** Minutos desde a meia-noite de um `HH:mm`. */
export function minutosDeHora(h: string): number {
  const [hh, mm] = h.split(':').map(Number);
  return hh! * 60 + mm!;
}
