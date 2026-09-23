import { ATRIBUTOS } from '@compasso/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  type AnyPgColumn,
  index,
  integer,
  pgPolicy,
  pgRole,
  pgTable,
  smallint,
  text,
  date,
  foreignKey,
  timestamp,
  uniqueIndex,
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
    /** UID do VEVENT de origem na importação de ICS; null para itens nativos. */
    sourceUid: text(),
    /**
     * Disciplina de prova/trabalho (F5). A FK composta (user_id, course_id) → courses, com
     * ON DELETE SET NULL (course_id), está na migração 0009 (o Drizzle não expressa o SET NULL de
     * uma coluna só): excluir a disciplina não exclui a prova.
     */
    courseId: uuid(),
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
    index('items_user_id_course_id_idx').on(t.userId, t.courseId),
    // Alvo da FK composta de item_occurrences: o desvio só aponta para item da mesma conta.
    uniqueIndex('items_user_id_id_idx').on(t.userId, t.id),
    // Reimportar o mesmo .ics atualiza em vez de duplicar (especificação §6.5).
    uniqueIndex('items_user_id_source_uid_idx').on(t.userId, t.sourceUid),
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

/**
 * Desvios de ocorrência de série (especificação §5). Só vira linha quando a ocorrência desvia.
 * Identidade `(item_id, occurrence_date)` com índice único — o push faz LWW por ela, não pelo
 * `id`, para dois aparelhos que criem offline o desvio da mesma data convergirem (ADR-0004).
 */
export const itemOccurrences = pgTable(
  'item_occurrences',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    itemId: uuid().notNull(),
    occurrenceDate: date({ mode: 'string' }).notNull(),
    type: text({ enum: ['completed', 'cancelled', 'moved', 'edited'] }).notNull(),
    status: text({ enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    completedAt: timestamp(tz),
    startAt: timestamp(tz),
    endAt: timestamp(tz),
    titleOverride: text(),
    notesOverride: text(),
    deletedAt: timestamp(tz),
    createdAt: timestamp(tz).notNull(),
    updatedAt: timestamp(tz).notNull(),
    serverUpdatedAt: timestamp(tz)
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    uniqueIndex('item_occurrences_item_data_idx').on(t.itemId, t.occurrenceDate),
    index('item_occurrences_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    index('item_occurrences_deleted_at_idx').on(t.deletedAt),
    foreignKey({
      name: 'item_occurrences_item_fk',
      columns: [t.userId, t.itemId],
      foreignColumns: [items.userId, items.id],
    }).onDelete('cascade'),
    check(
      'item_occurrences_type_check',
      sql`${t.type} in ('completed', 'cancelled', 'moved', 'edited')`,
    ),
    check('item_occurrences_status_check', sql`${t.status} in ('open', 'done')`),
    check(
      'item_occurrences_conclusao_check',
      sql`(${t.status} = 'done') = (${t.completedAt} is not null)`,
    ),
    check(
      'item_occurrences_intervalo_check',
      sql`${t.endAt} is null or (${t.startAt} is not null and ${t.endAt} >= ${t.startAt})`,
    ),
    pgPolicy('item_occurrences_dono', {
      for: 'all',
      to: papelApp,
      using: sql`${t.userId} = ${usuarioAtual}`,
      withCheck: sql`${t.userId} = ${usuarioAtual}`,
    }),
  ],
);

// ---- grade acadêmica (F5, especificação §5, ADR-0005) ---------------------------------------

const regexHora = sql.raw(`'^([01][0-9]|2[0-3]):[0-5][0-9]$'`);
const politica = (nome: string, userId: AnyPgColumn) =>
  pgPolicy(nome, {
    for: 'all',
    to: papelApp,
    using: sql`${userId} = ${usuarioAtual}`,
    withCheck: sql`${userId} = ${usuarioAtual}`,
  });
const colunasDeSync = {
  deletedAt: timestamp(tz),
  createdAt: timestamp(tz).notNull(),
  updatedAt: timestamp(tz).notNull(),
  serverUpdatedAt: timestamp(tz)
    .notNull()
    .default(sql`clock_timestamp()`),
};

export const semesters = pgTable(
  'semesters',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    label: text().notNull(),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }).notNull(),
    active: boolean().notNull().default(false),
    ...colunasDeSync,
  },
  (t) => [
    uniqueIndex('semesters_user_id_id_idx').on(t.userId, t.id),
    index('semesters_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    check('semesters_intervalo_check', sql`${t.endDate} >= ${t.startDate}`),
    check('semesters_label_check', sql`length(${t.label}) > 0`),
    politica('semesters_dono', t.userId),
  ],
);

export const courses = pgTable(
  'courses',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    semesterId: uuid().notNull(),
    name: text().notNull(),
    code: text(),
    professor: text(),
    color: text().notNull(),
    defaultRoom: text(),
    notes: text(),
    ...colunasDeSync,
  },
  (t) => [
    uniqueIndex('courses_user_id_id_idx').on(t.userId, t.id),
    index('courses_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    foreignKey({
      name: 'courses_semester_fk',
      columns: [t.userId, t.semesterId],
      foreignColumns: [semesters.userId, semesters.id],
    }).onDelete('cascade'),
    check('courses_color_check', sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check('courses_name_check', sql`length(${t.name}) > 0`),
    politica('courses_dono', t.userId),
  ],
);

export const classSlots = pgTable(
  'class_slots',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    courseId: uuid().notNull(),
    /** 0 = domingo … 6 = sábado. */
    weekday: smallint().notNull(),
    /** Hora de parede `HH:mm` — nunca timestamp (especificação §5). */
    startTime: text().notNull(),
    endTime: text().notNull(),
    room: text(),
    ...colunasDeSync,
  },
  (t) => [
    uniqueIndex('class_slots_user_id_id_idx').on(t.userId, t.id),
    index('class_slots_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    foreignKey({
      name: 'class_slots_course_fk',
      columns: [t.userId, t.courseId],
      foreignColumns: [courses.userId, courses.id],
    }).onDelete('cascade'),
    check('class_slots_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('class_slots_start_time_check', sql`${t.startTime} ~ ${regexHora}`),
    check('class_slots_end_time_check', sql`${t.endTime} ~ ${regexHora}`),
    check('class_slots_intervalo_check', sql`${t.endTime} > ${t.startTime}`),
    politica('class_slots_dono', t.userId),
  ],
);

export const classExceptions = pgTable(
  'class_exceptions',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    slotId: uuid().notNull(),
    date: date({ mode: 'string' }).notNull(),
    type: text({ enum: ['cancelled', 'room_change', 'extra'] }).notNull(),
    room: text(),
    note: text(),
    /** Só em `extra`: horário da reposição quando difere do regular (ADR-0005). */
    startTime: text(),
    endTime: text(),
    ...colunasDeSync,
  },
  (t) => [
    index('class_exceptions_user_id_server_updated_at_idx').on(t.userId, t.serverUpdatedAt),
    index('class_exceptions_slot_id_date_idx').on(t.slotId, t.date),
    foreignKey({
      name: 'class_exceptions_slot_fk',
      columns: [t.userId, t.slotId],
      foreignColumns: [classSlots.userId, classSlots.id],
    }).onDelete('cascade'),
    check('class_exceptions_type_check', sql`${t.type} in ('cancelled', 'room_change', 'extra')`),
    check(
      'class_exceptions_sala_check',
      sql`${t.type} <> 'room_change' or length(coalesce(${t.room}, '')) > 0`,
    ),
    check(
      'class_exceptions_horario_check',
      sql`(${t.startTime} is null and ${t.endTime} is null) or (${t.type} = 'extra' and ${t.startTime} ~ ${regexHora} and ${t.endTime} ~ ${regexHora} and ${t.endTime} > ${t.startTime})`,
    ),
    politica('class_exceptions_dono', t.userId),
  ],
);
