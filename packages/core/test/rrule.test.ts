import { describe, expect, it } from 'vitest';
import {
  ehOcorrencia,
  fimDaSerie,
  formatarNoFuso,
  instanteDeParede,
  interpretar,
  ocorrencias,
  serializarRRule,
  validarRRule,
  type Serie,
} from '../src';

const SP = 'America/Sao_Paulo';
const sp = (a: number, m: number, d: number, h = 0, mi = 0) => instanteDeParede(a, m, d, h, mi);
const datas = (s: Serie, de: Date, ate: Date) => ocorrencias(s, de, ate).map((o) => o.data);

describe('validador (#37)', () => {
  it.each([
    'FREQ=DAILY',
    'FREQ=DAILY;INTERVAL=2',
    'FREQ=WEEKLY;BYDAY=TU,TH',
    'FREQ=MONTHLY;BYDAY=2TU',
    'FREQ=MONTHLY;BYDAY=-1FR',
    'FREQ=MONTHLY;BYMONTHDAY=31',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29',
    'FREQ=YEARLY;BYMONTH=11;BYDAY=4TH',
    'FREQ=WEEKLY;UNTIL=20261130',
    'FREQ=WEEKLY;UNTIL=20261130T235959Z',
    'FREQ=DAILY;COUNT=10',
    'RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO',
    'freq=weekly;byday=mo',
  ])('aceita %s', (r) => {
    expect(validarRRule(r)).toMatchObject({ valida: true });
  });

  it.each([
    ['FREQ=DAILY;BYSETPOS=1', /BYSETPOS/],
    ['FREQ=YEARLY;BYWEEKNO=20', /BYWEEKNO/],
    ['FREQ=YEARLY;BYYEARDAY=100', /BYYEARDAY/],
    ['FREQ=DAILY;BYHOUR=9', /BYHOUR/],
    ['FREQ=HOURLY', /FREQ não suportado/],
    ['INTERVAL=2', /FREQ é obrigatório/],
    ['FREQ=DAILY;FOO=1', /desconhecida: FOO/],
    ['FREQ=DAILY;COUNT=3;UNTIL=20261130', /UNTIL e COUNT/],
    ['FREQ=DAILY;INTERVAL=0', /INTERVAL fora/],
    ['FREQ=MONTHLY;BYMONTHDAY=32', /BYMONTHDAY fora/],
    ['FREQ=MONTHLY;BYMONTHDAY=0', /BYMONTHDAY fora/],
    ['FREQ=YEARLY;BYMONTH=13', /BYMONTH fora/],
    ['FREQ=WEEKLY;BYDAY=2TU', /ordinal/],
    ['FREQ=WEEKLY;BYDAY=XX', /BYDAY inválido/],
    ['FREQ=YEARLY;BYDAY=MO', /exige BYMONTH/],
    ['FREQ=WEEKLY;UNTIL=20260231', /UNTIL inválido/],
    ['FREQ=DAILY;FREQ=WEEKLY', /repetido/],
    ['', /vazia/],
  ])('rejeita %s com motivo', (r, motivo) => {
    const v = validarRRule(r);
    expect(v.valida).toBe(false);
    if (!v.valida) expect(v.motivo).toMatch(motivo);
  });

  it('serializa de volta na forma canônica', () => {
    expect(serializarRRule(interpretar('freq=monthly;byday=2tu;interval=2;count=5'))).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU;COUNT=5',
    );
    expect(serializarRRule(interpretar('FREQ=WEEKLY;UNTIL=20261130T120000Z'))).toBe(
      'FREQ=WEEKLY;UNTIL=20261130T120000Z',
    );
  });
});

describe('expansor (#38)', () => {
  it('DAILY com INTERVAL', () => {
    const s: Serie = { rrule: 'FREQ=DAILY;INTERVAL=3', inicio: sp(2026, 9, 1, 8), duracaoMs: 0 };
    expect(datas(s, sp(2026, 9, 1), sp(2026, 9, 11))).toEqual([
      '2026-09-01',
      '2026-09-04',
      '2026-09-07',
      '2026-09-10',
    ]);
  });

  it('início com segundos não perde a primeira ocorrência', () => {
    const s: Serie = {
      rrule: 'FREQ=DAILY;COUNT=3',
      inicio: new Date('2026-09-23T22:00:30Z'),
      duracaoMs: 0,
    };
    expect(datas(s, sp(2026, 9, 20), sp(2026, 10, 1))).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(ocorrencias(s, sp(2026, 9, 23), sp(2026, 9, 24))[0]!.inicio).toEqual(s.inicio);
  });

  it('WEEKLY com BYDAY: terça e quinta às 19:00', () => {
    const s: Serie = { rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', inicio: sp(2026, 9, 1, 19), duracaoMs: 0 };
    const os = ocorrencias(s, sp(2026, 9, 1), sp(2026, 9, 15));
    expect(os.map((o) => o.data)).toEqual(['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10']);
    expect(os.every((o) => formatarNoFuso(o.inicio, SP).endsWith('19:00'))).toBe(true);
  });

  it('WEEKLY sem BYDAY usa o dia do início; INTERVAL=2 com WKST', () => {
    const s: Serie = { rrule: 'FREQ=WEEKLY;INTERVAL=2', inicio: sp(2026, 9, 2, 7), duracaoMs: 0 };
    expect(datas(s, sp(2026, 9, 1), sp(2026, 10, 1))).toEqual([
      '2026-09-02',
      '2026-09-16',
      '2026-09-30',
    ]);
    // Início num domingo, semanas começando na segunda (padrão) vs domingo.
    const mo: Serie = {
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO',
      inicio: sp(2026, 9, 6, 9),
      duracaoMs: 0,
    };
    const su: Serie = { ...mo, rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU' };
    expect(datas(mo, sp(2026, 9, 1), sp(2026, 9, 22))).toEqual([
      '2026-09-06',
      '2026-09-14',
      '2026-09-20',
    ]);
    expect(datas(su, sp(2026, 9, 1), sp(2026, 9, 22))).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-20',
      '2026-09-21',
    ]);
  });

  it('MONTHLY com BYDAY ordinal: segunda terça e última sexta', () => {
    const t: Serie = { rrule: 'FREQ=MONTHLY;BYDAY=2TU', inicio: sp(2026, 9, 8, 10), duracaoMs: 0 };
    expect(datas(t, sp(2026, 9, 1), sp(2027, 1, 1))).toEqual([
      '2026-09-08',
      '2026-10-13',
      '2026-11-10',
      '2026-12-08',
    ]);
    const f: Serie = {
      rrule: 'FREQ=MONTHLY;BYDAY=-1FR',
      inicio: sp(2026, 9, 25, 18),
      duracaoMs: 0,
    };
    expect(datas(f, sp(2026, 9, 1), sp(2026, 12, 1))).toEqual([
      '2026-09-25',
      '2026-10-30',
      '2026-11-27',
    ]);
  });

  it('BORDA 1: BYMONTHDAY=31 em mês de 30 dias é pulado, não deslocado', () => {
    const s: Serie = {
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
      inicio: sp(2026, 1, 31, 9),
      duracaoMs: 0,
    };
    expect(datas(s, sp(2026, 1, 1), sp(2027, 1, 1))).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
    // Sem BYMONTHDAY explícito, o dia 31 do início segue a mesma regra.
    const implicito: Serie = { rrule: 'FREQ=MONTHLY', inicio: sp(2026, 1, 31, 9), duracaoMs: 0 };
    expect(datas(implicito, sp(2026, 1, 1), sp(2026, 5, 1))).toEqual(['2026-01-31', '2026-03-31']);
  });

  it('BORDA 2: 29 de fevereiro anual só em ano bissexto', () => {
    const s: Serie = { rrule: 'FREQ=YEARLY', inicio: sp(2024, 2, 29, 12), duracaoMs: 0 };
    expect(datas(s, sp(2024, 1, 1), sp(2033, 1, 1))).toEqual([
      '2024-02-29',
      '2028-02-29',
      '2032-02-29',
    ]);
    const explicito: Serie = { ...s, rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29' };
    expect(datas(explicito, sp(2024, 1, 1), sp(2029, 1, 1))).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('YEARLY com BYMONTH e BYDAY ordinal: quarta quinta-feira de novembro', () => {
    const s: Serie = {
      rrule: 'FREQ=YEARLY;BYMONTH=11;BYDAY=4TH',
      inicio: sp(2026, 11, 26, 12),
      duracaoMs: 0,
    };
    expect(datas(s, sp(2026, 1, 1), sp(2029, 1, 1))).toEqual([
      '2026-11-26',
      '2027-11-25',
      '2028-11-23',
    ]);
  });

  it('COUNT conta desde o início da série, não desde o intervalo', () => {
    const s: Serie = { rrule: 'FREQ=DAILY;COUNT=5', inicio: sp(2026, 9, 1, 8), duracaoMs: 0 };
    expect(datas(s, sp(2026, 9, 4), sp(2026, 9, 30))).toEqual(['2026-09-04', '2026-09-05']);
  });

  it('UNTIL é inclusivo, com data ou com instante', () => {
    const d: Serie = {
      rrule: 'FREQ=DAILY;UNTIL=20260903',
      inicio: sp(2026, 9, 1, 8),
      duracaoMs: 0,
    };
    expect(datas(d, sp(2026, 9, 1), sp(2026, 9, 30))).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    // 2026-09-03 08:00 SP = 11:00Z: UNTIL às 11:00Z inclui; às 10:59Z não.
    const inclui: Serie = { ...d, rrule: 'FREQ=DAILY;UNTIL=20260903T110000Z' };
    const exclui: Serie = { ...d, rrule: 'FREQ=DAILY;UNTIL=20260903T105900Z' };
    expect(datas(inclui, sp(2026, 9, 1), sp(2026, 9, 30))).toHaveLength(3);
    expect(datas(exclui, sp(2026, 9, 1), sp(2026, 9, 30))).toHaveLength(2);
  });

  it('hora de parede atravessa o horário de verão (Nova York)', () => {
    const s: Serie = {
      rrule: 'FREQ=DAILY',
      inicio: instanteDeParede(2026, 3, 6, 19, 0, 'America/New_York'),
      duracaoMs: 0,
      fuso: 'America/New_York',
    };
    const os = ocorrencias(s, s.inicio, instanteDeParede(2026, 3, 10, 0, 0, 'America/New_York'));
    expect(os.map((o) => formatarNoFuso(o.inicio, 'America/New_York'))).toEqual([
      '2026-03-06 19:00',
      '2026-03-07 19:00',
      '2026-03-08 19:00',
      '2026-03-09 19:00',
    ]);
    expect(os[3]!.inicio.getTime() - os[2]!.inicio.getTime()).toBe(24 * 3_600_000);
    expect(os[2]!.inicio.getTime() - os[1]!.inicio.getTime()).toBe(23 * 3_600_000);
  });

  it('ocorrência com duração que começou antes do intervalo ainda aparece', () => {
    const s: Serie = { rrule: 'FREQ=DAILY', inicio: sp(2026, 9, 1, 22), duracaoMs: 4 * 3_600_000 };
    expect(datas(s, sp(2026, 9, 3, 0), sp(2026, 9, 3, 23, 59))).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('ehOcorrencia', () => {
    const s: Serie = {
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      inicio: sp(2026, 9, 1, 19),
      duracaoMs: 3_600_000,
    };
    expect(ehOcorrencia(s, '2026-09-08')).toBe(true);
    expect(ehOcorrencia(s, '2026-09-09')).toBe(false);
    expect(ehOcorrencia(s, '2026-08-25')).toBe(false); // antes do início
  });

  it('fimDaSerie: COUNT calcula a última; sem fim → null', () => {
    const c: Serie = {
      rrule: 'FREQ=WEEKLY;COUNT=3',
      inicio: sp(2026, 9, 1, 19),
      duracaoMs: 3_600_000,
    };
    expect(fimDaSerie(c)!.toISOString()).toBe(sp(2026, 9, 15, 20).toISOString());
    expect(fimDaSerie({ ...c, rrule: 'FREQ=WEEKLY' })).toBeNull();
    const u: Serie = { ...c, rrule: 'FREQ=WEEKLY;UNTIL=20261001' };
    expect(fimDaSerie(u)!.toISOString()).toBe(sp(2026, 9, 29, 20).toISOString());
  });

  it('regra que nunca casa não trava', () => {
    const s: Serie = {
      rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30',
      inicio: sp(2026, 1, 1, 9),
      duracaoMs: 0,
    };
    expect(datas(s, sp(2026, 1, 1), sp(2126, 1, 1))).toEqual([]);
    expect(fimDaSerie({ ...s, rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30;COUNT=2' })).toEqual(
      s.inicio,
    );
  });

  it('desempenho: série diária expandida em 2 anos', () => {
    const s: Serie = { rrule: 'FREQ=DAILY', inicio: sp(2026, 1, 1, 7), duracaoMs: 3_600_000 };
    const t0 = Date.now();
    const os = ocorrencias(s, sp(2026, 1, 1), sp(2028, 1, 1));
    const ms = Date.now() - t0;
    expect(os).toHaveLength(730);
    // Medido: ~13 ms no Node 22 (2026-09-23). No Hermes, espera-se uma ordem de grandeza a mais.
    expect(ms).toBeLessThan(500);
  });
});
