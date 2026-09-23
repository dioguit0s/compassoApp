import { novoId, type ItemWire } from '@compasso/core';

export function evento(extra: Partial<ItemWire> = {}): ItemWire {
  const agora = new Date().toISOString();
  return {
    id: novoId(),
    title: 'Dentista',
    notes: null,
    kind: 'event',
    effort: null,
    effortLockedAt: null,
    primaryAttribute: null,
    secondaryAttribute: null,
    dueAt: null,
    startAt: agora,
    endAt: null,
    allDay: false,
    timezone: 'America/Sao_Paulo',
    rrule: null,
    sourceUid: null,
    recurrenceEndsAt: null,
    status: 'open',
    completedAt: null,
    postponeCount: 0,
    reminderMinutesBefore: null,
    deletedAt: null,
    createdAt: agora,
    updatedAt: agora,
    ...extra,
  };
}
