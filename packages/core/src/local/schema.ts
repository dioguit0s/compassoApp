import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
