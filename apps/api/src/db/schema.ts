import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Papel com que a API conecta. Não é dono das tabelas nem superusuário, então está sujeito ao
 * RLS. Criado fora das migrações (scripts/bootstrap.sql), porque papel é objeto do cluster.
 */
export const papelApp = pgRole('compasso_app').existing();

/** `userId` da transação corrente, definido pela camada de repositório com `SET LOCAL`. */
const usuarioAtual = sql`app_user_id()`;

const carimbos = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey(),
    displayName: text().notNull(),
    avatarKind: text({ enum: ['initials', 'uploaded'] })
      .notNull()
      .default('initials'),
    avatarPath: text(),
    accentColor: text().notNull(),
    ...carimbos,
  },
  (t) => [
    check('users_avatar_kind_check', sql`${t.avatarKind} in ('initials', 'uploaded')`),
    check(
      'users_avatar_path_check',
      sql`(${t.avatarKind} = 'uploaded') = (${t.avatarPath} is not null)`,
    ),
    // A própria linha é o dono: a coluna comparada é `id`, não `user_id`.
    pgPolicy('users_dono', {
      for: 'all',
      to: papelApp,
      using: sql`${t.id} = ${usuarioAtual}`,
      withCheck: sql`${t.id} = ${usuarioAtual}`,
    }),
  ],
);

/**
 * Vínculo token → conta. Guarda só o SHA-256 do token: o valor em claro aparece uma vez, na
 * saída do script de criação de conta. Um token por aparelho permite revogar individualmente.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    tokenHash: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    label: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('api_tokens_user_id_idx').on(t.userId),
    pgPolicy('api_tokens_dono', {
      for: 'all',
      to: papelApp,
      using: sql`${t.userId} = ${usuarioAtual}`,
      withCheck: sql`${t.userId} = ${usuarioAtual}`,
    }),
  ],
);
