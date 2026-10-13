import { describe, expect, it } from 'vitest';
import {
  HORIZONTE_NOTIFICACOES_DIAS,
  instanteDeParede,
  instanteDoDisparo,
  listarDisparos,
  ORCAMENTO_NOTIFICACOES,
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
    courseId: null,
    postponeCount: 0,
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

  it('um disparo por lembrete do item, em ordem de disparo', () => {
    const prova = item({
      id: 'prova',
      startAt: sp(10, 5, 14),
      reminderMinutesBefore: 60,
      remindersMinutesBefore: [60, 1440],
    });
    const d = selecionarDisparos(projetarAgenda([prova], [], agora, ate), agora);
    expect(d.map((x) => [x.instante, x.minutosAntes])).toEqual([
      [sp(10, 4, 14), 1440],
      [sp(10, 5, 13), 60],
    ]);
    // Mesmo item, ids diferentes: cancelar um lembrete não derruba o outro.
    expect(new Set(d.map((x) => x.id)).size).toBe(2);
    expect(d[0]!.id.startsWith(`compasso:prova@unico@${sp(10, 4, 14).getTime()}@1440@`)).toBe(true);
  });

  it('lembrete que já passou sai; o outro do mesmo item continua', () => {
    const consulta = item({ startAt: sp(10, 1, 9), remindersMinutesBefore: [30, 1440] });
    const d = selecionarDisparos(projetarAgenda([consulta], [], agora, ate), agora);
    expect(d.map((x) => x.minutosAntes)).toEqual([30]);
  });

  it('item só com o campo antigo continua gerando o lembrete único', () => {
    const antigo = item({ reminderMinutesBefore: 15 });
    const d = selecionarDisparos(projetarAgenda([antigo], [], agora, ate), agora);
    expect(d.map((x) => x.minutosAntes)).toEqual([15]);
  });

  it('série diária com 2 lembretes estoura o orçamento: ficam os 60 mais próximos', () => {
    const remedio = item({
      rrule: 'FREQ=DAILY',
      startAt: sp(10, 1, 8),
      remindersMinutesBefore: [10, 60],
    });
    const horizonte = new Date(agora.getTime() + HORIZONTE_NOTIFICACOES_DIAS * 86_400_000);
    const entradas = projetarAgenda([remedio], [], agora, horizonte);
    const todos = listarDisparos(entradas, agora);
    // 45 dias × 2 lembretes: não cabe.
    expect(todos.length).toBe(entradas.length * 2);
    expect(todos.length).toBeGreaterThan(ORCAMENTO_NOTIFICACOES);
    const d = selecionarDisparos(entradas, agora);
    expect(d).toHaveLength(ORCAMENTO_NOTIFICACOES);
    // O orçamento é global e por proximidade: 30 dias inteiros, os dois lembretes de cada um.
    expect(d[0]!.instante).toEqual(sp(10, 1, 7));
    expect(d[1]!.instante).toEqual(sp(10, 1, 7, 50));
    expect(d.at(-1)!.instante).toEqual(sp(10, 30, 7, 50));
    expect(new Set(d.map((x) => x.ocorrencia)).size).toBe(30);
    // O primeiro que ficou de fora é o do dia seguinte.
    expect(todos[ORCAMENTO_NOTIFICACOES]!.instante).toEqual(sp(10, 31, 7));
  });

  it('orçamento compartilhado: o avulso próximo entra na frente do lembrete distante da série', () => {
    const remedio = item({
      rrule: 'FREQ=DAILY',
      startAt: sp(10, 1, 8),
      remindersMinutesBefore: [10, 60],
    });
    const prova = item({ id: 'prova', startAt: sp(10, 2, 14), remindersMinutesBefore: [60] });
    const d = selecionarDisparos(projetarAgenda([remedio, prova], [], agora, ate), agora, 4);
    expect(d.map((x) => x.instante)).toEqual([
      sp(10, 1, 7),
      sp(10, 1, 7, 50),
      sp(10, 2, 7),
      sp(10, 2, 7, 50),
    ]);
    const cinco = selecionarDisparos(projetarAgenda([remedio, prova], [], agora, ate), agora, 5);
    expect(cinco.at(-1)!.itemId).toBe('prova');
  });

  it('o corpo recebe o instante do disparo', () => {
    const prova = item({ startAt: sp(10, 5, 14), remindersMinutesBefore: [0, 1440] });
    const d = selecionarDisparos(
      projetarAgenda([prova], [], agora, ate),
      agora,
      undefined,
      (e, instante) => (instante.getTime() === e.startAt!.getTime() ? 'agora' : 'amanhã'),
    );
    expect(d.map((x) => x.corpo)).toEqual(['amanhã', 'agora']);
  });

  it('id estável por item+ocorrência+instante+texto', () => {
    const e = projetarAgenda(
      [item({ id: 'x', rrule: 'FREQ=DAILY;COUNT=1', startAt: sp(10, 1, 8) })],
      [],
      agora,
      ate,
    );
    const [a] = selecionarDisparos(e, agora);
    const [b] = selecionarDisparos(e, agora);
    expect(a!.id).toBe(b!.id);
    expect(a!.id.startsWith(`compasso:x@2026-10-01@${sp(10, 1, 7, 45).getTime()}@`)).toBe(true);
    const renomeado = e.map((x) => ({ ...x, title: 'Outro título' }));
    expect(selecionarDisparos(renomeado, agora)[0]!.id).not.toBe(a!.id);
  });
});

describe('instanteDoDisparo', () => {
  it('lê o instante do id gerado, não o resumo do texto no fim', () => {
    // A tela "Lembretes agendados" lia o último segmento (o resumo) e mostrava "?".
    const d = selecionarDisparos(projetarAgenda([item({})], [], agora, ate), agora);
    expect(d).toHaveLength(1);
    expect(instanteDoDisparo(d[0]!.id)).toBe(d[0]!.instante.getTime());
    expect(instanteDoDisparo('outro-app:1')).toBeNull();
    expect(instanteDoDisparo('compasso:x@unico@abc@r')).toBeNull();
    // Id da versão anterior, sem os minutos: ainda lido até o próximo reagendamento.
    expect(instanteDoDisparo('compasso:x@unico@1790000000000@r')).toBe(1790000000000);
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
