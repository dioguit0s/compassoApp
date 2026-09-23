import { describe, expect, it } from 'vitest';
import { efeitoDaConclusao } from '../src';

const item = {
  effort: 5,
  primaryAttribute: 'mente' as const,
  secondaryAttribute: 'oficio' as const,
};

describe('máquina de estados da conclusão (#71, #72)', () => {
  it('concluir credita XP 70/30 e moeda cheia', () => {
    expect(efeitoDaConclusao('complete', item, [], 0)).toEqual({
      tipo: 'creditar',
      xp: [
        { attribute: 'mente', points: 35 },
        { attribute: 'oficio', points: 15 },
      ],
      moedas: 5,
    });
  });

  it('concluir o que já está creditado é no-op (retry, dois aparelhos)', () => {
    const r = efeitoDaConclusao(
      'complete',
      item,
      [
        { attribute: 'mente', points: 35 },
        { attribute: 'oficio', points: 15 },
      ],
      5,
    );
    expect(r).toEqual({ tipo: 'nada', motivo: 'já concluído' });
  });

  it('desfazer estorna exatamente o que estava creditado, mesmo que o esforço tenha mudado', () => {
    const creditado = [
      { attribute: 'mente' as const, points: 35 },
      { attribute: 'oficio' as const, points: 15 },
    ];
    expect(efeitoDaConclusao('uncomplete', { ...item, effort: 8 }, creditado, 5)).toEqual({
      tipo: 'estornar',
      xp: [
        { attribute: 'mente', points: -35 },
        { attribute: 'oficio', points: -15 },
      ],
      moedas: -5,
    });
  });

  it('desfazer duas vezes estorna uma vez; concluir → desfazer → concluir credita de novo', () => {
    const ciclo = [
      { attribute: 'mente' as const, points: 35 },
      { attribute: 'oficio' as const, points: 15 },
      { attribute: 'mente' as const, points: -35 },
      { attribute: 'oficio' as const, points: -15 },
    ];
    expect(efeitoDaConclusao('uncomplete', item, ciclo, 0).tipo).toBe('nada');
    expect(efeitoDaConclusao('complete', item, ciclo, 0).tipo).toBe('creditar');
  });

  it('compromisso sem esforço e item inexistente não são concluíveis', () => {
    expect(
      efeitoDaConclusao(
        'complete',
        { effort: null, primaryAttribute: null, secondaryAttribute: null },
        [],
        0,
      ).tipo,
    ).toBe('nada');
    expect(efeitoDaConclusao('complete', null, [], 0).tipo).toBe('nada');
  });
});
