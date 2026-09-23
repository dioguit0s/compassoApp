import { ATRIBUTOS } from '@compasso/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgPolicy,
  pgRole,
  pgTable,
  smallint,
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

const tz = { withTimezone: true } as const;
const listaAtributos = sql.raw(ATRIBUTOS.map((a) => `'${a}'`).join(', '));

/**
 * Tarefa e evento na mesma tabela (especificação §5). Os invariantes que dependem só da própria
 * linha são CHECK: valem até contra um retry com bug ou uma edição manual no psql.
 *
 * Três carimbos de tempo com papéis diferentes:
 * - `updated_at`: relógio do APARELHO que fez a última edição. Decide o last-write-wins.
 * - `server_updated_at`: relógio do SERVIDOR na última escrita aceita, preenchido por trigger.
 *   É a única coluna que o cursor do pull consulta — o relógio do aparelho nunca entra nele.
 * - `deleted_at`: tombstone. A linha só sai fisicamente pela purga, depois da retenção.
 */
export const items = pgTable(
  'items',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    notes: text(),
    kind: text({ enum: ['task', 'event'] }).notNull(),
    effort: smallint(),
    effortLockedAt: timestamp(tz),
    primaryAttribute: text({ enum: ATRIBUTOS }),
    secondaryAttribute: text({ enum: ATRIBUTOS }),
    dueAt: timestamp(tz),
    startAt: timestamp(tz),
    endAt: timestamp(tz),
    allDay: boolean().notNull().default(false),
    timezone: text().notNull(),
    rrule: text(),
    recurrenceEndsAt: timestamp(tz),
    status: text({ enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    completedAt: timestamp(tz),
    postponeCount: integer().notNull().default(0),
    reminderMinutesBefore: integer(),
    deletedAt: timestamp(tz),
    createdAt: timestamp(tz).notNull(),
    updatedAt: timestamp(tz).notNull(),
    serverUpdatedAt: timestamp(tz)
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    index('items_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    index('items_user_id_start_at_idx').on(t.userId, t.startAt),
    index('items_user_id_due_at_idx').on(t.userId, t.dueAt),
    index('items_deleted_at_idx').on(t.deletedAt),
    check('items_kind_check', sql`${t.kind} in ('task', 'event')`),
    check('items_status_check', sql`${t.status} in ('open', 'done')`),
    check('items_effort_check', sql`${t.effort} in (1, 2, 3, 5, 8)`),
    check('items_primary_attribute_check', sql`${t.primaryAttribute} in (${listaAtributos})`),
    check('items_secondary_attribute_check', sql`${t.secondaryAttribute} in (${listaAtributos})`),
    check(
      'items_task_campos_check',
      sql`${t.kind} <> 'task' or (${t.startAt} is null and ${t.endAt} is null and ${t.effort} is not null)`,
    ),
    check(
      'items_event_campos_check',
      sql`${t.kind} <> 'event' or (${t.dueAt} is null and ${t.startAt} is not null)`,
    ),
    check('items_intervalo_check', sql`${t.endAt} is null or ${t.endAt} >= ${t.startAt}`),
    check('items_pontua_check', sql`(${t.effort} is null) = (${t.primaryAttribute} is null)`),
    check(
      'items_secundario_check',
      sql`${t.secondaryAttribute} is null or (${t.primaryAttribute} is not null and ${t.secondaryAttribute} <> ${t.primaryAttribute})`,
    ),
    check('items_timezone_check', sql`length(${t.timezone}) > 0`),
    check('items_postpone_count_check', sql`${t.postponeCount} >= 0`),
    pgPolicy('items_dono', {
      for: 'all',
      to: papelApp,
      using: sql`${t.userId} = ${usuarioAtual}`,
      withCheck: sql`${t.userId} = ${usuarioAtual}`,
    }),
  ],
);
