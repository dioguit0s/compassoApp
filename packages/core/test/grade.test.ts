import { describe, expect, it } from 'vitest';
import {
  aulasDoDia,
  esquemaExcecao,
  esquemaHorario,
  instantesDaAula,
  semestreDoDia,
  type GradeParaProjecao,
} from '../src';

const agora = new Date().toISOString();
const base = { deletedAt: null, createdAt: agora, updatedAt: agora };

function grade(): GradeParaProjecao {
  return {
    semestres: [
      {
        id: 's1',
        label: '2026.2',
        startDate: '2026-08-03',
        endDate: '2026-12-12',
        active: true,
        deletedAt: null,
      },
      {
        id: 's0',
        label: '2026.1',
        startDate: '2026-02-09',
        endDate: '2026-07-04',
        active: false,
        deletedAt: null,
      },
    ],
    disciplinas: [
      {
        id: 'c1',
        semesterId: 's1',
        name: 'Sistemas Reconfiguráveis',
        code: 'SR',
        professor: 'Ana',
        color: '#2F6B8C',
        defaultRoom: 'B-201',
        deletedAt: null,
      },
      {
        id: 'c2',
        semesterId: 's1',
        name: 'Compiladores',
        code: 'COMP',
        professor: null,
        color: '#8C4A2F',
        defaultRoom: 'A-101',
        deletedAt: null,
      },
      {
        id: 'c0',
        semesterId: 's0',
        name: 'Antiga',
        code: null,
        professor: null,
        color: '#5A5A5A',
        defaultRoom: null,
        deletedAt: null,
      },
    ],
    horarios: [
      {
        id: 'h1',
        courseId: 'c1',
        weekday: 2,
        startTime: '19:00',
        endTime: '20:40',
        room: null,
        deletedAt: null,
      },
      {
        id: 'h2',
        courseId: 'c1',
        weekday: 4,
        startTime: '19:00',
        endTime: '20:40',
        room: 'LAB-3',
        deletedAt: null,
      },
      {
        id: 'h3',
        courseId: 'c2',
        weekday: 2,
        startTime: '20:50',
        endTime: '22:30',
        room: null,
        deletedAt: null,
      },
      {
        id: 'h0',
        courseId: 'c0',
        weekday: 2,
        startTime: '08:00',
        endTime: '10:00',
        room: null,
        deletedAt: null,
      },
    ],
    excecoes: [],
  };
}

describe('projeção das aulas (#60)', () => {
  it('dia com aula normal: horário, disciplina, sala padrão ou do horário, em ordem', () => {
    const terca = aulasDoDia(grade(), '2026-09-22');
    expect(terca.map((a) => [a.inicio, a.disciplina, a.sala])).toEqual([
      ['19:00', 'Sistemas Reconfiguráveis', 'B-201'],
      ['20:50', 'Compiladores', 'A-101'],
    ]);
    expect(aulasDoDia(grade(), '2026-09-24').map((a) => a.sala)).toEqual(['LAB-3']);
    expect(aulasDoDia(grade(), '2026-09-23')).toEqual([]);
  });

  it('sala trocada aparece em destaque; cancelada aparece marcada', () => {
    const g = grade();
    g.excecoes.push(
      {
        id: 'e1',
        slotId: 'h1',
        date: '2026-09-22',
        type: 'room_change',
        room: 'B-305',
        note: 'ar-condicionado',
        startTime: null,
        endTime: null,
        deletedAt: null,
      },
      {
        id: 'e2',
        slotId: 'h3',
        date: '2026-09-22',
        type: 'cancelled',
        room: null,
        note: null,
        startTime: null,
        endTime: null,
        deletedAt: null,
      },
    );
    const [sr, comp] = aulasDoDia(g, '2026-09-22');
    expect(sr).toMatchObject({
      sala: 'B-305',
      salaTrocada: true,
      cancelada: false,
      nota: 'ar-condicionado',
    });
    expect(comp).toMatchObject({ cancelada: true, salaTrocada: false });
    // Outra terça não é afetada.
    expect(aulasDoDia(g, '2026-09-29').map((a) => [a.sala, a.cancelada])).toEqual([
      ['B-201', false],
      ['A-101', false],
    ]);
  });

  it('aula extra aparece mesmo sem horário regular naquele dia, com horário próprio', () => {
    const g = grade();
    g.excecoes.push({
      id: 'e3',
      slotId: 'h1',
      date: '2026-09-26',
      type: 'extra',
      room: 'B-101',
      note: 'reposição',
      startTime: '08:00',
      endTime: '11:40',
      deletedAt: null,
    });
    expect(aulasDoDia(g, '2026-09-26')).toEqual([
      expect.objectContaining({
        disciplina: 'Sistemas Reconfiguráveis',
        inicio: '08:00',
        fim: '11:40',
        sala: 'B-101',
        extra: true,
      }),
    ]);
  });

  it('dia sem semestre ativo (férias) não tem aula; semestre inativo nunca projeta', () => {
    expect(aulasDoDia(grade(), '2026-12-15')).toEqual([]);
    expect(aulasDoDia(grade(), '2026-03-10')).toEqual([]); // s0 cobre a data, mas está inativo
    expect(semestreDoDia(grade(), '2026-09-22')?.id).toBe('s1');
  });

  it('disciplina ou horário excluídos somem; exceção excluída deixa de valer', () => {
    const g = grade();
    g.horarios[2]!.deletedAt = agora;
    g.excecoes.push({
      id: 'e4',
      slotId: 'h1',
      date: '2026-09-22',
      type: 'cancelled',
      room: null,
      note: null,
      startTime: null,
      endTime: null,
      deletedAt: agora,
    });
    expect(aulasDoDia(g, '2026-09-22').map((a) => [a.disciplina, a.cancelada])).toEqual([
      ['Sistemas Reconfiguráveis', false],
    ]);
  });

  it('instantes em hora de São Paulo', () => {
    const [a] = aulasDoDia(grade(), '2026-09-22');
    const { inicio, fim } = instantesDaAula(a!);
    expect(inicio.toISOString()).toBe('2026-09-22T22:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-09-22T23:40:00.000Z');
  });
});

describe('validação de horário (#56)', () => {
  const h = (startTime: string, endTime = '23:59') =>
    esquemaHorario.safeParse({
      id: '01900000-0000-7000-8000-000000000001',
      courseId: '01900000-0000-7000-8000-000000000002',
      weekday: 2,
      startTime,
      endTime,
      room: null,
      ...base,
    }).success;

  it('rejeita 25:00, 9:5, 24:00 e fim antes do início', () => {
    expect(h('19:00', '20:40')).toBe(true);
    expect(h('25:00')).toBe(false);
    expect(h('9:5')).toBe(false);
    expect(h('24:00')).toBe(false);
    expect(h('19:00', '18:00')).toBe(false);
  });

  it('troca de sala exige sala; horário próprio só em aula extra', () => {
    const e = (x: object) =>
      esquemaExcecao.safeParse({
        id: '01900000-0000-7000-8000-000000000003',
        slotId: '01900000-0000-7000-8000-000000000001',
        date: '2026-09-22',
        type: 'cancelled',
        room: null,
        note: null,
        startTime: null,
        endTime: null,
        ...base,
        ...x,
      }).success;
    expect(e({})).toBe(true);
    expect(e({ type: 'room_change' })).toBe(false);
    expect(e({ type: 'room_change', room: 'B-1' })).toBe(true);
    expect(e({ startTime: '08:00', endTime: '09:00' })).toBe(false);
    expect(e({ type: 'extra', startTime: '08:00', endTime: '09:00' })).toBe(true);
  });
});
