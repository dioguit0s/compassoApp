import { describe, expect, it } from 'vitest';
import {
  agruparPorDia,
  diasDoItem,
  instanteDeParede,
  intervaloDosDias,
  itemNoIntervalo,
  limitesDiaInteiro,
  posicionarNoDia,
  recortarDia,
  type ItemDeAgenda,
} from '../src';

const sp = (d: number, h: number, m = 0, mes = 9) => instanteDeParede(2026, mes, d, h, m);
let seq = 0;
function evento(inicio: Date, fim: Date | null, extra: Partial<ItemDeAgenda> = {}): ItemDeAgenda {
  return {
    id: String(++seq),
    title: `e${seq}`,
    kind: 'event',
    effort: null,
    allDay: false,
    dueAt: null,
    startAt: inicio,
    endAt: fim,
    status: 'open',
    ...extra,
  };
}
function tarefa(prazo: Date): ItemDeAgenda {
  return { ...evento(prazo, null), kind: 'task', startAt: null, dueAt: prazo, effort: 1 };
}

describe('itemNoIntervalo', () => {
  const hoje = intervaloDosDias('2026-09-23', '2026-09-23');

  it('evento de 3 dias que começou ontem aparece hoje', () => {
    const e = evento(sp(22, 10), sp(24, 18));
    expect(itemNoIntervalo(e, hoje.de, hoje.ate)).toBe(true);
  });

  it('tarefa com prazo hoje aparece hoje; amanhã não', () => {
    expect(itemNoIntervalo(tarefa(sp(23, 23, 59)), hoje.de, hoje.ate)).toBe(true);
    expect(itemNoIntervalo(tarefa(sp(24, 0)), hoje.de, hoje.ate)).toBe(false);
  });

  it('evento que termina à meia-noite não aparece no dia seguinte', () => {
    const e = evento(sp(22, 22), sp(23, 0));
    expect(itemNoIntervalo(e, hoje.de, hoje.ate)).toBe(false);
  });

  it('evento pontual (sem fim) só no próprio dia', () => {
    expect(itemNoIntervalo(evento(sp(23, 9), null), hoje.de, hoje.ate)).toBe(true);
    expect(itemNoIntervalo(evento(sp(22, 9), null), hoje.de, hoje.ate)).toBe(false);
  });

  it('dia inteiro não escorrega para o dia anterior em fuso negativo', () => {
    const { startAt, endAt } = limitesDiaInteiro('2026-09-23', '2026-09-23');
    const e = evento(startAt, endAt, { allDay: true });
    const ontem = intervaloDosDias('2026-09-22', '2026-09-22');
    expect(itemNoIntervalo(e, ontem.de, ontem.ate)).toBe(false);
    expect(itemNoIntervalo(e, hoje.de, hoje.ate)).toBe(true);
    expect(diasDoItem(e)).toEqual(['2026-09-23']);
  });
});

describe('diasDoItem e agruparPorDia', () => {
  it('sexta a domingo, dia inteiro, ocupa os três dias', () => {
    const { startAt, endAt } = limitesDiaInteiro('2026-09-25', '2026-09-27');
    const e = evento(startAt, endAt, { allDay: true });
    expect(diasDoItem(e)).toEqual(['2026-09-25', '2026-09-26', '2026-09-27']);
  });

  it('virada de mês', () => {
    const e = evento(sp(30, 20), instanteDeParede(2026, 10, 2, 9, 0));
    expect(diasDoItem(e)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('dia inteiro primeiro, depois por horário', () => {
    const tarde = evento(sp(23, 15), sp(23, 16), { title: 'tarde' });
    const manha = evento(sp(23, 8), sp(23, 9), { title: 'manhã' });
    const { startAt, endAt } = limitesDiaInteiro('2026-09-23', '2026-09-23');
    const feriado = evento(startAt, endAt, { allDay: true, title: 'feriado' });
    const mapa = agruparPorDia([tarde, manha, feriado], ['2026-09-23', '2026-09-24']);
    expect(mapa.get('2026-09-23')!.map((i) => i.title)).toEqual(['feriado', 'manhã', 'tarde']);
    expect(mapa.get('2026-09-24')).toEqual([]);
  });
});

describe('posicionarNoDia', () => {
  it('dois eventos no mesmo horário ficam lado a lado', () => {
    const a = evento(sp(23, 10), sp(23, 11));
    const b = evento(sp(23, 10), sp(23, 11));
    const c = evento(sp(23, 14), sp(23, 15));
    const blocos = posicionarNoDia([a, b, c], '2026-09-23');
    const porId = new Map(blocos.map((x) => [x.item.id, x]));
    expect(porId.get(a.id)).toMatchObject({ inicioMin: 600, fimMin: 660, colunas: 2 });
    expect(new Set([porId.get(a.id)!.coluna, porId.get(b.id)!.coluna])).toEqual(new Set([0, 1]));
    expect(porId.get(c.id)).toMatchObject({ coluna: 0, colunas: 1 });
  });

  it('cascata: a coluna liberada é reaproveitada', () => {
    const a = evento(sp(23, 9), sp(23, 12));
    const b = evento(sp(23, 9, 30), sp(23, 10));
    const c = evento(sp(23, 10, 30), sp(23, 11));
    const blocos = posicionarNoDia([a, b, c], '2026-09-23');
    expect(blocos.map((x) => [x.coluna, x.colunas])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
    ]);
  });

  it('dia inteiro e tarefas ficam fora da grade de horas', () => {
    const { startAt, endAt } = limitesDiaInteiro('2026-09-23', '2026-09-23');
    const blocos = posicionarNoDia(
      [evento(startAt, endAt, { allDay: true }), tarefa(sp(23, 10))],
      '2026-09-23',
    );
    expect(blocos).toEqual([]);
  });

  it('evento sem fim ganha duração mínima', () => {
    const [b] = posicionarNoDia([evento(sp(23, 23, 50), null)], '2026-09-23');
    expect(b).toMatchObject({ inicioMin: 1430, fimMin: 1440 });
  });
});

describe('recortarDia', () => {
  it('5 itens → 3 visíveis e +2', () => {
    expect(recortarDia([1, 2, 3, 4, 5])).toEqual({ visiveis: [1, 2, 3], excedentes: 2 });
    expect(recortarDia([1])).toEqual({ visiveis: [1], excedentes: 0 });
  });
});
