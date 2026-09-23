import { describe, expect, it } from 'vitest';
import {
  descreverRegra,
  instanteDeParede,
  lerOpcoes,
  montarRRule,
  validarRRule,
  type OpcoesRecorrencia,
} from '../src';

const terca = instanteDeParede(2026, 9, 8, 19, 0); // 2ª terça de setembro
const sexta = instanteDeParede(2026, 9, 25, 18, 0); // última sexta
const opc = (o: Partial<OpcoesRecorrencia>): OpcoesRecorrencia => ({
  freq: 'WEEKLY',
  intervalo: 1,
  diasDaSemana: [],
  mensal: 'dia',
  fim: { tipo: 'nunca' },
  ...o,
});

describe('montarRRule', () => {
  it.each<[Partial<OpcoesRecorrencia>, Date, string]>([
    [{ freq: 'DAILY' }, terca, 'FREQ=DAILY'],
    [
      { freq: 'DAILY', intervalo: 2, fim: { tipo: 'vezes', n: 10 } },
      terca,
      'FREQ=DAILY;INTERVAL=2;COUNT=10',
    ],
    [{ diasDaSemana: [4, 2] }, terca, 'FREQ=WEEKLY;BYDAY=TU,TH'],
    [{ intervalo: 2 }, terca, 'FREQ=WEEKLY;INTERVAL=2'],
    [{ freq: 'MONTHLY' }, terca, 'FREQ=MONTHLY'],
    [{ freq: 'MONTHLY', mensal: 'semana' }, terca, 'FREQ=MONTHLY;BYDAY=2TU'],
    [{ freq: 'MONTHLY', mensal: 'semana' }, sexta, 'FREQ=MONTHLY;BYDAY=-1FR'],
    [
      { freq: 'YEARLY', fim: { tipo: 'data', dia: '2030-12-31' } },
      terca,
      'FREQ=YEARLY;UNTIL=20301231',
    ],
  ])('%j → regra válida', (o, inicio, esperado) => {
    const r = montarRRule(opc(o), inicio);
    expect(r).toBe(esperado);
    expect(validarRRule(r).valida).toBe(true);
    expect(lerOpcoes(r, inicio)).toEqual(
      opc({ ...o, diasDaSemana: o.diasDaSemana ? [...o.diasDaSemana].sort() : [] }),
    );
  });

  it('regra fora do editor simples devolve null em lerOpcoes', () => {
    expect(lerOpcoes('FREQ=MONTHLY;BYMONTHDAY=1,15', terca)).toBeNull();
    expect(lerOpcoes('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', terca)).toBeNull();
    expect(lerOpcoes('lixo', terca)).toBeNull();
  });
});

describe('descreverRegra', () => {
  it.each([
    ['FREQ=DAILY', terca, 'Todo dia'],
    ['FREQ=DAILY;INTERVAL=3;COUNT=1', terca, 'A cada 3 dias, 1 vez'],
    ['FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261130', terca, 'Toda terça e quinta, até 30/11/2026'],
    ['FREQ=WEEKLY', terca, 'Toda terça'],
    ['FREQ=WEEKLY;BYDAY=SA,SU', terca, 'Todo sábado e domingo'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR', terca, 'A cada 2 semanas: segunda, quarta e sexta'],
    ['FREQ=MONTHLY;BYMONTHDAY=31', terca, 'Todo mês no dia 31'],
    ['FREQ=MONTHLY;BYDAY=2TU', terca, 'Todo mês na 2ª terça'],
    ['FREQ=MONTHLY;BYDAY=-1FR;COUNT=12', sexta, 'Todo mês na última sexta, 12 vezes'],
    ['FREQ=YEARLY', instanteDeParede(2024, 2, 29, 12, 0), 'Todo ano em 29 de fevereiro'],
    ['FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', terca, 'Todo ano na 4ª quinta de novembro'],
    ['FREQ=DAILY;BYSETPOS=1', terca, 'regra inválida: BYSETPOS não é suportado'],
  ])('%s', (r, inicio, esperado) => {
    expect(descreverRegra(r, inicio)).toBe(esperado);
  });
});
