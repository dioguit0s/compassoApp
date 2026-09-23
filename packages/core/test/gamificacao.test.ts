import { describe, expect, it } from 'vitest';
import {
  custoDaFaixa,
  deveCongelar,
  ESFORCOS,
  instanteDeParede,
  lancamentosDeXp,
  medidasDoRadar,
  moedasDaConclusao,
  nivelDoAcumulado,
} from '../src';

describe('XP em décimos (#67)', () => {
  it('sem secundário: 100% no principal (esforço 5 → 50 décimos)', () => {
    expect(lancamentosDeXp(5, 'corpo', null)).toEqual([{ attribute: 'corpo', points: 50 }]);
  });

  it('com secundário: 70/30 (esforço 5 → 35 + 15)', () => {
    expect(lancamentosDeXp(5, 'mente', 'oficio')).toEqual([
      { attribute: 'mente', points: 35 },
      { attribute: 'oficio', points: 15 },
    ]);
  });

  it.each(ESFORCOS.map((e) => [e]))(
    'esforço %i: soma é exatamente esforço × 10, sempre inteira',
    (e) => {
      for (const sec of [null, 'casa'] as const) {
        const l = lancamentosDeXp(e, 'corpo', sec);
        expect(l.reduce((s, x) => s + x.points, 0)).toBe(e * 10);
        expect(l.every((x) => Number.isInteger(x.points))).toBe(true);
      }
    },
  );

  it('tabela da escala com secundário', () => {
    expect(ESFORCOS.map((e) => lancamentosDeXp(e, 'corpo', 'mente').map((x) => x.points))).toEqual([
      [7, 3],
      [14, 6],
      [21, 9],
      [35, 15],
      [56, 24],
    ]);
  });

  it('moeda é o esforço cheio, sem 70/30', () => {
    expect(moedasDaConclusao(8)).toBe(8);
  });
});

describe('curva de nível (#67)', () => {
  it('faixas: 500, 750, 1125, 1688 (arredondado), …', () => {
    expect([1, 2, 3, 4, 5].map((n) => custoDaFaixa(n))).toEqual([500, 750, 1125, 1688, 2531]);
  });

  it('fronteiras', () => {
    expect(nivelDoAcumulado(0)).toEqual({ nivel: 0, naFaixa: 0, custoDaFaixa: 500, faltam: 500 });
    expect(nivelDoAcumulado(499).nivel).toBe(0);
    expect(nivelDoAcumulado(500)).toEqual({ nivel: 1, naFaixa: 0, custoDaFaixa: 750, faltam: 750 });
    expect(nivelDoAcumulado(1249).nivel).toBe(1);
    expect(nivelDoAcumulado(1250)).toMatchObject({ nivel: 2, faltam: 1125 });
    expect(nivelDoAcumulado(-30)).toMatchObject({ nivel: 0, naFaixa: 0 });
  });

  it('trocar a curva é só trocar a constante', () => {
    expect(nivelDoAcumulado(1000, { primeiraFaixa: 100, fator: 2 }).nivel).toBe(3); // 100+200+400
  });
});

describe('radar (#74)', () => {
  it('acumulado e janela de 30 dias; lançamento de 31 dias conta só no acumulado', () => {
    const agora = new Date('2026-09-23T12:00:00Z');
    const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);
    const m = medidasDoRadar(
      [
        { attribute: 'corpo', points: 50, earnedAt: dias(1) },
        { attribute: 'corpo', points: 30, earnedAt: dias(31) },
        { attribute: 'mente', points: 35, earnedAt: dias(2) },
        { attribute: 'mente', points: -35, earnedAt: dias(1) },
      ],
      agora,
    );
    expect(m.map((x) => [x.attribute, x.acumulado, x.janela30])).toEqual([
      ['corpo', 80, 50],
      ['mente', 0, 0],
      ['oficio', 0, 0],
      ['casa', 0, 0],
      ['social', 0, 0],
    ]);
  });
});

describe('congelamento do esforço (#64, #69)', () => {
  const sp = (d: number, h = 9) => instanteDeParede(2026, 9, d, h, 0);
  const base = { kind: 'task' as const, startAt: null, effort: 3, effortLockedAt: null };

  it('congela quando o dia do item chega (em São Paulo), não antes', () => {
    expect(deveCongelar({ ...base, dueAt: sp(24) }, '2026-09-23')).toBe(false);
    expect(deveCongelar({ ...base, dueAt: sp(23, 23) }, '2026-09-23')).toBe(true);
    expect(deveCongelar({ ...base, dueAt: sp(20) }, '2026-09-23')).toBe(true);
  });

  it('compromisso sem esforço nunca congela; já congelado não congela de novo', () => {
    expect(deveCongelar({ ...base, effort: null, dueAt: sp(20) }, '2026-09-23')).toBe(false);
    expect(deveCongelar({ ...base, effortLockedAt: sp(20), dueAt: sp(20) }, '2026-09-23')).toBe(
      false,
    );
  });

  it('evento usa o início', () => {
    expect(
      deveCongelar({ ...base, kind: 'event', dueAt: null, startAt: sp(23) }, '2026-09-23'),
    ).toBe(true);
  });
});
