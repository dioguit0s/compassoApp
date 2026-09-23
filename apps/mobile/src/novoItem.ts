import { FUSO_PADRAO } from '@compasso/core';
import type { DadosItem } from '@compasso/core/local';

/**
 * Item criado pela UI da F2: sempre compromisso puro (`event`, sem esforço). Tarefa exige
 * esforço, e esforço e atributos só entram na UI na F6 (issue #15, decisão registrada).
 */
export function novoCompromisso(titulo: string, inicio: Date, fim: Date | null): DadosItem {
  return {
    title: titulo,
    notes: null,
    kind: 'event',
    effort: null,
    effortLockedAt: null,
    primaryAttribute: null,
    secondaryAttribute: null,
    dueAt: null,
    startAt: inicio,
    endAt: fim,
    allDay: false,
    timezone: FUSO_PADRAO,
    rrule: null,
    completedAt: null,
    reminderMinutesBefore: null,
  };
}
