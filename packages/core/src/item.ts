import { z } from 'zod';
import { ATRIBUTOS, ESFORCOS } from './atributos';
import {
  esquemaDisciplina,
  esquemaExcecao,
  esquemaHorario,
  esquemaSemestre,
  type DisciplinaWire,
  type ExcecaoWire,
  type HorarioWire,
  type SemestreWire,
} from './grade';
import { esquemaRecompensa, type RecompensaWire, type ResgateWire } from './economia';
import {
  esquemaConclusao,
  type ConclusaoWire,
  type LancamentoWire,
  type MoedaWire,
} from './ledger';
import { esquemaOcorrencia, type OcorrenciaWire } from './ocorrencia';
import { validarRRule } from './rrule';

/**
 * Item no formato de transporte (JSON da sincronização). Datas como ISO 8601 UTC ou null.
 * Espelha a tabela `items` da especificação §5, sem `userId` — ele nunca vem do client — e sem
 * `courseId`, que entra na F5.
 */
const dataIso = z.iso.datetime({ offset: true });
const dataOpcional = dataIso.nullable();

export const esquemaItem = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1, 'título vazio').max(500),
    notes: z.string().max(20_000).nullable(),
    kind: z.enum(['task', 'event']),
    effort: z
      .number()
      .refine(
        (v) => (ESFORCOS as readonly number[]).includes(v),
        'esforço fora da escala 1, 2, 3, 5, 8',
      )
      .nullable(),
    effortLockedAt: dataOpcional,
    primaryAttribute: z.enum(ATRIBUTOS).nullable(),
    secondaryAttribute: z.enum(ATRIBUTOS).nullable(),
    dueAt: dataOpcional,
    startAt: dataOpcional,
    endAt: dataOpcional,
    allDay: z.boolean(),
    timezone: z.string().min(1).max(64),
    rrule: z.string().max(1000).nullable(),
    /** UID de origem na importação de ICS (null para itens nativos). Idempotência da reimportação. */
    sourceUid: z.string().max(1000).nullable().default(null),
    /** Disciplina da prova/trabalho (F5). Null quando não está ligado a nenhuma. */
    courseId: z.uuid().nullable().default(null),
    recurrenceEndsAt: dataOpcional,
    status: z.enum(['open', 'done']),
    completedAt: dataOpcional,
    postponeCount: z.number().int().min(0),
    reminderMinutesBefore: z.number().int().min(0).max(525_600).nullable(),
    deletedAt: dataOpcional,
    createdAt: dataIso,
    updatedAt: dataIso,
  })
  .superRefine((item, ctx) => {
    for (const motivo of violacoesDeInvariante(item))
      ctx.addIssue({ code: 'custom', message: motivo });
  });

export type ItemWire = z.infer<typeof esquemaItem>;

/**
 * Os invariantes da especificação §5 que o PostgreSQL garante com CHECK. Aplicados também no
 * aparelho, antes de gravar, para o erro aparecer na hora e com mensagem legível — e não como
 * uma linha que o servidor recusa na sincronização.
 */
export function violacoesDeInvariante(item: {
  kind: 'task' | 'event';
  effort: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  dueAt: unknown;
  startAt: unknown;
  endAt: unknown;
  timezone: string;
  rrule?: string | null;
  status?: 'open' | 'done';
  completedAt?: unknown;
}): string[] {
  const v: string[] = [];
  const presente = (x: unknown) => x !== null && x !== undefined;

  if (item.kind === 'task') {
    if (presente(item.startAt) || presente(item.endAt)) v.push('tarefa usa prazo, não início/fim');
    if (item.effort === null) v.push('tarefa exige esforço');
  } else {
    if (presente(item.dueAt)) v.push('evento usa início/fim, não prazo');
    if (!presente(item.startAt)) v.push('evento exige início');
    if (!presente(item.startAt) && presente(item.endAt)) v.push('fim sem início');
  }
  if (presente(item.startAt) && presente(item.endAt)) {
    if (new Date(item.endAt as string).getTime() < new Date(item.startAt as string).getTime()) {
      v.push('fim antes do início');
    }
  }
  if ((item.effort === null) !== (item.primaryAttribute === null)) {
    v.push('esforço e atributo principal existem juntos ou não existem');
  }
  if (item.secondaryAttribute !== null && item.primaryAttribute === null) {
    v.push('atributo secundário sem principal');
  }
  if (item.secondaryAttribute !== null && item.secondaryAttribute === item.primaryAttribute) {
    v.push('atributo secundário igual ao principal');
  }
  if (!item.timezone) v.push('fuso horário ausente');
  if (item.rrule) {
    const r = validarRRule(item.rrule, item.timezone || undefined);
    if (!r.valida) v.push(`recorrência inválida: ${r.motivo}`);
    if (!presente(item.kind === 'task' ? item.dueAt : item.startAt)) {
      v.push('série exige data de início');
    }
    // Quem carrega estado numa série é a ocorrência (especificação §5).
    if (item.status === 'done' || presente(item.completedAt)) {
      v.push('série não usa status nem data de conclusão');
    }
  }
  return v;
}

/**
 * Tabelas sincronizadas, NA ORDEM de aplicação no push: quem é referenciado vem antes de quem
 * referencia (semestre → disciplina → horário → exceção; disciplina → item → desvio).
 */
export const TABELAS_SYNC = [
  'semestres',
  'disciplinas',
  'horarios',
  'excecoes',
  'recompensas',
  'itens',
  'ocorrencias',
  'conclusoes',
] as const;
export type TabelaSync = (typeof TABELAS_SYNC)[number];

export const ESQUEMAS_SYNC = {
  semestres: esquemaSemestre,
  disciplinas: esquemaDisciplina,
  horarios: esquemaHorario,
  excecoes: esquemaExcecao,
  recompensas: esquemaRecompensa,
  itens: esquemaItem,
  ocorrencias: esquemaOcorrencia,
  conclusoes: esquemaConclusao,
} as const;

export interface LinhasSync {
  semestres: SemestreWire[];
  disciplinas: DisciplinaWire[];
  horarios: HorarioWire[];
  excecoes: ExcecaoWire[];
  recompensas: RecompensaWire[];
  itens: ItemWire[];
  ocorrencias: OcorrenciaWire[];
  /** Eventos de conclusão (append-only, só inserção). */
  conclusoes: ConclusaoWire[];
}

export function linhasVazias(): LinhasSync {
  return {
    semestres: [],
    disciplinas: [],
    horarios: [],
    excecoes: [],
    recompensas: [],
    itens: [],
    ocorrencias: [],
    conclusoes: [],
  };
}

const lista = <T extends z.ZodType>(e: T) => z.array(e).max(1000).default([]);
export const esquemaPush = z.object({
  semestres: lista(esquemaSemestre),
  disciplinas: lista(esquemaDisciplina),
  horarios: lista(esquemaHorario),
  excecoes: lista(esquemaExcecao),
  recompensas: lista(esquemaRecompensa),
  itens: lista(esquemaItem),
  ocorrencias: lista(esquemaOcorrencia),
  conclusoes: lista(esquemaConclusao),
});
export type RequisicaoPush = z.input<typeof esquemaPush>;

export interface ResultadoDaTabela {
  /** Gravados: a versão do client venceu o LWW (ou a linha não existia). */
  aplicados: string[];
  /** Não gravados: o servidor tem versão igual ou mais nova (o pull traz a dele), ou a linha
   *  depende de algo que não existe mais no servidor. */
  ignorados: string[];
}

export type RespostaPush = Record<TabelaSync, ResultadoDaTabela>;

export interface RespostaPull extends LinhasSync {
  /** Ledger gerado pelo servidor (append-only). O aparelho nunca envia lançamentos. */
  lancamentos: LancamentoWire[];
  moedas: MoedaWire[];
  /** Resgates (append-only, só pelo servidor — o resgate exige rede, ADR-0007). */
  resgates: ResgateWire[];
  /** Relógio do servidor no início da consulta. Opaco para o client. */
  cursor: string;
  /** Prazo da lixeira e da purga de tombstones, em dias. */
  retencaoDias: number;
}
