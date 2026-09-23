import { describe, expect, it } from 'vitest';
import { ehAtributoValido, ehEsforcoValido } from '../src';

describe('ehEsforcoValido', () => {
  it('aceita só a escala 1, 2, 3, 5, 8', () => {
    for (const v of [1, 2, 3, 5, 8]) expect(ehEsforcoValido(v)).toBe(true);
    for (const v of [0, 4, 6, 7, 13, 2.5, '3', null]) expect(ehEsforcoValido(v)).toBe(false);
  });
});

describe('ehAtributoValido', () => {
  it('aceita só os cinco atributos', () => {
    expect(ehAtributoValido('corpo')).toBe(true);
    expect(ehAtributoValido('Corpo')).toBe(false);
    expect(ehAtributoValido('saude')).toBe(false);
  });
});
