import type { ItemWire } from '@compasso/core';
import { and, eq, getTableColumns, gt, isNull, sql } from 'drizzle-orm';
import type { Tx } from './banco';
import { items, users } from './schema';

export type Usuario = typeof users.$inferSelect;
type LinhaItem = typeof items.$inferSelect;

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

function wireParaLinha(w: ItemWire, userId: string) {
  return {
    ...w,
    userId,
    effortLockedAt: paraData(w.effortLockedAt),
    dueAt: paraData(w.dueAt),
    startAt: paraData(w.startAt),
    endAt: paraData(w.endAt),
    recurrenceEndsAt: paraData(w.recurrenceEndsAt),
    completedAt: paraData(w.completedAt),
    deletedAt: paraData(w.deletedAt),
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
  };
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * No conflito de `id`, todas as colunas vêm do client — menos `id`, `user_id` (nunca muda de
 * dono) e `server_updated_at` (o trigger preenche).
 */
const colunasDoConflito = Object.fromEntries(
  Object.keys(getTableColumns(items))
    .filter((k) => !['id', 'userId', 'serverUpdatedAt'].includes(k))
    .map((k) => [k, sql.raw(`excluded."${snake(k)}"`)]),
);

/**
 * Repositórios escopados. Quem chama nunca passa `userId`: ele vem da fábrica e entra em toda
 * consulta e toda escrita. O RLS (app.user_id) é a segunda camada, para a consulta que escapar.
 * Leituras ignoram tombstones por padrão; `incluirExcluidos` existe para o sync e a lixeira.
 */
export function criarRepositorios(tx: Tx, userId: string) {
  const doUsuario = eq(items.userId, userId);

  return {
    usuarios: {
      /** A tabela users é o caso em que a própria linha é o dono: filtra por `id`. */
      async atual(): Promise<Usuario | null> {
        const [linha] = await tx.select().from(users).where(eq(users.id, userId));
        return linha ?? null;
      },
    },

    itens: {
      async listar(opcoes: { incluirExcluidos?: boolean } = {}): Promise<ItemWire[]> {
        const filtro = opcoes.incluirExcluidos
          ? doUsuario
          : and(doUsuario, isNull(items.deletedAt));
        const linhas = await tx.select().from(items).where(filtro).orderBy(items.id);
        return linhas.map(itemParaWire);
      },

      /**
       * Last-write-wins numa instrução só: insere, ou sobrescreve se o `updated_at` recebido for
       * estritamente mais novo. Empate mantém o servidor — o client que perdeu recebe a versão
       * do servidor no pull e converge. Tombstone é só mais uma coluna e segue a mesma regra.
       */
      async aplicarPush(
        recebidos: ItemWire[],
      ): Promise<{ aplicados: string[]; ignorados: string[] }> {
        if (recebidos.length === 0) return { aplicados: [], ignorados: [] };
        const gravados = await tx
          .insert(items)
          .values(recebidos.map((w) => wireParaLinha(w, userId)))
          .onConflictDoUpdate({
            target: items.id,
            set: colunasDoConflito,
            setWhere: sql`${items.updatedAt} < excluded.updated_at and ${items.userId} = excluded.user_id`,
          })
          .returning({ id: items.id });
        const aplicados = new Set(gravados.map((g) => g.id));
        return {
          aplicados: [...aplicados],
          ignorados: recebidos.map((r) => r.id).filter((id) => !aplicados.has(id)),
        };
      },

      /**
       * Linhas alteradas no servidor desde `cursor - janela`, tombstones incluídos. O novo cursor
       * é o `now()` desta transação (início dela, relógio do banco): tudo que fez commit antes do
       * snapshot já está no resultado, e o que fizer commit depois tem carimbo posterior ou cai
       * dentro da janela do próximo pull.
       */
      async alteradosDesde(
        cursor: string | null,
        janelaSegundos: number,
      ): Promise<{ itens: ItemWire[]; cursor: string }> {
        const [agora] = await tx
          .execute<{ cursor: string }>( // ISO 8601 em UTC com microssegundos, independente do TimeZone da sessão.
            sql`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor`,
          )
          .then((r) => r.rows);
        const filtro =
          cursor === null
            ? doUsuario
            : and(
                doUsuario,
                gt(
                  items.serverUpdatedAt,
                  sql`${cursor}::timestamptz - make_interval(secs => ${janelaSegundos})`,
                ),
              );
        const linhas = await tx.select().from(items).where(filtro).orderBy(items.serverUpdatedAt);
        return { itens: linhas.map(itemParaWire), cursor: agora!.cursor };
      },
    },
  };
}

export type Repositorios = ReturnType<typeof criarRepositorios>;
