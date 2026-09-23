import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ATRIBUTOS } from '../atributos';

/**
 * Schema do SQLite do aparelho. Vive no core (e não no app) para que o motor de sync e o
 * repositório local rodem também nos testes de integração em Node, sobre o mesmo schema.
 *
 * Datas: inteiro em **epoch ms UTC** em todas as colunas (`mode: 'timestamp_ms'`). SQLite não tem
 * `timestamptz`; um formato só evita que a comparação de `updatedAt` no LWW misture texto e número.
 */

/** Cópia local do `GET /me`. Uma linha só: a conta do aparelho. */
export const perfil = sqliteTable('perfil', {
  id: text().primaryKey(),
  displayName: text().notNull(),
  avatarKind: text({ enum: ['initials', 'uploaded'] }).notNull(),
  avatarPath: text(),
  accentColor: text().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  /** Quando este registro foi confirmado pelo servidor pela última vez. */
  buscadoEm: integer({ mode: 'timestamp_ms' }).notNull(),
});

export type Perfil = typeof perfil.$inferSelect;

const data = () => integer({ mode: 'timestamp_ms' });

/**
 * Espelho local de `items`: mesmas colunas do servidor (menos `user_id`, implícito — o aparelho
 * tem uma conta só — e `server_updated_at`, que só o servidor conhece), mais `dirty`.
 *
 * Os invariantes da §5 NÃO viram CHECK aqui: alterar CHECK no SQLite exige recriar a tabela.
 * Eles são validados no repositório local, com o mesmo código (`violacoesDeInvariante`) que o
 * servidor usa antes dos CHECKs dele.
 */
export const items = sqliteTable(
  'items',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    notes: text(),
    kind: text({ enum: ['task', 'event'] }).notNull(),
    effort: integer(),
    effortLockedAt: data(),
    primaryAttribute: text({ enum: ATRIBUTOS }),
    secondaryAttribute: text({ enum: ATRIBUTOS }),
    dueAt: data(),
    startAt: data(),
    endAt: data(),
    allDay: integer({ mode: 'boolean' }).notNull().default(false),
    timezone: text().notNull(),
    rrule: text(),
    recurrenceEndsAt: data(),
    status: text({ enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    completedAt: data(),
    postponeCount: integer().notNull().default(0),
    reminderMinutesBefore: integer(),
    deletedAt: data(),
    createdAt: data().notNull(),
    /** Relógio do aparelho na última edição. Decide o LWW; nunca entra no cursor. */
    updatedAt: data().notNull(),
    /** A linha mudou aqui e o servidor ainda não confirmou. */
    dirty: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('items_dirty_idx').on(t.dirty),
    index('items_start_at_idx').on(t.startAt),
    index('items_due_at_idx').on(t.dueAt),
  ],
);

export type ItemLocal = typeof items.$inferSelect;

/**
 * Chave-valor do estado da sincronização: `cursor` (opaco, veio do servidor), `ultimaSync`
 * (epoch ms do aparelho, só para exibir e para detectar ausência maior que a retenção) e
 * `retencaoDias` (informado pelo servidor a cada pull).
 */
export const metadados = sqliteTable('metadados', {
  chave: text().primaryKey(),
  valor: text().notNull(),
});
