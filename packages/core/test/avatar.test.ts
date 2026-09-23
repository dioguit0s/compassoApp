import { describe, expect, it } from 'vitest';
import { contraste, corDerivadaDoNome, iniciais, PALETA_DESTAQUE } from '../src';

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
    expect(iniciais('Ágata')).toBe('Á');
    expect(iniciais('joão da silva')).toBe('JS');
    expect(iniciais('  Ana  ')).toBe('A');
  });

  it('toda cor da paleta tem contraste AA (4,5:1) com texto branco', () => {
    for (const c of PALETA_DESTAQUE) expect(contraste(c, '#FFFFFF'), c).toBeGreaterThanOrEqual(4.5);
  });
});
