import { describe, expect, it } from 'vitest';
import {
  aulasDoDia,
  cargaDaSemana,
  cargaDoDia,
  cargaDosDias,
  diaPesado,
  formatarDuracao,
  fracaoDaCarga,
  instanteDeParede,
  intervaloDosDias,
  limitesDiaInteiro,
  projetarAgenda,
  rotuloDaCarga,
  type Aula,
  type Dia,
  type GradeParaProjecao,
  type ItemDeAgenda,
  type ItemParaProjecao,
} from '../src';

// Outubro de 2026: dia 4 é domingo, dia 7 é quarta.
const sp = (d: number, h: number, m = 0) => instanteDeParede(2026, 10, d, h, m);
const QUARTA: Dia = '2026-10-07';

let seq = 0;
function evento(inicio: Date, fim: Date | null, extra: Partial<ItemDeAgenda> = {}): ItemDeAgenda {
  return {
    id: String(++seq),
    title: `e${seq}`,
    kind: 'event',
    effort: null,
    allDay: false,
    dueAt: null,
    startAt: inicio,
    endAt: fim,
    status: 'open',
    ...extra,
  };
}
function tarefa(prazo: Date, effort: number, extra: Partial<ItemDeAgenda> = {}): ItemDeAgenda {
  return { ...evento(prazo, null), kind: 'task', startAt: null, dueAt: prazo, effort, ...extra };
}
function aula(dia: Dia, inicio: string, fim: string, extra: Partial<Aula> = {}): Aula {
  return {
    id: `s${inicio}@${dia}`,
    slotId: `s${inicio}`,
    courseId: 'c',
    dia,
    disciplina: 'Cálculo II',
    codigo: null,
    professor: null,
    cor: '#2F4E7A',
    inicio,
    fim,
    sala: null,
    salaTrocada: false,
    cancelada: false,
    extra: false,
    nota: null,
    ...extra,
  };
}

describe('cargaDoDia', () => {
  const diaInteiro = limitesDiaInteiro(QUARTA, QUARTA);
  const viagem = limitesDiaInteiro('2026-10-06', '2026-10-08');

  const casos: {
    nome: string;
    entradas: ItemDeAgenda[];
    aulas?: Aula[];
    esforco: number;
    minutos: number;
  }[] = [
    { nome: 'dia vazio', entradas: [], esforco: 0, minutos: 0 },
    {
      nome: 'tarefa com prazo no dia soma esforço e não ocupa tempo',
      entradas: [tarefa(sp(7, 18), 5)],
      esforco: 5,
      minutos: 0,
    },
    {
      nome: 'evento pontuável soma esforço e tempo',
      entradas: [evento(sp(7, 9), sp(7, 11), { effort: 3 })],
      esforco: 3,
      minutos: 120,
    },
    {
      nome: 'compromisso puro só ocupa tempo',
      entradas: [evento(sp(7, 14), sp(7, 15, 30))],
      esforco: 0,
      minutos: 90,
    },
    {
      nome: 'item concluído não entra, nem no esforço nem no tempo',
      entradas: [
        tarefa(sp(7, 18), 8, { status: 'done' }),
        evento(sp(7, 9), sp(7, 11), { effort: 3, status: 'done' }),
        tarefa(sp(7, 20), 2),
      ],
      esforco: 2,
      minutos: 0,
    },
    {
      nome: 'dia inteiro não conta horas, mas conta o esforço',
      entradas: [evento(diaInteiro.startAt, diaInteiro.endAt, { allDay: true, effort: 2 })],
      esforco: 2,
      minutos: 0,
    },
    {
      nome: 'evento sem fim é um ponto no tempo',
      entradas: [evento(sp(7, 10), null)],
      esforco: 0,
      minutos: 0,
    },
    {
      nome: 'eventos sobrepostos ocupam a união, não a soma',
      entradas: [evento(sp(7, 9), sp(7, 11)), evento(sp(7, 10), sp(7, 12))],
      esforco: 0,
      minutos: 180,
    },
    {
      nome: 'evento que atravessa a meia-noite é recortado ao dia',
      entradas: [evento(sp(6, 22), sp(7, 2)), evento(sp(7, 23), sp(8, 1))],
      esforco: 0,
      minutos: 180,
    },
    {
      nome: 'esforço de item de vários dias conta só no primeiro dia',
      entradas: [evento(viagem.startAt, viagem.endAt, { allDay: true, effort: 8 })],
      esforco: 0,
      minutos: 0,
    },
    {
      nome: 'item de outro dia não entra',
      entradas: [tarefa(sp(8, 9), 5), evento(sp(6, 9), sp(6, 10))],
      esforco: 0,
      minutos: 0,
    },
    {
      nome: 'aulas somam tempo; a cancelada não',
      entradas: [],
      aulas: [aula(QUARTA, '19:00', '20:40'), aula(QUARTA, '20:50', '22:30', { cancelada: true })],
      esforco: 0,
      minutos: 100,
    },
    {
      nome: 'evento em cima da aula não ocupa a hora duas vezes',
      entradas: [evento(sp(7, 19, 30), sp(7, 21))],
      aulas: [aula(QUARTA, '19:00', '20:40')],
      esforco: 0,
      minutos: 120,
    },
  ];

  it.each(casos)('$nome', ({ entradas, aulas, esforco, minutos }) => {
    expect(cargaDoDia(QUARTA, entradas, aulas ?? [])).toEqual({
      esforco,
      minutosOcupados: minutos,
    });
  });

  it('o primeiro dia do item de vários dias leva o esforço', () => {
    const e = evento(viagem.startAt, viagem.endAt, { allDay: true, effort: 8 });
    expect(cargaDoDia('2026-10-06', [e], []).esforco).toBe(8);
  });
});

describe('carga sobre a projeção real', () => {
  const item = (extra: Partial<ItemParaProjecao>): ItemParaProjecao => ({
    id: `i${++seq}`,
    title: 'x',
    kind: 'event',
    effort: null,
    allDay: false,
    dueAt: null,
    startAt: sp(5, 8),
    endAt: sp(5, 9),
    status: 'open',
    notes: null,
    rrule: null,
    timezone: 'America/Sao_Paulo',
    recurrenceEndsAt: null,
    reminderMinutesBefore: null,
    courseId: null,
    postponeCount: 0,
    deletedAt: null,
    ...extra,
  });

  it('série diária: ocorrência cancelada e concluída saem da conta', () => {
    const treino = item({ rrule: 'FREQ=DAILY', effort: 3 });
    const desvio = (occurrenceDate: Dia, type: 'cancelled' | 'completed') => ({
      itemId: treino.id,
      occurrenceDate,
      type,
      status: type === 'completed' ? ('done' as const) : ('open' as const),
      startAt: null,
      endAt: null,
      titleOverride: null,
      notesOverride: null,
      deletedAt: null,
    });
    const { de, ate } = intervaloDosDias('2026-10-04', '2026-10-10');
    const agenda = projetarAgenda(
      [treino],
      [desvio('2026-10-06', 'cancelled'), desvio(QUARTA, 'completed')],
      de,
      ate,
    );
    const semana = cargaDaSemana(QUARTA, agenda, () => []);
    expect(semana.dias.map((d) => d.esforco)).toEqual([0, 3, 0, 0, 3, 3, 3]);
    expect(semana.dias.map((d) => d.minutosOcupados)).toEqual([0, 60, 0, 0, 60, 60, 60]);
    expect(semana.total).toEqual({ esforco: 12, minutosOcupados: 240 });
  });

  it('aula quinzenal só pesa na semana em que acontece', () => {
    const carimbo = { deletedAt: null };
    const grade: GradeParaProjecao = {
      semestres: [
        {
          id: 's',
          label: '2026.2',
          startDate: '2026-10-05',
          endDate: '2026-12-18',
          active: true,
          kind: 'semester',
          ...carimbo,
        },
      ],
      disciplinas: [
        {
          id: 'c',
          semesterId: 's',
          name: 'Cálculo II',
          code: null,
          professor: null,
          color: '#2F4E7A',
          defaultRoom: null,
          ...carimbo,
        },
      ],
      horarios: [
        {
          id: 'h',
          courseId: 'c',
          weekday: 3,
          startTime: '19:00',
          endTime: '22:30',
          room: null,
          weekInterval: 2,
          weekOffset: 0,
          ...carimbo,
        },
      ],
      excecoes: [],
    };
    const cargas = cargaDosDias([QUARTA, '2026-10-14', '2026-10-21'], [], (d) =>
      aulasDoDia(grade, d),
    );
    expect([...cargas.values()].map((c) => c.minutosOcupados)).toEqual([210, 0, 210]);
  });
});

describe('dia pesado', () => {
  it.each([
    { esforco: 12, minutos: 479, pesado: false },
    { esforco: 13, minutos: 0, pesado: true },
    { esforco: 0, minutos: 480, pesado: true },
  ])('padrão: esforço $esforco e $minutos min → $pesado', ({ esforco, minutos, pesado }) => {
    expect(diaPesado({ esforco, minutosOcupados: minutos })).toBe(pesado);
  });

  it('limiar configurável; null desliga a medida', () => {
    const c = { esforco: 20, minutosOcupados: 300 };
    expect(diaPesado(c, { esforco: null, horas: 8 })).toBe(false);
    expect(diaPesado(c, { esforco: null, horas: 5 })).toBe(true);
    expect(diaPesado(c, { esforco: null, horas: null })).toBe(false);
  });

  it('fração do limiar: a maior das duas medidas, até 1', () => {
    const semLimiar = { esforco: null, horas: null };
    expect(fracaoDaCarga({ esforco: 0, minutosOcupados: 0 })).toBe(0);
    expect(fracaoDaCarga({ esforco: 6.5, minutosOcupados: 120 })).toBe(0.5);
    expect(fracaoDaCarga({ esforco: 2, minutosOcupados: 360 })).toBe(0.75);
    expect(fracaoDaCarga({ esforco: 40, minutosOcupados: 0 })).toBe(1);
    expect(fracaoDaCarga({ esforco: 40, minutosOcupados: 0 }, semLimiar)).toBe(0);
  });
});

describe('rótulos', () => {
  it.each([
    [0, '0 min'],
    [40, '40 min'],
    [60, '1 h'],
    [95, '1 h 35'],
    [300, '5 h'],
  ])('formatarDuracao(%i) = %s', (min, texto) => expect(formatarDuracao(min)).toBe(texto));

  it.each([
    [{ esforco: 9, minutosOcupados: 300 }, 'esforço 9 · 5 h ocupadas'],
    [{ esforco: 0, minutosOcupados: 60 }, '1 h ocupada'],
    [{ esforco: 0, minutosOcupados: 45 }, '45 min ocupados'],
    [{ esforco: 3, minutosOcupados: 0 }, 'esforço 3'],
    [{ esforco: 0, minutosOcupados: 0 }, ''],
  ])('rotuloDaCarga(%o) = %s', (c, texto) => expect(rotuloDaCarga(c)).toBe(texto));
});
