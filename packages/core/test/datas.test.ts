import { describe, expect, it } from 'vitest';
import { formatarNoFuso, rodarDiagnosticoDeFuso } from '../src';

describe('formatarNoFuso', () => {
  it('todos os casos do diagnóstico passam no Node', () => {
    for (const r of rodarDiagnosticoDeFuso()) expect(r.obtido, r.fuso).toBe(r.esperado);
  });

  it('meia-noite sai como 00, não 24', () => {
    expect(formatarNoFuso(new Date('2026-01-01T03:00:00Z'), 'America/Sao_Paulo')).toBe(
      '2026-01-01 00:00',
    );
  });
});
