import { describe, expect, it } from 'vitest';
import {
  agendarTarefa,
  instanteDeParede,
  minutosNaGrade,
  podeAgendarArrastando,
  type EntradaAgenda,
} from '../src';

const entrada = (extra: Partial<EntradaAgenda>): EntradaAgenda => ({
  id: 'i1',
  itemId: 'i1',
  ocorrencia: null,
  title: 'Estudar',
  kind: 'task',
  effort: 3,
  allDay: false,
  dueAt: instanteDeParede(2026, 9, 24, 18, 0),
  startAt: null,
  endAt: null,
  status: 'open',
  notes: null,
  reminderMinutesBefore: null,
  courseId: null,
  postponeCount: 0,
  desviada: false,
  ...extra,
});

describe('arrastar tarefa para a grade (especificação §3, §7)', () => {
  it('só tarefa simples e aberta pode ser arrastada', () => {
    expect(podeAgendarArrastando(entrada({}))).toBe(true);
    expect(podeAgendarArrastando(entrada({ status: 'done' }))).toBe(false);
    expect(podeAgendarArrastando(entrada({ ocorrencia: '2026-09-24' }))).toBe(false);
    expect(
      podeAgendarArrastando(entrada({ kind: 'event', dueAt: null, startAt: new Date() })),
    ).toBe(false);
  });

  it('posição na grade vira minutos do dia, no passo de 15 e dentro do dia', () => {
    expect(minutosNaGrade(0, 44)).toBe(0);
    expect(minutosNaGrade(44 * 15, 44)).toBe(15 * 60);
    expect(minutosNaGrade(44 * 15 + 10, 44)).toBe(15 * 60 + 15); // 13,6 min → 15
    expect(minutosNaGrade(44 * 15 + 4, 44)).toBe(15 * 60); // 5,5 min → 0
    expect(minutosNaGrade(-30, 44)).toBe(0);
    expect(minutosNaGrade(44 * 24, 44)).toBe(23 * 60); // o bloco de 1 h ainda cabe no dia
  });

  it('agendar troca o prazo por um bloco de 1 h em hora de São Paulo', () => {
    expect(agendarTarefa('2026-09-24', 15 * 60 + 30)).toEqual({
      kind: 'event',
      allDay: false,
      dueAt: null,
      startAt: new Date('2026-09-24T18:30:00Z'),
      endAt: new Date('2026-09-24T19:30:00Z'),
    });
  });
});
