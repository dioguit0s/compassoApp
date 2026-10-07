import { describe, expect, it } from 'vitest';
import {
  aulasDoDia,
  esquemaExcecao,
  esquemaHorario,
  esquemaSemestre,
  instantesDaAula,
  rotuloFrequencia,
  semanaDoPeriodo,
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
        kind: 'semester',
        deletedAt: null,
      },
      {
        id: 's0',
        label: '2026.1',
        startDate: '2026-02-09',
        endDate: '2026-07-04',
        active: false,
        kind: 'semester',
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
        weekInterval: 1,
        weekOffset: 0,
        deletedAt: null,
      },
      {
        id: 'h2',
        courseId: 'c1',
        weekday: 4,
        startTime: '19:00',
        endTime: '20:40',
        room: 'LAB-3',
        weekInterval: 1,
        weekOffset: 0,
        deletedAt: null,
      },
      {
        id: 'h3',
        courseId: 'c2',
        weekday: 2,
        startTime: '20:50',
        endTime: '22:30',
        room: null,
        weekInterval: 1,
        weekOffset: 0,
        deletedAt: null,
      },
      {
        id: 'h0',
        courseId: 'c0',
        weekday: 2,
        startTime: '08:00',
        endTime: '10:00',
        room: null,
        weekInterval: 1,
        weekOffset: 0,
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

describe('aulas quinzenais e quadrimestre (ADR-0017)', () => {
  // s1 começa na segunda 2026-08-03: a semana 0 vai de 02/08 (domingo) a 08/08.
  const quinzenal = (weekOffset: number) => {
    const g = grade();
    Object.assign(
      g.horarios.find((h) => h.id === 'h1')!,
      { weekInterval: 2, weekOffset },
    );
    return g;
  };
  const temSr = (g: GradeParaProjecao, d: string) =>
    aulasDoDia(g, d).some((a) => a.slotId === 'h1');

  it('conta as semanas a partir da semana em que o período começa', () => {
    expect(semanaDoPeriodo('2026-08-03', '2026-08-02')).toBe(0);
    expect(semanaDoPeriodo('2026-08-03', '2026-08-08')).toBe(0);
    expect(semanaDoPeriodo('2026-08-03', '2026-08-09')).toBe(1);
    expect(semanaDoPeriodo('2026-08-03', '2026-09-22')).toBe(7);
  });

  it('quinzenal 1 nas semanas pares do período, quinzenal 2 nas ímpares', () => {
    const q1 = quinzenal(0);
    expect(
      ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'].map((d) => temSr(q1, d)),
    ).toEqual([true, false, true, false]);
    const q2 = quinzenal(1);
    expect(
      ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'].map((d) => temSr(q2, d)),
    ).toEqual([false, true, false, true]);
    // Os outros horários, semanais, não mudam.
    expect(aulasDoDia(q1, '2026-09-22').map((a) => a.slotId)).toEqual(['h3']);
    expect(aulasDoDia(q1, '2026-09-24').map((a) => a.slotId)).toEqual(['h2']);
  });

  it('período que começa no meio da semana: a semana do início é a quinzenal 1', () => {
    const g = quinzenal(0);
    g.semestres[0]!.startDate = '2026-08-05'; // quarta
    expect(temSr(g, '2026-08-04')).toBe(false); // antes do início
    expect(temSr(g, '2026-08-11')).toBe(false);
    expect(temSr(g, '2026-08-18')).toBe(true);
  });

  it('aula extra aparece na semana de folga da quinzenal', () => {
    const g = quinzenal(0);
    g.excecoes.push({
      id: 'e9',
      slotId: 'h1',
      date: '2026-08-11',
      type: 'extra',
      room: null,
      note: 'reposição',
      startTime: null,
      endTime: null,
      deletedAt: null,
    });
    const [a] = aulasDoDia(g, '2026-08-11').filter((x) => x.slotId === 'h1');
    expect(a).toMatchObject({ extra: true, inicio: '19:00' });
  });

  it('rótulos de frequência', () => {
    expect(rotuloFrequencia({ weekInterval: 1, weekOffset: 0 })).toBe('');
    expect(rotuloFrequencia({ weekInterval: 2, weekOffset: 0 })).toBe('quinzenal 1');
    expect(rotuloFrequencia({ weekInterval: 2, weekOffset: 1 })).toBe('quinzenal 2');
    expect(rotuloFrequencia({ weekInterval: 3, weekOffset: 2 })).toBe('a cada 3 semanas (3ª)');
  });

  it('validação: semana do horário dentro do intervalo; apps antigos recebem os defaults', () => {
    const h = (x: object) =>
      esquemaHorario.safeParse({
        id: '01900000-0000-7000-8000-000000000001',
        courseId: '01900000-0000-7000-8000-000000000002',
        weekday: 2,
        startTime: '19:00',
        endTime: '20:40',
        room: null,
        ...base,
        ...x,
      });
    expect(h({}).data).toMatchObject({ weekInterval: 1, weekOffset: 0 });
    expect(h({ weekInterval: 2, weekOffset: 1 }).success).toBe(true);
    expect(h({ weekInterval: 2, weekOffset: 2 }).success).toBe(false);
    expect(h({ weekInterval: 5, weekOffset: 0 }).success).toBe(false);
    expect(h({ weekInterval: 0, weekOffset: 0 }).success).toBe(false);
    const s = (x: object) =>
      esquemaSemestre.safeParse({
        id: '01900000-0000-7000-8000-000000000009',
        label: '2026.3',
        startDate: '2026-09-21',
        endDate: '2026-12-19',
        active: true,
        ...base,
        ...x,
      });
    expect(s({}).data?.kind).toBe('semester');
    expect(s({ kind: 'quadrimester' }).data?.kind).toBe('quadrimester');
    expect(s({ kind: 'trimestre' }).success).toBe(false);
  });
});
