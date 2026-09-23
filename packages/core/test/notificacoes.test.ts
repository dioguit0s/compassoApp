import { describe, expect, it } from 'vitest';
import {
  instanteDeParede,
  planejarReagendamento,
  projetarAgenda,
  selecionarDisparos,
  type ItemParaProjecao,
} from '../src';

const sp = (m: number, d: number, h = 0, mi = 0) => instanteDeParede(2026, m, d, h, mi);
let seq = 0;
function item(extra: Partial<ItemParaProjecao>): ItemParaProjecao {
  return {
    id: `i${++seq}`,
    title: `item ${seq}`,
    notes: null,
    kind: 'event',
    effort: null,
    allDay: false,
    dueAt: null,
    startAt: sp(10, 1, 9),
    endAt: null,
    status: 'open',
    rrule: null,
    timezone: 'America/Sao_Paulo',
    recurrenceEndsAt: null,
    reminderMinutesBefore: 15,
    deletedAt: null,
    ...extra,
  };
}

const agora = sp(9, 30, 12);
const ate = sp(12, 31);

describe('selecionarDisparos (#48)', () => {
  it('200 ocorrências futuras com lembrete → exatamente o orçamento, as mais próximas', () => {
    const diaria = item({ rrule: 'FREQ=DAILY;COUNT=200', startAt: sp(10, 1, 8) });
    const entradas = projetarAgenda([diaria], [], agora, sp(12, 31, 23));
    expect(entradas.length).toBeGreaterThan(60);
    const d = selecionarDisparos(entradas, agora);
    expect(d).toHaveLength(60);
    expect(d[0]!.instante).toEqual(sp(10, 1, 7, 45));
    expect(d.at(-1)!.instante).toEqual(sp(11, 29, 7, 45));
  });

  it('série diária + eventos avulsos: os N mais próximos, em ordem', () => {
    const diaria = item({ rrule: 'FREQ=DAILY', startAt: sp(10, 1, 8), reminderMinutesBefore: 0 });
    const avulso = item({ startAt: sp(10, 2, 7, 30), reminderMinutesBefore: 60 });
    const longe = item({ startAt: sp(12, 1, 10) });
    const d = selecionarDisparos(projetarAgenda([diaria, avulso, longe], [], agora, ate), agora, 4);
    expect(d.map((x) => x.instante)).toEqual([
      sp(10, 1, 8),
      sp(10, 2, 6, 30),
      sp(10, 2, 8),
      sp(10, 3, 8),
    ]);
  });

  it('ocorrência cancelada, concluída, sem lembrete ou no passado não geram disparo', () => {
    const s = item({ rrule: 'FREQ=DAILY;COUNT=3', startAt: sp(10, 1, 8), effort: 1 });
    const semLembrete = item({ reminderMinutesBefore: null });
    const passado = item({ startAt: sp(9, 30, 12, 10), reminderMinutesBefore: 15 });
    const entradas = projetarAgenda(
      [s, semLembrete, passado],
      [
        {
          itemId: s.id,
          occurrenceDate: '2026-10-01',
          type: 'cancelled',
          status: 'open',
          startAt: null,
          endAt: null,
          titleOverride: null,
          notesOverride: null,
          deletedAt: null,
        },
        {
          itemId: s.id,
          occurrenceDate: '2026-10-02',
          type: 'completed',
          status: 'done',
          startAt: null,
          endAt: null,
          titleOverride: null,
          notesOverride: null,
          deletedAt: null,
        },
      ],
      agora,
      ate,
    );
    expect(selecionarDisparos(entradas, agora).map((x) => x.ocorrencia)).toEqual(['2026-10-03']);
  });

  it('id estável por item+ocorrência+instante', () => {
    const e = projetarAgenda(
      [item({ id: 'x', rrule: 'FREQ=DAILY;COUNT=1', startAt: sp(10, 1, 8) })],
      [],
      agora,
      ate,
    );
    const [a] = selecionarDisparos(e, agora);
    const [b] = selecionarDisparos(e, agora);
    expect(a!.id).toBe(b!.id);
    expect(a!.id).toBe(`compasso:x@2026-10-01@${sp(10, 1, 7, 45).getTime()}`);
  });
});

describe('planejarReagendamento', () => {
  it('cancela o que saiu, agenda o que entrou, não toca no que não é do Compasso', () => {
    const e = projetarAgenda(
      [item({ id: 'a' }), item({ id: 'b', startAt: sp(10, 2, 9) })],
      [],
      agora,
      ate,
    );
    const sel = selecionarDisparos(e, agora);
    const plano = planejarReagendamento([sel[0]!.id, 'compasso:velho@unico@1', 'outro-app'], sel);
    expect(plano.cancelar).toEqual(['compasso:velho@unico@1']);
    expect(plano.agendar.map((d) => d.itemId)).toEqual(['b']);
  });
});
