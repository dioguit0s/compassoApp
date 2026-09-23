import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
  /** Lembrete padrão de itens novos (F8); null = sem lembrete. */
  defaultReminderMinutes: integer(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  /** Quando este registro foi confirmado pelo servidor pela última vez. */
  buscadoEm: integer({ mode: 'timestamp_ms' }).notNull(),
  /** Nome/preferências editados aqui e ainda não enviados (`PATCH /me` na próxima conexão). */
  pendente: integer({ mode: 'boolean' }).notNull().default(false),
  /** Caminho local da foto baixada, para aparecer offline. */
  avatarLocal: text(),
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
    sourceUid: text(),
    courseId: text(),
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

/**
 * Desvios de ocorrência de série (especificação §5). A identidade é `(item_id, occurrence_date)`,
 * com índice único: dois aparelhos que criem offline o desvio da mesma data convergem nela
 * (ADR-0004). `occurrence_date` é texto `AAAA-MM-DD`, o dia civil original em São Paulo.
 */
export const itemOccurrences = sqliteTable(
  'item_occurrences',
  {
    id: text().primaryKey(),
    itemId: text().notNull(),
    occurrenceDate: text().notNull(),
    type: text({ enum: ['completed', 'cancelled', 'moved', 'edited'] }).notNull(),
    status: text({ enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    completedAt: data(),
    startAt: data(),
    endAt: data(),
    titleOverride: text(),
    notesOverride: text(),
    deletedAt: data(),
    createdAt: data().notNull(),
    updatedAt: data().notNull(),
    dirty: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    uniqueIndex('item_occurrences_item_data_idx').on(t.itemId, t.occurrenceDate),
    index('item_occurrences_dirty_idx').on(t.dirty),
  ],
);

export type OcorrenciaLocal = typeof itemOccurrences.$inferSelect;

// ---- grade acadêmica (F5) ---------------------------------------------------------------------
// Mesmas colunas do servidor (menos user_id e server_updated_at) + dirty. Datas civis em texto
// AAAA-MM-DD; horários em texto HH:mm (hora de parede em São Paulo, ADR-0003 e ADR-0005).

const sync = {
  deletedAt: data(),
  createdAt: data().notNull(),
  updatedAt: data().notNull(),
  dirty: integer({ mode: 'boolean' }).notNull().default(false),
};

export const semesters = sqliteTable('semesters', {
  id: text().primaryKey(),
  label: text().notNull(),
  startDate: text().notNull(),
  endDate: text().notNull(),
  active: integer({ mode: 'boolean' }).notNull().default(false),
  ...sync,
});

export const courses = sqliteTable(
  'courses',
  {
    id: text().primaryKey(),
    semesterId: text().notNull(),
    name: text().notNull(),
    code: text(),
    professor: text(),
    color: text().notNull(),
    defaultRoom: text(),
    notes: text(),
    ...sync,
  },
  (t) => [index('courses_semester_id_idx').on(t.semesterId)],
);

export const classSlots = sqliteTable(
  'class_slots',
  {
    id: text().primaryKey(),
    courseId: text().notNull(),
    weekday: integer().notNull(),
    startTime: text().notNull(),
    endTime: text().notNull(),
    room: text(),
    ...sync,
  },
  (t) => [index('class_slots_course_id_idx').on(t.courseId)],
);

export const classExceptions = sqliteTable(
  'class_exceptions',
  {
    id: text().primaryKey(),
    slotId: text().notNull(),
    date: text().notNull(),
    type: text({ enum: ['cancelled', 'room_change', 'extra'] }).notNull(),
    room: text(),
    note: text(),
    startTime: text(),
    endTime: text(),
    ...sync,
  },
  (t) => [index('class_exceptions_slot_id_date_idx').on(t.slotId, t.date)],
);

export type SemestreLocal = typeof semesters.$inferSelect;
export type DisciplinaLocal = typeof courses.$inferSelect;
export type HorarioLocal = typeof classSlots.$inferSelect;
export type ExcecaoLocal = typeof classExceptions.$inferSelect;

// ---- gamificação (F6/F7): eventos de conclusão e ledger ------------------------------------
// O ledger (xp_entries, coin_entries) é gerado pelo servidor e só chega pelo pull; o aparelho
// nunca escreve nele. `completions` é escrito aqui (o toque) e enviado pelo push. Nenhuma das
// três tem deletedAt: append-only (especificação §5, ADR-0006).

export const completions = sqliteTable(
  'completions',
  {
    id: text().primaryKey(),
    itemId: text().notNull(),
    occurrenceDate: text(),
    action: text({ enum: ['complete', 'uncomplete'] }).notNull(),
    at: data().notNull(),
    createdAt: data().notNull(),
    updatedAt: data().notNull(),
    dirty: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('completions_item_idx').on(t.itemId, t.occurrenceDate),
    index('completions_dirty_idx').on(t.dirty),
  ],
);

export const xpEntries = sqliteTable(
  'xp_entries',
  {
    id: text().primaryKey(),
    itemId: text().notNull(),
    occurrenceDate: text(),
    completionId: text().notNull(),
    attribute: text({ enum: ATRIBUTOS }).notNull(),
    points: integer().notNull(),
    earnedAt: data().notNull(),
  },
  (t) => [
    index('xp_entries_attribute_earned_at_idx').on(t.attribute, t.earnedAt),
    index('xp_entries_item_idx').on(t.itemId, t.occurrenceDate),
  ],
);

export const coinEntries = sqliteTable('coin_entries', {
  id: text().primaryKey(),
  amount: integer().notNull(),
  source: text({ enum: ['task', 'redemption'] }).notNull(),
  refId: text().notNull(),
  createdAt: data().notNull(),
});

export type ConclusaoLocal = typeof completions.$inferSelect;
export type LancamentoLocal = typeof xpEntries.$inferSelect;
export type MoedaLocal = typeof coinEntries.$inferSelect;

// ---- economia (F7) ---------------------------------------------------------------------------

export const rewards = sqliteTable('rewards', {
  id: text().primaryKey(),
  name: text().notNull(),
  price: integer().notNull(),
  cooldownDays: integer().notNull(),
  priceEffectiveFrom: text().notNull(),
  pendingPrice: integer(),
  pendingFrom: text(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  ...sync,
});

/** Só chega pelo pull: o resgate é feito no servidor (ADR-0007). */
export const redemptions = sqliteTable(
  'redemptions',
  {
    id: text().primaryKey(),
    rewardId: text().notNull(),
    pricePaid: integer().notNull(),
    redeemedAt: data().notNull(),
  },
  (t) => [index('redemptions_reward_idx').on(t.rewardId, t.redeemedAt)],
);

export type RecompensaLocal = typeof rewards.$inferSelect;
export type ResgateLocal = typeof redemptions.$inferSelect;
