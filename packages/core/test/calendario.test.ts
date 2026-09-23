import { describe, expect, it } from 'vitest';
import {
  diaDaSemana,
  diaDe,
  diasDaSemana,
  diferencaEmDias,
  ehBissexto,
  formatarNoFuso,
  horaDe,
  inicioDaSemana,
  inicioDoDia,
  instanteDeParede,
  intervaloDosDias,
  proximaHoraCheia,
  semanasDoMes,
  somarDias,
  somarMeses,
} from '../src';

describe('instanteDeParede', () => {
  it('São Paulo: 14:00 local = 17:00 UTC', () => {
    expect(instanteDeParede(2026, 9, 23, 14, 0).toISOString()).toBe('2026-09-23T17:00:00.000Z');
  });

  it('ida e volta com formatarNoFuso em vários fusos', () => {
    for (const fuso of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'America/New_York']) {
      const t = instanteDeParede(2026, 11, 1, 1, 30, fuso);
      expect(formatarNoFuso(t, fuso)).toBe('2026-11-01 01:30');
    }
  });

  it('lacuna de horário de verão avança para depois dela', () => {
    const t = instanteDeParede(2026, 3, 8, 2, 30, 'America/New_York');
    expect(formatarNoFuso(t, 'America/New_York')).toBe('2026-03-08 03:30');
  });

  it('hora repetida escolhe a primeira', () => {
    const t = instanteDeParede(2026, 11, 1, 1, 30, 'America/New_York');
    expect(t.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('São Paulo com horário de verão histórico (2018)', () => {
    // 2018-11-04: SP adiantou de 00:00 para 01:00.
    expect(formatarNoFuso(instanteDeParede(2018, 11, 4, 0, 30), 'America/Sao_Paulo')).toBe(
      '2018-11-04 01:30',
    );
    expect(instanteDeParede(2018, 12, 1, 12, 0).toISOString()).toBe('2018-12-01T14:00:00.000Z');
  });
});

describe('dias civis', () => {
  it('diaDe usa o fuso, não UTC', () => {
    expect(diaDe(new Date('2026-09-24T02:00:00Z'))).toBe('2026-09-23');
    expect(diaDe(new Date('2026-09-24T02:00:00Z'), 'UTC')).toBe('2026-09-24');
    expect(horaDe(new Date('2026-09-24T02:00:00Z'))).toBe('23:00');
  });

  it('somarDias atravessa mês, ano e fevereiro bissexto', () => {
    expect(somarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2027-02-28', 1)).toBe('2027-03-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diferencaEmDias('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('somarMeses prende no último dia do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('semana começa no domingo', () => {
    expect(diaDaSemana('2026-09-23')).toBe(3); // quarta
    expect(inicioDaSemana('2026-09-23')).toBe('2026-09-20');
    expect(inicioDaSemana('2026-09-20')).toBe('2026-09-20');
    expect(diasDaSemana('2026-12-31')).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('semanasDoMes cobre o mês com semanas completas', () => {
    const set = semanasDoMes('2026-09-15');
    expect(set[0]![0]).toBe('2026-08-30');
    expect(set.at(-1)!.at(-1)).toBe('2026-10-03');
    expect(set).toHaveLength(5);
    expect(semanasDoMes('2026-02-01')).toHaveLength(4); // fevereiro de 2026 começa no domingo
    expect(semanasDoMes('2026-05-01')).toHaveLength(6);
  });

  it('inicioDoDia e intervalo em São Paulo', () => {
    expect(inicioDoDia('2026-09-23').toISOString()).toBe('2026-09-23T03:00:00.000Z');
    const { de, ate } = intervaloDosDias('2026-12-31', '2027-01-01');
    expect(de.toISOString()).toBe('2026-12-31T03:00:00.000Z');
    expect(ate.toISOString()).toBe('2027-01-02T03:00:00.000Z');
  });

  it('bissexto', () => {
    expect([2024, 2028, 2000].map(ehBissexto)).toEqual([true, true, true]);
    expect([2026, 2100, 1900].map(ehBissexto)).toEqual([false, false, false]);
  });

  it('próxima hora cheia', () => {
    expect(proximaHoraCheia(new Date('2026-09-23T17:20:00Z')).toISOString()).toBe(
      '2026-09-23T18:00:00.000Z',
    );
    // 23:40 em SP → 00:00 do dia seguinte
    expect(
      formatarNoFuso(proximaHoraCheia(new Date('2026-09-24T02:40:00Z')), 'America/Sao_Paulo'),
    ).toBe('2026-09-24 00:00');
  });
});
