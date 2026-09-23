import { describe, expect, it } from 'vitest';
import { corDerivadaDoNome, iniciais, PALETA_DESTAQUE } from '../src';

describe('avatar', () => {
  it('cor é determinística e vem da paleta', () => {
    expect(corDerivadaDoNome('Diogo Santos')).toBe(corDerivadaDoNome('  diogo santos '));
    expect(PALETA_DESTAQUE).toContain(corDerivadaDoNome('Ana'));
  });

  it('iniciais do primeiro e do último nome', () => {
    expect(iniciais('Diogo dos Santos')).toBe('DS');
    expect(iniciais('Ana')).toBe('A');
    expect(iniciais('   ')).toBe('?');
    expect(iniciais('élida ramos')).toBe('ÉR');
  });
});
