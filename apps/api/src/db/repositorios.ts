import {
  aulasDoDia,
  deveCongelar,
  efeitoDaConclusao,
  FUSO_PADRAO,
  medidasDoRadar,
  type ConclusaoWire,
  type EfeitoDaConclusao,
  type LancamentoWire,
  type MoedaWire,
  diaDe,
  somarDias,
  type Aula,
  type LinhasSync,
  ESQUEMAS_SYNC,
  esquemaItem,
  ehOcorrencia,
  fimDaSerie,
  novoId,
  projetarAgenda,
  type EntradaAgenda,
  type ItemWire,
  type OcorrenciaWire,
  type ResultadoDaTabela,
  type Serie,
} from '@compasso/core';
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { PlanoDeImportacao } from '../ics';
import type { Tx } from './banco';
import {
  classExceptions,
  classSlots,
  coinEntries,
  completions,
  courses,
  itemOccurrences,
  items,
  semesters,
  users,
  xpEntries,
} from './schema';

export type Usuario = typeof users.$inferSelect;
type LinhaItem = typeof items.$inferSelect;
type LinhaOcorrencia = typeof itemOccurrences.$inferSelect;

const paraData = (v: string | null) => (v === null ? null : new Date(v));
const paraIso = (v: Date | null) => (v === null ? null : v.toISOString());

function itemParaWire(l: LinhaItem): ItemWire {
  return {
    id: l.id,
    title: l.title,
    notes: l.notes,
    kind: l.kind,
    effort: l.effort,
    effortLockedAt: paraIso(l.effortLockedAt),
    primaryAttribute: l.primaryAttribute,
    secondaryAttribute: l.secondaryAttribute,
    dueAt: paraIso(l.dueAt),
    startAt: paraIso(l.startAt),
    endAt: paraIso(l.endAt),
    allDay: l.allDay,
    timezone: l.timezone,
    rrule: l.rrule,
    sourceUid: l.sourceUid,
    courseId: l.courseId,
    recurrenceEndsAt: paraIso(l.recurrenceEndsAt),
    status: l.status,
    completedAt: paraIso(l.completedAt),
    postponeCount: l.postponeCount,
    reminderMinutesBefore: l.reminderMinutesBefore,
    deletedAt: paraIso(l.deletedAt),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function serieDaLinha(l: {
  kind: 'task' | 'event';
  dueAt: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  rrule: string | null;
  timezone: string;
}): Serie | null {
  const inicio = l.kind === 'task' ? l.dueAt : l.startAt;
  if (!l.rrule || !inicio) return null;
  const fim = l.kind === 'event' ? l.endAt : null;
  return {
    rrule: l.rrule,
    inicio,
    duracaoMs: fim && fim > inicio ? fim.getTime() - inicio.getTime() : 0,
    fuso: l.timezone,
  };
}

function wireParaLinha(w: ItemWire, userId: string) {
  const linha = {
    ...w,
    userId,
    effortLockedAt: paraData(w.effortLockedAt),
    dueAt: paraData(w.dueAt),
    startAt: paraData(w.startAt),
    endAt: paraData(w.endAt),
    recurrenceEndsAt: null as Date | null,
    completedAt: paraData(w.completedAt),
    deletedAt: paraData(w.deletedAt),
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
  };
  // Desnormalizado, então o servidor recalcula em vez de confiar no client.
  const serie = serieDaLinha(linha);
  linha.recurrenceEndsAt = serie ? fimDaSerie(serie) : null;
  // Congelamento preguiçoso também no servidor (ADR-0006): o dia chegou, o esforço trava.
  if (deveCongelar(linha, diaDe(new Date(), FUSO_PADRAO))) linha.effortLockedAt = new Date();
  return linha;
}

function ocorrenciaParaWire(l: LinhaOcorrencia): OcorrenciaWire {
  return {
    id: l.id,
    itemId: l.itemId,
    occurrenceDate: l.occurrenceDate,
    type: l.type,
    status: l.status,
    completedAt: paraIso(l.completedAt),
    startAt: paraIso(l.startAt),
    endAt: paraIso(l.endAt),
    titleOverride: l.titleOverride,
    notesOverride: l.notesOverride,
    deletedAt: paraIso(l.deletedAt),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * No conflito, todas as colunas vêm do client — menos a identidade, `user_id` (nunca muda de
 * dono) e `server_updated_at` (o trigger preenche).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function colunasDoConflito(tabela: any, fixas: string[]) {
  return Object.fromEntries(
    Object.keys(getTableColumns(tabela))
      .filter((k) => ![...fixas, 'userId', 'serverUpdatedAt'].includes(k))
      .map((k) => [k, sql.raw(`excluded."${snake(k)}"`)]),
  );
}
/**
 * Esforço congelado não muda mais, nem a distribuição entre atributos (§4.1): no conflito, se a
 * linha do servidor já tem `effort_locked_at`, esses campos ficam os do servidor, e o
 * congelamento nunca é desfeito. `status`/`completed_at` são derivados do ledger depois
 * (ADR-0006), então o valor do client aqui é só provisório.
 */
const conflitoItens = {
  ...colunasDoConflito(items, ['id']),
  effort: sql.raw(
    `case when "items"."effort_locked_at" is not null then "items"."effort" else excluded."effort" end`,
  ),
  primaryAttribute: sql.raw(
    `case when "items"."effort_locked_at" is not null then "items"."primary_attribute" else excluded."primary_attribute" end`,
  ),
  secondaryAttribute: sql.raw(
    `case when "items"."effort_locked_at" is not null then "items"."secondary_attribute" else excluded."secondary_attribute" end`,
  ),
  effortLockedAt: sql.raw(`coalesce("items"."effort_locked_at", excluded."effort_locked_at")`),
};
const conflitoOcorrencias = colunasDoConflito(itemOccurrences, ['id', 'itemId', 'occurrenceDate']);

/** A regra de `itemNoIntervalo` do core, em SQL. */
function simplesNoIntervalo(de: Date, ate: Date) {
  const tarefa = and(eq(items.kind, 'task'), gte(items.dueAt, de), lt(items.dueAt, ate));
  const evento = and(
    eq(items.kind, 'event'),
    lt(items.startAt, ate),
    or(
      and(isNotNull(items.endAt), gt(items.endAt, items.startAt), gt(items.endAt, de)),
      and(or(isNull(items.endAt), lte(items.endAt, items.startAt)), gte(items.startAt, de)),
    ),
  );
  return or(tarefa, evento);
}

type TabelaGrade = 'semestres' | 'disciplinas' | 'horarios' | 'excecoes';
export const TABELAS_DA_GRADE: TabelaGrade[] = ['semestres', 'disciplinas', 'horarios', 'excecoes'];

/** Cada tabela da grade, e a tabela-pai que precisa existir (na mesma conta) para a linha entrar. */
const GRADE = {
  semestres: { tabela: semesters, pai: null },
  disciplinas: { tabela: courses, pai: { tabela: semesters, coluna: 'semesterId' as const } },
  horarios: { tabela: classSlots, pai: { tabela: courses, coluna: 'courseId' as const } },
  excecoes: { tabela: classExceptions, pai: { tabela: classSlots, coluna: 'slotId' as const } },
};
const conflitoGrade = Object.fromEntries(
  TABELAS_DA_GRADE.map((t) => [t, colunasDoConflito(GRADE[t].tabela as never, ['id'])]),
) as Record<TabelaGrade, Record<string, unknown>>;

const CARIMBOS = ['deletedAt', 'createdAt', 'updatedAt'] as const;

function gradeParaWire(l: Record<string, unknown>): Record<string, unknown> {
  const { userId: _u, serverUpdatedAt: _s, ...resto } = l;
  for (const c of CARIMBOS)
    resto[c] = resto[c] instanceof Date ? (resto[c] as Date).toISOString() : null;
  return resto;
}

function wireParaGrade(w: Record<string, unknown>, userId: string): Record<string, unknown> {
  const l: Record<string, unknown> = { ...w, userId };
  for (const c of CARIMBOS) l[c] = w[c] ? new Date(w[c] as string) : null;
  return l;
}

function somaPorAtributoNaoZero(xp: { attribute: string; points: number }[]): boolean {
  const m = new Map<string, number>();
  for (const x of xp) m.set(x.attribute, (m.get(x.attribute) ?? 0) + x.points);
  return [...m.values()].some((v) => v !== 0);
}

function conclusaoParaWire(c: typeof completions.$inferSelect): ConclusaoWire {
  return {
    id: c.id,
    itemId: c.itemId,
    occurrenceDate: c.occurrenceDate,
    action: c.action,
    at: c.at.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.createdAt.toISOString(),
  };
}

function lancamentoParaWire(l: typeof xpEntries.$inferSelect): LancamentoWire {
  return {
    id: l.id,
    itemId: l.itemId,
    occurrenceDate: l.occurrenceDate,
    completionId: l.completionId,
    attribute: l.attribute,
    points: l.points,
    earnedAt: l.earnedAt.toISOString(),
  };
}

function moedaParaWire(m: typeof coinEntries.$inferSelect): MoedaWire {
  return {
    id: m.id,
    amount: m.amount,
    source: m.source,
    refId: m.refId,
    createdAt: m.createdAt.toISOString(),
  };
}

export class ErroDeGrade extends Error {
  constructor(
    readonly status: 400 | 404,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

function validarGrade(tabela: TabelaGrade, linha: Record<string, unknown>): void {
  const w = { ...linha };
  for (const c of CARIMBOS) if (w[c] instanceof Date) w[c] = (w[c] as Date).toISOString();
  const r = ESQUEMAS_SYNC[tabela].safeParse(w);
  if (!r.success) throw new ErroDeGrade(400, r.error.issues.map((i) => i.message).join('; '));
}

export class ErroDeOcorrencia extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface MudancaDeOcorrencia {
  startAt?: Date | null;
  endAt?: Date | null;
  titleOverride?: string | null;
  notesOverride?: string | null;
}

/**
 * Repositórios escopados. Quem chama nunca passa `userId`: ele vem da fábrica e entra em toda
 * consulta e toda escrita. O RLS (app.user_id) é a segunda camada, para a consulta que escapar.
 * Leituras ignoram tombstones por padrão; `incluirExcluidos` existe para o sync e a lixeira.
 */
export function criarRepositorios(tx: Tx, userId: string) {
  const doUsuario = eq(items.userId, userId);
  const ocDoUsuario = eq(itemOccurrences.userId, userId);
  /** O driver do Drizzle devolve timestamptz de SQL cru como texto. */
  const relogio = async () => {
    const { rows } = await tx.execute<{ agora: string }>(sql`select now() as agora`);
    return new Date(rows[0]!.agora);
  };

  const itensRepo = {
    async listar(opcoes: { incluirExcluidos?: boolean } = {}): Promise<ItemWire[]> {
      const filtro = opcoes.incluirExcluidos ? doUsuario : and(doUsuario, isNull(items.deletedAt));
      const linhas = await tx.select().from(items).where(filtro).orderBy(items.id);
      return linhas.map(itemParaWire);
    },

    async obterLinha(id: string): Promise<LinhaItem | null> {
      const [l] = await tx
        .select()
        .from(items)
        .where(and(doUsuario, eq(items.id, id), isNull(items.deletedAt)));
      return l ?? null;
    },

    /**
     * `PATCH /items/:id` (§6.3): edição direta pela API, com a mesma validação do sync. Recusa
     * mudar esforço ou atributos de item congelado — a mesma regra que a UI aplica (§11).
     */
    async editar(id: string, mudancas: Partial<ItemWire>): Promise<ItemWire> {
      const atual = await itensRepo.obterLinha(id);
      if (!atual) throw new ErroDeOcorrencia(404, 'item não encontrado');
      const w = itemParaWire(atual);
      if (atual.effortLockedAt) {
        for (const k of ['effort', 'primaryAttribute', 'secondaryAttribute'] as const) {
          if (k in mudancas && mudancas[k] !== w[k]) {
            throw new ErroDeOcorrencia(409, 'esforço congelado: o item já entrou no dia');
          }
        }
      }
      const agora = await relogio();
      const novo: ItemWire = { ...w, ...mudancas, id, updatedAt: agora.toISOString() };
      const r = esquemaItem.safeParse(novo);
      if (!r.success)
        throw new ErroDeOcorrencia(422, r.error.issues.map((i) => i.message).join('; '));
      await tx
        .update(items)
        .set(wireParaLinha(r.data, userId))
        .where(and(doUsuario, eq(items.id, id)));
      return itemParaWire((await itensRepo.obterLinha(id))!);
    },

    /**
     * Adiar (§4.7): move a data e soma 1 ao contador numa instrução só — `postpone_count + 1` no
     * banco, não um valor calculado no client. Só pontuável e simples conta adiamento.
     */
    async adiar(id: string, para: Date): Promise<ItemWire> {
      const atual = await itensRepo.obterLinha(id);
      if (!atual) throw new ErroDeOcorrencia(404, 'item não encontrado');
      if (atual.effort === null)
        throw new ErroDeOcorrencia(409, 'compromisso sem esforço não é adiado');
      if (atual.rrule) throw new ErroDeOcorrencia(409, 'série: mova a ocorrência em vez de adiar');
      const inicio = (atual.kind === 'task' ? atual.dueAt : atual.startAt)!;
      const delta = para.getTime() - inicio.getTime();
      const mover = (d: Date | null) => (d ? new Date(d.getTime() + delta) : null);
      const agora = await relogio();
      await tx
        .update(items)
        .set({
          dueAt: mover(atual.dueAt),
          startAt: mover(atual.startAt),
          endAt: mover(atual.endAt),
          postponeCount: sql`${items.postponeCount} + 1`,
          updatedAt: agora,
        })
        .where(and(doUsuario, eq(items.id, id)));
      return itemParaWire((await itensRepo.obterLinha(id))!);
    },

    /**
     * Last-write-wins numa instrução só: insere, ou sobrescreve se o `updated_at` recebido for
     * estritamente mais novo. Empate mantém o servidor — o client que perdeu recebe a versão
     * do servidor no pull e converge. Tombstone é só mais uma coluna e segue a mesma regra.
     */
    async aplicarPush(recebidos: ItemWire[]): Promise<ResultadoDaTabela> {
      if (recebidos.length === 0) return { aplicados: [], ignorados: [] };
      // Disciplina que não existe (mais) nesta conta: o vínculo cai, o item entra.
      const citadas = [
        ...new Set(recebidos.map((r) => r.courseId).filter((c): c is string => !!c)),
      ];
      const existentes = new Set(
        citadas.length
          ? (
              await tx
                .select({ id: courses.id })
                .from(courses)
                .where(and(eq(courses.userId, userId), inArray(courses.id, citadas)))
            ).map((c) => c.id)
          : [],
      );
      const gravados = await tx
        .insert(items)
        .values(
          recebidos.map((w) =>
            wireParaLinha(
              w.courseId && !existentes.has(w.courseId) ? { ...w, courseId: null } : w,
              userId,
            ),
          ),
        )
        .onConflictDoUpdate({
          target: items.id,
          set: conflitoItens,
          setWhere: sql`${items.updatedAt} < excluded.updated_at and ${items.userId} = excluded.user_id`,
        })
        .returning({ id: items.id });
      const aplicados = new Set(gravados.map((g) => g.id));
      return {
        aplicados: [...aplicados],
        ignorados: recebidos.map((r) => r.id).filter((id) => !aplicados.has(id)),
      };
    },
  };

  const ocorrenciasRepo = {
    /**
     * LWW pela identidade `(item_id, occurrence_date)`. Desvio de item que não existe (ou não é
     * desta conta) é ignorado, não derruba o push inteiro.
     */
    async aplicarPush(recebidos: OcorrenciaWire[]): Promise<ResultadoDaTabela> {
      if (recebidos.length === 0) return { aplicados: [], ignorados: [] };
      const idsDeItens = [...new Set(recebidos.map((o) => o.itemId))];
      const existentes = new Set(
        (
          await tx
            .select({ id: items.id })
            .from(items)
            .where(and(doUsuario, inArray(items.id, idsDeItens)))
        ).map((l) => l.id),
      );
      const validos = recebidos.filter((o) => existentes.has(o.itemId));
      const chave = (itemId: string, dataOc: string) => `${itemId}@${dataOc}`;
      const gravados = validos.length
        ? await tx
            .insert(itemOccurrences)
            .values(
              validos.map((w) => ({
                ...w,
                userId,
                completedAt: paraData(w.completedAt),
                startAt: paraData(w.startAt),
                endAt: paraData(w.endAt),
                deletedAt: paraData(w.deletedAt),
                createdAt: new Date(w.createdAt),
                updatedAt: new Date(w.updatedAt),
              })),
            )
            .onConflictDoUpdate({
              target: [itemOccurrences.itemId, itemOccurrences.occurrenceDate],
              set: conflitoOcorrencias,
              setWhere: sql`${itemOccurrences.updatedAt} < excluded.updated_at and ${itemOccurrences.userId} = excluded.user_id`,
            })
            .returning({ itemId: itemOccurrences.itemId, data: itemOccurrences.occurrenceDate })
        : [];
      const ok = new Set(gravados.map((g) => chave(g.itemId, g.data)));
      const aplicados = recebidos
        .filter((o) => ok.has(chave(o.itemId, o.occurrenceDate)))
        .map((o) => o.id);
      const setAplicados = new Set(aplicados);
      return {
        aplicados,
        ignorados: recebidos.map((o) => o.id).filter((id) => !setAplicados.has(id)),
      };
    },

    /**
     * Registra o desvio de uma ocorrência feito direto na API (sem passar pelo sync). Valida que
     * a data é ocorrência da série. Upsert pela identidade: repetir não cria linha nova.
     * `updated_at` = relógio do banco, que é quem escreve.
     */
    async registrar(
      itemId: string,
      dataOc: string,
      operacao: 'cancel' | 'alterar',
      mudanca: MudancaDeOcorrencia = {},
    ): Promise<OcorrenciaWire> {
      const item = await itensRepo.obterLinha(itemId);
      if (!item) throw new ErroDeOcorrencia(404, 'item não encontrado');
      const serie = serieDaLinha(item);
      if (!serie) throw new ErroDeOcorrencia(409, 'o item não é uma série');
      if (!ehOcorrencia(serie, dataOc)) {
        throw new ErroDeOcorrencia(422, `${dataOc} não é uma ocorrência desta série`);
      }
      const [atual] = await tx
        .select()
        .from(itemOccurrences)
        .where(
          and(
            ocDoUsuario,
            eq(itemOccurrences.itemId, itemId),
            eq(itemOccurrences.occurrenceDate, dataOc),
          ),
        );
      const vivo = atual && !atual.deletedAt ? atual : null;

      // O driver do Drizzle devolve timestamptz de SQL cru como texto.
      const { rows } = await tx.execute<{ agora: string }>(sql`select now() as agora`);
      const agora = new Date(rows[0]!.agora);
      const campos =
        operacao === 'cancel'
          ? { type: 'cancelled' as const }
          : {
              type: mudanca.startAt !== undefined ? ('moved' as const) : ('edited' as const),
              ...mudanca,
            };
      const linha = {
        id: atual?.id ?? novoId(),
        userId,
        itemId,
        occurrenceDate: dataOc,
        status: 'open' as const,
        completedAt: null,
        startAt: null,
        endAt: null,
        titleOverride: null,
        notesOverride: null,
        ...(vivo ?? {}),
        ...campos,
        deletedAt: null,
        createdAt: atual?.createdAt ?? agora,
        updatedAt: agora,
      };
      const [gravada] = await tx
        .insert(itemOccurrences)
        .values(linha)
        .onConflictDoUpdate({
          target: [itemOccurrences.itemId, itemOccurrences.occurrenceDate],
          set: { ...linha, id: sql`${itemOccurrences.id}` },
        })
        .returning();
      return ocorrenciaParaWire(gravada!);
    },
  };

  /** Soma líquida do ledger de um alvo (item simples ou ocorrência). */
  const doAlvo = (t: typeof xpEntries | typeof completions, itemId: string, occ: string | null) =>
    and(
      eq(t.userId, userId),
      eq(t.itemId, itemId),
      occ === null ? isNull(t.occurrenceDate) : eq(t.occurrenceDate, occ),
    );

  async function estadoDoAlvo(itemId: string, occ: string | null) {
    const xp = await tx
      .select({
        attribute: xpEntries.attribute,
        points: xpEntries.points,
        completionId: xpEntries.completionId,
      })
      .from(xpEntries)
      .where(doAlvo(xpEntries, itemId, occ));
    const ids = [...new Set(xp.map((x) => x.completionId))];
    const moedas = ids.length
      ? await tx
          .select({ amount: coinEntries.amount })
          .from(coinEntries)
          .where(
            and(
              eq(coinEntries.userId, userId),
              eq(coinEntries.source, 'task'),
              inArray(coinEntries.refId, ids),
            ),
          )
      : [];
    return {
      xp: xp.map(({ attribute, points }) => ({ attribute, points })),
      moedas: moedas.reduce((n, m) => n + m.amount, 0),
    };
  }

  /**
   * Status derivado do ledger (ADR-0006): concluído é quem tem XP líquido creditado. Corrige o
   * `status` que um aparelho desatualizado tenha sobrescrito por LWW, sem mexer em `updated_at`
   * (mexer faria o relógio do servidor vencer edições legítimas do aparelho).
   */
  async function derivarStatus(itemId: string, occ: string | null): Promise<void> {
    const [item] = await tx
      .select()
      .from(items)
      .where(and(doUsuario, eq(items.id, itemId)));
    if (!item || item.effort === null) return;
    const { xp } = await estadoDoAlvo(itemId, occ);
    const creditado =
      xp.reduce((n, x) => n + Math.abs(x.points), 0) > 0 && somaPorAtributoNaoZero(xp);
    const [ultima] = await tx
      .select({ at: completions.at })
      .from(completions)
      .where(and(doAlvo(completions, itemId, occ), eq(completions.action, 'complete')))
      .orderBy(desc(completions.at))
      .limit(1);
    const status = creditado ? ('done' as const) : ('open' as const);
    const completedAt = creditado ? (ultima?.at ?? new Date()) : null;
    if (occ === null) {
      if (item.rrule) return;
      if (
        item.status !== status ||
        (item.completedAt?.getTime() ?? null) !== (completedAt?.getTime() ?? null)
      ) {
        await tx
          .update(items)
          .set({ status, completedAt })
          .where(and(doUsuario, eq(items.id, itemId)));
      }
      return;
    }
    const [desvio] = await tx
      .select()
      .from(itemOccurrences)
      .where(
        and(
          ocDoUsuario,
          eq(itemOccurrences.itemId, itemId),
          eq(itemOccurrences.occurrenceDate, occ),
        ),
      );
    if (desvio && !desvio.deletedAt) {
      if (desvio.status !== status) {
        await tx
          .update(itemOccurrences)
          .set({ status, completedAt })
          .where(eq(itemOccurrences.id, desvio.id));
      }
      return;
    }
    if (!creditado) return;
    const agora = await relogio();
    await tx
      .insert(itemOccurrences)
      .values({
        id: desvio?.id ?? novoId(),
        userId,
        itemId,
        occurrenceDate: occ,
        type: 'completed',
        status,
        completedAt,
        startAt: null,
        endAt: null,
        titleOverride: null,
        notesOverride: null,
        deletedAt: null,
        createdAt: agora,
        updatedAt: agora,
      })
      .onConflictDoUpdate({
        target: [itemOccurrences.itemId, itemOccurrences.occurrenceDate],
        set: { status, completedAt, deletedAt: null },
      });
  }

  const conclusoesRepo = {
    /**
     * Eventos de conclusão (append-only). Cada evento NOVO passa pela máquina de estados do core
     * e gera o ledger; repetido (mesmo id, retry) não faz nada. A trava por conta serializa
     * requisições simultâneas: dois eventos diferentes para o mesmo alvo não creditam duas vezes.
     */
    async aplicarPush(
      recebidos: ConclusaoWire[],
    ): Promise<ResultadoDaTabela & { efeitos: Map<string, EfeitoDaConclusao> }> {
      const efeitos = new Map<string, EfeitoDaConclusao>();
      if (recebidos.length === 0) return { aplicados: [], ignorados: [], efeitos };
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const agora = await relogio();
      const aplicados: string[] = [];
      const ignorados: string[] = [];
      const alvos = new Map<string, [string, string | null]>();
      for (const ev of [...recebidos].sort(
        (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
      )) {
        const [existe] = await tx
          .select({ id: completions.id })
          .from(completions)
          .where(and(eq(completions.userId, userId), eq(completions.id, ev.id)));
        if (existe) {
          ignorados.push(ev.id); // já processado: é o retry, idempotente
          continue;
        }
        const [item] = await tx
          .select()
          .from(items)
          .where(and(doUsuario, eq(items.id, ev.itemId), isNull(items.deletedAt)));
        let efeito: EfeitoDaConclusao;
        const serie = item ? serieDaLinha(item) : null;
        if (
          item &&
          ev.occurrenceDate !== null &&
          (!serie || !ehOcorrencia(serie, ev.occurrenceDate))
        ) {
          efeito = { tipo: 'nada', motivo: 'data não é ocorrência da série' };
        } else if (item && ev.occurrenceDate === null && item.rrule) {
          efeito = { tipo: 'nada', motivo: 'série: conclua a ocorrência' };
        } else {
          const { xp, moedas } = await estadoDoAlvo(ev.itemId, ev.occurrenceDate);
          efeito = efeitoDaConclusao(ev.action, item ?? null, xp, moedas);
        }
        // earnedAt: o momento do toque no aparelho, mas nunca no futuro do servidor.
        const at = new Date(Math.min(Date.parse(ev.at), agora.getTime()));
        await tx.insert(completions).values({
          id: ev.id,
          userId,
          itemId: ev.itemId,
          occurrenceDate: ev.occurrenceDate,
          action: ev.action,
          at,
          efeito: efeito.tipo === 'nada' ? `nada: ${efeito.motivo}` : efeito.tipo,
          createdAt: agora,
        });
        if (efeito.tipo !== 'nada') {
          await tx.insert(xpEntries).values(
            efeito.xp.map((x) => ({
              id: novoId(),
              userId,
              itemId: ev.itemId,
              occurrenceDate: ev.occurrenceDate,
              completionId: ev.id,
              attribute: x.attribute,
              points: x.points,
              earnedAt: at,
            })),
          );
          if (efeito.moedas !== 0) {
            await tx.insert(coinEntries).values({
              id: novoId(),
              userId,
              amount: efeito.moedas,
              source: 'task',
              refId: ev.id,
              createdAt: at,
            });
          }
        }
        efeitos.set(ev.id, efeito);
        aplicados.push(ev.id);
        alvos.set(`${ev.itemId}@${ev.occurrenceDate}`, [ev.itemId, ev.occurrenceDate]);
      }
      for (const [itemId, occ] of alvos.values()) await derivarStatus(itemId, occ);
      return { aplicados, ignorados, efeitos };
    },

    async lancamentosDaConclusao(id: string): Promise<LancamentoWire[]> {
      const l = await tx
        .select()
        .from(xpEntries)
        .where(and(eq(xpEntries.userId, userId), eq(xpEntries.completionId, id)));
      return l.map(lancamentoParaWire);
    },
  };

  const status = {
    /** Depois de um push de itens/desvios: o status volta a ser o do ledger. */
    async derivarDosEnviados(
      itensIds: string[],
      desvios: { itemId: string; occurrenceDate: string }[],
    ) {
      for (const id of itensIds) await derivarStatus(id, null);
      for (const d of desvios) await derivarStatus(d.itemId, d.occurrenceDate);
    },
  };

  const estatisticas = {
    /** Radar (§4.5): acumulado e janela de 30 dias por atributo, com o nível do core. */
    async atributos() {
      const agora = await relogio();
      const l = await tx
        .select({
          attribute: xpEntries.attribute,
          points: xpEntries.points,
          earnedAt: xpEntries.earnedAt,
        })
        .from(xpEntries)
        .where(eq(xpEntries.userId, userId));
      return medidasDoRadar(l, agora);
    },

    /** Saldo derivado da soma dos lançamentos (§4.6): sem campo materializado. */
    async saldo(): Promise<number> {
      const [r] = await tx
        .select({ total: sql<string>`coalesce(sum(${coinEntries.amount}), 0)` })
        .from(coinEntries)
        .where(eq(coinEntries.userId, userId));
      return Number(r?.total ?? 0);
    },
  };

  const gradeRepo = {
    /** LWW por `id`, como `items`. Linha cuja tabela-pai não existe nesta conta é ignorada. */
    async aplicarPush(
      tabela: TabelaGrade,
      recebidos: Record<string, unknown>[],
    ): Promise<ResultadoDaTabela> {
      if (recebidos.length === 0) return { aplicados: [], ignorados: [] };
      const { tabela: t, pai } = GRADE[tabela];
      let validos = recebidos;
      if (pai) {
        const ids = [...new Set(recebidos.map((r) => r[pai.coluna] as string))];
        const ok = new Set(
          (
            await tx
              .select({ id: pai.tabela.id })
              .from(pai.tabela)
              .where(and(eq(pai.tabela.userId, userId), inArray(pai.tabela.id, ids)))
          ).map((l) => l.id),
        );
        validos = recebidos.filter((r) => ok.has(r[pai.coluna] as string));
      }
      const gravados = validos.length
        ? await tx
            .insert(t)
            .values(validos.map((w) => wireParaGrade(w, userId)) as never)
            .onConflictDoUpdate({
              target: t.id,
              set: conflitoGrade[tabela] as never,
              setWhere: sql`${t.updatedAt} < excluded.updated_at and ${t.userId} = excluded.user_id`,
            })
            .returning({ id: t.id })
        : [];
      const aplicados = new Set(gravados.map((g) => g.id));
      return {
        aplicados: [...aplicados],
        ignorados: recebidos.map((r) => r.id as string).filter((id) => !aplicados.has(id)),
      };
    },

    async alteradosDesde(tabela: TabelaGrade, desde: ReturnType<typeof sql> | null) {
      const t = GRADE[tabela].tabela;
      const linhas = await tx
        .select()
        .from(t)
        .where(
          desde ? and(eq(t.userId, userId), gt(t.serverUpdatedAt, desde)) : eq(t.userId, userId),
        )
        .orderBy(t.serverUpdatedAt);
      return linhas.map((l) => gradeParaWire(l as Record<string, unknown>));
    },

    /**
     * Escrita feita direto pela API (rotas da §6.3). Valida com o mesmo esquema do sync;
     * `updated_at` é o relógio do banco, que é quem escreve.
     */
    async criar(tabela: TabelaGrade, dados: Record<string, unknown>) {
      const agora = await relogio();
      const linha = { ...dados, id: novoId(), deletedAt: null, createdAt: agora, updatedAt: agora };
      validarGrade(tabela, linha);
      const r = await gradeRepo.aplicarPush(tabela, [gradeParaWire(linha)]);
      if (!r.aplicados.length) throw new ErroDeGrade(404, 'registro de referência não encontrado');
      return gradeParaWire(linha);
    },

    async obter(tabela: TabelaGrade, id: string) {
      const t = GRADE[tabela].tabela;
      const [l] = await tx
        .select()
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.id, id), isNull(t.deletedAt)));
      return l ? gradeParaWire(l as Record<string, unknown>) : null;
    },

    async editar(tabela: TabelaGrade, id: string, mudancas: Record<string, unknown>) {
      const atual = await gradeRepo.obter(tabela, id);
      if (!atual) throw new ErroDeGrade(404, 'registro não encontrado');
      const agora = await relogio();
      const novo = { ...atual, ...mudancas, id, updatedAt: agora.toISOString() };
      validarGrade(tabela, novo);
      const t = GRADE[tabela].tabela;
      const { id: _i, createdAt: _c, ...campos } = wireParaGrade(novo, userId);
      await tx
        .update(t)
        .set(campos as never)
        .where(and(eq(t.userId, userId), eq(t.id, id)));
      return novo;
    },

    /** Tombstone em cascata na aplicação; itens ligados a uma disciplina excluída perdem o vínculo. */
    async excluir(tabela: TabelaGrade, id: string): Promise<void> {
      if (!(await gradeRepo.obter(tabela, id)))
        throw new ErroDeGrade(404, 'registro não encontrado');
      const agora = await relogio();
      const marcar = async (t: TabelaGrade, filtro: ReturnType<typeof eq>) => {
        const tb = GRADE[t].tabela;
        await tx
          .update(tb)
          .set({ deletedAt: agora, updatedAt: agora } as never)
          .where(and(eq(tb.userId, userId), isNull(tb.deletedAt), filtro));
      };
      if (tabela === 'disciplinas') {
        const slots = await tx
          .select({ id: classSlots.id })
          .from(classSlots)
          .where(and(eq(classSlots.userId, userId), eq(classSlots.courseId, id)));
        if (slots.length)
          await marcar(
            'excecoes',
            inArray(
              classExceptions.slotId,
              slots.map((x) => x.id),
            ) as never,
          );
        await marcar('horarios', eq(classSlots.courseId, id));
        await tx
          .update(items)
          .set({ courseId: null, updatedAt: agora })
          .where(and(doUsuario, eq(items.courseId, id)));
      }
      if (tabela === 'horarios') await marcar('excecoes', eq(classExceptions.slotId, id));
      await marcar(tabela, eq(GRADE[tabela].tabela.id, id));
    },

    async disciplinasComHorarios(semesterId: string | null) {
      const cs = await tx
        .select()
        .from(courses)
        .where(
          and(
            eq(courses.userId, userId),
            isNull(courses.deletedAt),
            semesterId ? eq(courses.semesterId, semesterId) : undefined,
          ),
        )
        .orderBy(courses.name);
      const hs = cs.length
        ? await tx
            .select()
            .from(classSlots)
            .where(
              and(
                eq(classSlots.userId, userId),
                isNull(classSlots.deletedAt),
                inArray(
                  classSlots.courseId,
                  cs.map((c) => c.id),
                ),
              ),
            )
            .orderBy(classSlots.weekday, classSlots.startTime)
        : [];
      return cs.map((c) => ({
        ...gradeParaWire(c as Record<string, unknown>),
        horarios: hs
          .filter((h) => h.courseId === c.id)
          .map((h) => gradeParaWire(h as Record<string, unknown>)),
      }));
    },

    /** A grade inteira (sem excluídos), para a projeção das aulas. */
    async paraProjecao() {
      const vivos = <
        T extends typeof semesters | typeof courses | typeof classSlots | typeof classExceptions,
      >(
        t: T,
      ) =>
        tx
          .select()
          .from(t as typeof semesters)
          .where(and(eq(t.userId, userId), isNull(t.deletedAt)));
      return {
        semestres: await vivos(semesters),
        disciplinas: (await vivos(courses)) as unknown as (typeof courses.$inferSelect)[],
        horarios: (await vivos(classSlots)) as unknown as (typeof classSlots.$inferSelect)[],
        excecoes: (await vivos(
          classExceptions,
        )) as unknown as (typeof classExceptions.$inferSelect)[],
      };
    },
  };

  const importacaoRepo = {
    /**
     * Aplica um plano de importação de ICS numa transação (especificação §6.5). Idempotente por
     * `source_uid`: o que já existe é atualizado só se mudou; o que não existe é criado. Item que
     * o usuário excluiu no Compasso não volta. Esforço e atributos de um item já importado não são
     * tocados — a importação só cria compromissos puros.
     */
    async aplicar(plano: PlanoDeImportacao) {
      const { rows } = await tx.execute<{ agora: string }>(sql`select now() as agora`);
      const agora = new Date(rows[0]!.agora);
      const resumo = {
        criados: 0,
        atualizados: 0,
        inalterados: 0,
        desvios: 0,
        expandidos: plano.expandidos,
        ignorados: [...plano.ignorados],
      };
      const uids = plano.itens.map((i) => i.sourceUid);
      const existentes = new Map<string, LinhaItem>();
      for (let i = 0; i < uids.length; i += 1000) {
        const lote = await tx
          .select()
          .from(items)
          .where(and(doUsuario, inArray(items.sourceUid, uids.slice(i, i + 1000))));
        for (const l of lote) existentes.set(l.sourceUid!, l);
      }

      const idPorUid = new Map<string, string>();
      const mesmaData = (a: Date | null, b: Date | null) =>
        (a?.getTime() ?? null) === (b?.getTime() ?? null);
      for (const imp of plano.itens) {
        const campos = {
          title: imp.title,
          notes: imp.notes,
          allDay: imp.allDay,
          startAt: imp.startAt,
          endAt: imp.endAt,
          timezone: imp.timezone,
          rrule: imp.rrule,
          recurrenceEndsAt: imp.rrule
            ? fimDaSerie({
                rrule: imp.rrule,
                inicio: imp.startAt,
                duracaoMs: imp.endAt ? imp.endAt.getTime() - imp.startAt.getTime() : 0,
                fuso: imp.timezone,
              })
            : null,
        };
        const atual = existentes.get(imp.sourceUid);
        if (!atual) {
          const id = novoId();
          await tx.insert(items).values({
            ...campos,
            id,
            userId,
            kind: 'event',
            sourceUid: imp.sourceUid,
            createdAt: agora,
            updatedAt: agora,
          });
          idPorUid.set(imp.sourceUid, id);
          resumo.criados++;
          continue;
        }
        idPorUid.set(imp.sourceUid, atual.id);
        if (atual.deletedAt) {
          resumo.ignorados.push({
            uid: imp.sourceUid,
            titulo: imp.title,
            motivo: 'excluído no Compasso',
          });
          continue;
        }
        const igual =
          atual.title === campos.title &&
          atual.notes === campos.notes &&
          atual.allDay === campos.allDay &&
          mesmaData(atual.startAt, campos.startAt) &&
          mesmaData(atual.endAt, campos.endAt) &&
          atual.timezone === campos.timezone &&
          atual.rrule === campos.rrule;
        if (igual) {
          resumo.inalterados++;
          continue;
        }
        await tx
          .update(items)
          .set({ ...campos, updatedAt: agora })
          .where(and(doUsuario, eq(items.id, atual.id)));
        resumo.atualizados++;
      }

      for (const d of plano.desvios) {
        const itemId = idPorUid.get(d.sourceUidDaSerie);
        if (!itemId) continue;
        const campos = d.cancelada
          ? {
              type: 'cancelled' as const,
              startAt: null,
              endAt: null,
              titleOverride: null,
              notesOverride: null,
            }
          : {
              type: d.startAt ? ('moved' as const) : ('edited' as const),
              startAt: d.startAt,
              endAt: d.endAt,
              titleOverride: d.titleOverride,
              notesOverride: d.notesOverride,
            };
        const [atual] = await tx
          .select()
          .from(itemOccurrences)
          .where(
            and(
              eq(itemOccurrences.itemId, itemId),
              eq(itemOccurrences.occurrenceDate, d.occurrenceDate),
            ),
          );
        if (
          atual &&
          !atual.deletedAt &&
          atual.type === campos.type &&
          mesmaData(atual.startAt, campos.startAt) &&
          mesmaData(atual.endAt, campos.endAt) &&
          atual.titleOverride === campos.titleOverride &&
          atual.notesOverride === campos.notesOverride
        ) {
          continue;
        }
        await tx
          .insert(itemOccurrences)
          .values({
            ...campos,
            id: atual?.id ?? novoId(),
            userId,
            itemId,
            occurrenceDate: d.occurrenceDate,
            status: 'open',
            completedAt: null,
            deletedAt: null,
            createdAt: atual?.createdAt ?? agora,
            updatedAt: agora,
          })
          .onConflictDoUpdate({
            target: [itemOccurrences.itemId, itemOccurrences.occurrenceDate],
            set: { ...campos, deletedAt: null, updatedAt: agora },
          });
        resumo.desvios++;
      }
      return resumo;
    },
  };

  return {
    usuarios: {
      /** A tabela users é o caso em que a própria linha é o dono: filtra por `id`. */
      async atual(): Promise<Usuario | null> {
        const [linha] = await tx.select().from(users).where(eq(users.id, userId));
        return linha ?? null;
      },
    },

    itens: itensRepo,
    ocorrencias: ocorrenciasRepo,
    importacao: importacaoRepo,
    grade: gradeRepo,
    conclusoes: conclusoesRepo,
    estatisticas,
    status,

    sync: {
      /**
       * Linhas alteradas no servidor desde `cursor - janela`, tombstones incluídos. O novo cursor
       * é o `now()` desta transação (início dela, relógio do banco): tudo que fez commit antes do
       * snapshot já está no resultado, e o que fizer commit depois tem carimbo posterior ou cai
       * dentro da janela do próximo pull.
       */
      async alteradosDesde(cursor: string | null, janelaSegundos: number) {
        const [agora] = await tx
          .execute<{ cursor: string }>(
            // ISO 8601 em UTC com microssegundos, independente do TimeZone da sessão.
            sql`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor`,
          )
          .then((r) => r.rows);
        const desde =
          cursor === null
            ? null
            : sql`${cursor}::timestamptz - make_interval(secs => ${janelaSegundos})`;
        const linhasItens = await tx
          .select()
          .from(items)
          .where(desde ? and(doUsuario, gt(items.serverUpdatedAt, desde)) : doUsuario)
          .orderBy(items.serverUpdatedAt);
        const linhasOc = await tx
          .select()
          .from(itemOccurrences)
          .where(desde ? and(ocDoUsuario, gt(itemOccurrences.serverUpdatedAt, desde)) : ocDoUsuario)
          .orderBy(itemOccurrences.serverUpdatedAt);
        const saida = {
          itens: linhasItens.map(itemParaWire),
          ocorrencias: linhasOc.map(ocorrenciaParaWire),
        } as unknown as LinhasSync;
        for (const t of TABELAS_DA_GRADE) {
          (saida[t] as unknown) = await gradeRepo.alteradosDesde(t, desde);
        }
        const doUser = <T extends typeof completions | typeof xpEntries | typeof coinEntries>(
          t: T,
        ) =>
          desde ? and(eq(t.userId, userId), gt(t.serverUpdatedAt, desde)) : eq(t.userId, userId);
        saida.conclusoes = (await tx.select().from(completions).where(doUser(completions))).map(
          conclusaoParaWire,
        );
        const lancamentos = (await tx.select().from(xpEntries).where(doUser(xpEntries))).map(
          lancamentoParaWire,
        );
        const moedas = (await tx.select().from(coinEntries).where(doUser(coinEntries))).map(
          moedaParaWire,
        );
        return { ...saida, lancamentos, moedas, cursor: agora!.cursor };
      },
    },

    agenda: {
      /**
       * `GET /agenda`: itens simples no intervalo + todas as séries ativas + seus desvios,
       * projetados pela MESMA função que o app usa offline (`projetarAgenda` do core).
       */
      async projetar(de: Date, ate: Date): Promise<EntradaAgenda[]> {
        const candidatos = await tx
          .select()
          .from(items)
          .where(
            and(
              doUsuario,
              isNull(items.deletedAt),
              or(isNotNull(items.rrule), and(isNull(items.rrule), simplesNoIntervalo(de, ate))),
            ),
          );
        const series = candidatos.filter((c) => c.rrule).map((c) => c.id);
        const desvios = series.length
          ? await tx
              .select()
              .from(itemOccurrences)
              .where(
                and(
                  ocDoUsuario,
                  isNull(itemOccurrences.deletedAt),
                  inArray(itemOccurrences.itemId, series),
                ),
              )
          : [];
        return projetarAgenda(candidatos, desvios, de, ate);
      },

      /** Aulas projetadas em cada dia civil que toca `[de, ate)` — a mesma função do app. */
      async aulas(de: Date, ate: Date): Promise<Aula[]> {
        const grade = await gradeRepo.paraProjecao();
        const saida: Aula[] = [];
        const ultimo = diaDe(new Date(ate.getTime() - 1));
        for (let d = diaDe(de); d <= ultimo; d = somarDias(d, 1))
          saida.push(...aulasDoDia(grade, d));
        return saida;
      },
    },
  };
}

export type Repositorios = ReturnType<typeof criarRepositorios>;
