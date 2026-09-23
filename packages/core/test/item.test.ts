import { describe, expect, it } from 'vitest';
import { esquemaItem, novoId, violacoesDeInvariante, type ItemWire } from '../src';

const agora = new Date().toISOString();
export function eventoValido(extra: Partial<ItemWire> = {}): ItemWire {
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

describe('invariantes de item', () => {
  it('evento puro é válido', () => {
    expect(violacoesDeInvariante(eventoValido())).toEqual([]);
    expect(esquemaItem.safeParse(eventoValido()).success).toBe(true);
  });

  it('tarefa com esforço e principal é válida', () => {
    const t = eventoValido({
      kind: 'task',
      startAt: null,
      dueAt: agora,
      effort: 3,
      primaryAttribute: 'mente',
      secondaryAttribute: 'oficio',
    });
    expect(violacoesDeInvariante(t)).toEqual([]);
  });

  it.each<[string, Partial<ItemWire>]>([
    ['tarefa com início', { kind: 'task', effort: 1, primaryAttribute: 'casa' }],
    ['tarefa sem esforço', { kind: 'task', startAt: null }],
    ['evento com prazo', { dueAt: agora }],
    ['evento sem início', { startAt: null }],
    ['fim antes do início', { endAt: '2000-01-01T00:00:00Z' }],
    ['esforço sem principal', { effort: 2 }],
    ['principal sem esforço', { primaryAttribute: 'corpo' }],
    ['secundário sem principal', { secondaryAttribute: 'corpo' }],
    [
      'secundário igual ao principal',
      { effort: 2, primaryAttribute: 'corpo', secondaryAttribute: 'corpo' },
    ],
  ])('%s é inválido', (_nome, extra) => {
    expect(violacoesDeInvariante(eventoValido(extra)).length).toBeGreaterThan(0);
    expect(esquemaItem.safeParse(eventoValido(extra)).success).toBe(false);
  });

  it('esforço fora da escala é rejeitado pelo schema', () => {
    const r = esquemaItem.safeParse(eventoValido({ effort: 4, primaryAttribute: 'corpo' }));
    expect(r.success).toBe(false);
  });

  it('userId enviado pelo client é descartado', () => {
    const r = esquemaItem.parse({ ...eventoValido(), userId: novoId() });
    expect(r).not.toHaveProperty('userId');
  });
});

describe('invariantes de série', () => {
  it('série válida', () => {
    expect(violacoesDeInvariante(eventoValido({ rrule: 'FREQ=WEEKLY;BYDAY=TU' }))).toEqual([]);
  });
  it('rrule fora do subconjunto é recusada com motivo', () => {
    expect(violacoesDeInvariante(eventoValido({ rrule: 'FREQ=DAILY;BYSETPOS=1' }))).toEqual([
      'recorrência inválida: BYSETPOS não é suportado',
    ]);
  });
  it('série não usa status nem completedAt', () => {
    const v = violacoesDeInvariante(
      eventoValido({ rrule: 'FREQ=DAILY', status: 'done', completedAt: new Date().toISOString() }),
    );
    expect(v).toContain('série não usa status nem data de conclusão');
  });
});
