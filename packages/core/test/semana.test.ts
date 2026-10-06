import { describe, expect, it } from 'vitest';
import {
  instanteDeParede,
  limitesDiaInteiro,
  resumirSemana,
  type Aula,
  type Dia,
  type ItemDeAgenda,
  type ItemDaSemana,
} from '../src';

const sp = (d: number, h: number, m = 0) => instanteDeParede(2026, 10, d, h, m);
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
function tarefa(prazo: Date, title: string): ItemDeAgenda {
  return { ...evento(prazo, null), kind: 'task', startAt: null, dueAt: prazo, effort: 1, title };
}
function aula(dia: Dia, inicio: string, extra: Partial<Aula> = {}): Aula {
  return {
    id: `s@${dia}`,
    slotId: 's',
    courseId: 'c',
    dia,
    disciplina: 'Cálculo II',
    codigo: null,
    professor: null,
    cor: '#2F4E7A',
    inicio,
    fim: '10:40',
    sala: null,
    salaTrocada: false,
    cancelada: false,
    extra: false,
    nota: null,
    ...extra,
  };
}
const semAulas = () => [];
const rotulo = (i: ItemDaSemana<ItemDeAgenda>) =>
  i.tipo === 'aula' ? i.aula.disciplina : i.entrada.title;

// 2026-10-06 é terça-feira: a semana vai de domingo 04/10 a sábado 10/10.
const HOJE = '2026-10-06';

describe('resumirSemana', () => {
  it('sete dias de domingo a sábado, com hoje marcado', () => {
    const semana = resumirSemana(HOJE, [], semAulas);
    expect(semana.map((d) => d.dia)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    expect(semana.filter((d) => d.ehHoje).map((d) => d.dia)).toEqual([HOJE]);
  });

  it('no domingo a semana começa no próprio dia; no sábado termina nele', () => {
    expect(resumirSemana('2026-10-04', [], semAulas)[0]!.dia).toBe('2026-10-04');
    expect(resumirSemana('2026-10-10', [], semAulas)[6]!.dia).toBe('2026-10-10');
  });

  it('evento às 23h30 de São Paulo fica no próprio dia, não no seguinte (UTC)', () => {
    const e = evento(sp(6, 23, 30), sp(6, 23, 50), { title: 'tarde' });
    const semana = resumirSemana(HOJE, [e], semAulas);
    expect(semana[2]!.itens.map(rotulo)).toEqual(['tarde']);
    expect(semana[3]!.itens).toEqual([]);
  });

  it('evento de vários dias e de dia inteiro ocupam cada dia', () => {
    const viagem = evento(sp(7, 10), sp(9, 18), { title: 'viagem' });
    const { startAt, endAt } = limitesDiaInteiro('2026-10-10', '2026-10-10');
    const feriado = evento(startAt, endAt, { allDay: true, title: 'feriado' });
    const semana = resumirSemana(HOJE, [viagem, feriado], semAulas);
    expect(semana.map((d) => d.itens.map(rotulo))).toEqual([
      [],
      [],
      [],
      ['viagem'],
      ['viagem'],
      ['viagem'],
      ['feriado'],
    ]);
  });

  it('mistura agenda e aulas: faixa primeiro, depois pelo horário', () => {
    const itens = [
      evento(sp(6, 14), sp(6, 15), { title: 'dentista' }),
      tarefa(sp(6, 23, 59), 'relatório'),
      evento(sp(6, 8), sp(6, 9), { title: 'café' }),
    ];
    const aulas = (d: Dia) => (d === HOJE ? [aula(d, '09:00')] : []);
    const semana = resumirSemana(HOJE, itens, aulas, 10);
    expect(semana[2]!.itens.map(rotulo)).toEqual(['relatório', 'café', 'Cálculo II', 'dentista']);
  });

  it('aula cancelada não entra', () => {
    const aulas = (d: Dia) => (d === HOJE ? [aula(d, '09:00', { cancelada: true })] : []);
    expect(resumirSemana(HOJE, [], aulas)[2]!.itens).toEqual([]);
  });

  it('corta no limite e conta os excedentes', () => {
    const itens = [8, 9, 10, 11, 12].map((h) => evento(sp(6, h), sp(6, h, 30), { title: `${h}h` }));
    const dia = resumirSemana(HOJE, itens, semAulas, 3)[2]!;
    expect(dia.itens.map(rotulo)).toEqual(['8h', '9h', '10h']);
    expect(dia.excedentes).toBe(2);
  });
});
