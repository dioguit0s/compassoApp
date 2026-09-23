import { describe, expect, it } from 'vitest';
import { novoId, uuidv7 } from '../src';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('novoId (UUIDv7)', () => {
  it('tem versão 7 e variante RFC', () => {
    for (let i = 0; i < 100; i++) expect(novoId()).toMatch(V7);
  });

  it('não colide em 10 mil IDs', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => novoId()));
    expect(ids.size).toBe(10_000);
  });

  it('IDs gerados em sequência saem em ordem, inclusive no mesmo milissegundo', () => {
    const ids = Array.from({ length: 10_000 }, () => novoId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('carrega o timestamp nos 48 bits iniciais', () => {
    const ms = Date.UTC(2030, 0, 1);
    const id = uuidv7(ms);
    const hex = id.replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(ms);
  });

  it('continua ordenado se o relógio voltar', () => {
    const a = uuidv7(Date.UTC(2031, 0, 1));
    const b = uuidv7(Date.UTC(2020, 0, 1));
    expect(b > a).toBe(true);
  });
});
