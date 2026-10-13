import { describe, expect, it } from 'vitest';
import {
  esquemaItem,
  lembretesDoItem,
  normalizarLembretes,
  resolverLembretes,
  rotuloDoLembrete,
} from '../src';

describe('normalizarLembretes', () => {
  it('tira repetição e ordena do mais próximo ao mais distante', () => {
    expect(normalizarLembretes([1440, 60, 60, 10])).toEqual([10, 60, 1440]);
    expect(normalizarLembretes([])).toEqual([]);
  });
});

describe('lembretesDoItem', () => {
  it.each([
    [{ remindersMinutesBefore: [1440, 60], reminderMinutesBefore: 60 }, [60, 1440]],
    [{ remindersMinutesBefore: [], reminderMinutesBefore: null }, []],
    // Versão antiga: só o campo único.
    [{ reminderMinutesBefore: 30 }, [30]],
    [{ remindersMinutesBefore: null, reminderMinutesBefore: 30 }, [30]],
    [{ reminderMinutesBefore: null }, []],
  ])('%o → %o', (item, esperado) => expect(lembretesDoItem(item)).toEqual(esperado));
});

describe('resolverLembretes (ADR-0018)', () => {
  const casos: {
    nome: string;
    novo: { remindersMinutesBefore?: number[]; reminderMinutesBefore: number | null };
    atuais?: number[];
    lista: number[];
    espelho: number | null;
  }[] = [
    {
      nome: 'com a lista, ela manda e o campo antigo espelha o primeiro',
      novo: { remindersMinutesBefore: [1440, 60], reminderMinutesBefore: 5 },
      atuais: [5],
      lista: [60, 1440],
      espelho: 60,
    },
    {
      nome: 'lista vazia apaga o lembrete, mesmo com o campo antigo preenchido',
      novo: { remindersMinutesBefore: [], reminderMinutesBefore: 30 },
      atuais: [30],
      lista: [],
      espelho: null,
    },
    {
      nome: 'versão antiga não mexeu no lembrete: os extras ficam',
      novo: { reminderMinutesBefore: 60 },
      atuais: [60, 1440],
      lista: [60, 1440],
      espelho: 60,
    },
    {
      nome: 'versão antiga trocou o lembrete: vale só o novo',
      novo: { reminderMinutesBefore: 15 },
      atuais: [60, 1440],
      lista: [15],
      espelho: 15,
    },
    {
      nome: 'versão antiga tirou o lembrete: a lista esvazia',
      novo: { reminderMinutesBefore: null },
      atuais: [60, 1440],
      lista: [],
      espelho: null,
    },
    {
      nome: 'versão antiga, item sem lembrete continua sem',
      novo: { reminderMinutesBefore: null },
      atuais: [],
      lista: [],
      espelho: null,
    },
    {
      nome: 'item novo de versão antiga: a lista nasce do campo único',
      novo: { reminderMinutesBefore: 10 },
      lista: [10],
      espelho: 10,
    },
  ];
  it.each(casos)('$nome', ({ novo, atuais, lista, espelho }) => {
    expect(resolverLembretes(novo, atuais)).toEqual({
      remindersMinutesBefore: lista,
      reminderMinutesBefore: espelho,
    });
  });
});

describe('rotuloDoLembrete', () => {
  it.each([
    [0, 'na hora'],
    [10, '10 min antes'],
    [60, '1 h antes'],
    [90, '1 h 30 antes'],
    [1440, '1 dia antes'],
    [2880, '2 dias antes'],
    [1500, '25 h antes'],
  ])('%i → %s', (min, texto) => expect(rotuloDoLembrete(min)).toBe(texto));
});

describe('esquemaItem: lista de lembretes no transporte', () => {
  const agora = '2026-10-01T12:00:00.000Z';
  const item = (extra: object) => ({
    id: '019a0000-0000-7000-8000-000000000001',
    title: 'Prova',
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
    recurrenceEndsAt: null,
    status: 'open',
    completedAt: null,
    postponeCount: 0,
    reminderMinutesBefore: null,
    deletedAt: null,
    createdAt: agora,
    updatedAt: agora,
    ...extra,
  });

  it('aceita item sem a lista (versão antiga do app) e não inventa o campo', () => {
    const r = esquemaItem.parse(item({ reminderMinutesBefore: 30 }));
    expect(r.remindersMinutesBefore).toBeUndefined();
    expect(r.reminderMinutesBefore).toBe(30);
  });

  it('aceita até 5 lembretes e recusa o sexto, negativo ou fracionado', () => {
    const lista = (l: unknown) =>
      esquemaItem.safeParse(item({ remindersMinutesBefore: l })).success;
    expect(lista([0, 10, 60, 1440, 2880])).toBe(true);
    expect(lista([0, 10, 60, 1440, 2880, 4320])).toBe(false);
    expect(lista([-1])).toBe(false);
    expect(lista([1.5])).toBe(false);
    expect(lista([525_601])).toBe(false);
  });
});
