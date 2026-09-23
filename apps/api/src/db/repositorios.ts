import {
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
import { itemOccurrences, items, users } from './schema';

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
function colunasDoConflito(tabela: typeof items | typeof itemOccurrences, fixas: string[]) {
  return Object.fromEntries(
    Object.keys(getTableColumns(tabela))
      .filter((k) => ![...fixas, 'userId', 'serverUpdatedAt'].includes(k))
      .map((k) => [k, sql.raw(`excluded."${snake(k)}"`)]),
  );
}
const conflitoItens = colunasDoConflito(items, ['id']);
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
     * Last-write-wins numa instrução só: insere, ou sobrescreve se o `updated_at` recebido for
     * estritamente mais novo. Empate mantém o servidor — o client que perdeu recebe a versão
     * do servidor no pull e converge. Tombstone é só mais uma coluna e segue a mesma regra.
     */
    async aplicarPush(recebidos: ItemWire[]): Promise<ResultadoDaTabela> {
      if (recebidos.length === 0) return { aplicados: [], ignorados: [] };
      const gravados = await tx
        .insert(items)
        .values(recebidos.map((w) => wireParaLinha(w, userId)))
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
      operacao: 'complete' | 'cancel' | 'alterar',
      mudanca: MudancaDeOcorrencia = {},
    ): Promise<OcorrenciaWire> {
      const item = await itensRepo.obterLinha(itemId);
      if (!item) throw new ErroDeOcorrencia(404, 'item não encontrado');
      const serie = serieDaLinha(item);
      if (!serie) throw new ErroDeOcorrencia(409, 'o item não é uma série');
      if (!ehOcorrencia(serie, dataOc)) {
        throw new ErroDeOcorrencia(422, `${dataOc} não é uma ocorrência desta série`);
      }
      if (operacao === 'complete' && item.effort === null) {
        throw new ErroDeOcorrencia(409, 'compromisso sem esforço não é concluível');
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
      if (operacao === 'complete' && vivo?.status === 'done') return ocorrenciaParaWire(vivo);

      // O driver do Drizzle devolve timestamptz de SQL cru como texto.
      const { rows } = await tx.execute<{ agora: string }>(sql`select now() as agora`);
      const agora = new Date(rows[0]!.agora);
      const campos =
        operacao === 'complete'
          ? { type: 'completed' as const, status: 'done' as const, completedAt: agora }
          : operacao === 'cancel'
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
        return {
          itens: linhasItens.map(itemParaWire),
          ocorrencias: linhasOc.map(ocorrenciaParaWire),
          cursor: agora!.cursor,
        };
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
    },
  };
}

export type Repositorios = ReturnType<typeof criarRepositorios>;
