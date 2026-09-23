/**
 * RRULE (RFC 5545 §3.3.10) — o formato é a RFC inteira; o validador aceita um subconjunto
 * (especificação §5.1). Um código só para a API e o app: a expansão é a única lógica
 * deliberadamente duplicada do sistema, e duas implementações divergem (roadmap §3).
 *
 * Aceito: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (inclusive ordinal: 2TU, -1FR),
 * BYMONTHDAY (1..31 e -31..-1), BYMONTH, UNTIL ou COUNT, e WKST (ADR-0004).
 * Rejeitado: BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND e partes desconhecidas.
 *
 * A expansão é em HORA DE PAREDE do fuso (São Paulo — ADR-0003): um evento às 19:00 continua às
 * 19:00 através de qualquer mudança de horário de verão. Dois casos de borda da especificação:
 * BYMONTHDAY=31 num mês de 30 dias é PULADO (não vai para o dia 30), e 29 de fevereiro anual só
 * ocorre em ano bissexto.
 */
import {
  diaDaSemana,
  diaDe,
  diasNoMes,
  FUSO_PADRAO,
  inicioDoDia,
  instanteDeParede,
  montarDia,
  partesDoDia,
  somarDias,
  type Dia,
} from './calendario';
import { partesNoFuso } from './datas';

export type Frequencia = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface DiaDaRegra {
  /** 0 = domingo … 6 = sábado. */
  dia: number;
  /** 2 em `2TU`, -1 em `-1FR`; ausente em `TU`. */
  ordinal?: number;
}

export interface RegraRecorrencia {
  freq: Frequencia;
  intervalo: number;
  byDay: DiaDaRegra[];
  byMonthDay: number[];
  byMonth: number[];
  /** Limite inclusivo. `dia` quando o UNTIL veio só com data; `instante` quando veio com hora. */
  until: { dia: Dia } | { instante: Date } | null;
  count: number | null;
  /** Início da semana para WEEKLY com INTERVAL > 1. Padrão da RFC: segunda (1). */
  wkst: number;
}

export type ResultadoValidacao =
  { valida: true; regra: RegraRecorrencia } | { valida: false; motivo: string };

const DIAS_RFC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const REJEITADAS: Record<string, string> = {
  BYSETPOS: 'BYSETPOS não é suportado',
  BYWEEKNO: 'BYWEEKNO não é suportado',
  BYYEARDAY: 'BYYEARDAY não é suportado',
  BYHOUR: 'BYHOUR não é suportado',
  BYMINUTE: 'BYMINUTE não é suportado',
  BYSECOND: 'BYSECOND não é suportado',
  RSCALE: 'RSCALE não é suportado',
  SKIP: 'SKIP não é suportado',
};

function inteiro(v: string, min: number, max: number, nome: string, semZero = false): number {
  if (!/^[+-]?\d+$/.test(v)) throw new Error(`${nome} não é um número: ${v}`);
  const n = Number(v);
  if (n < min || n > max || (semZero && n === 0)) {
    throw new Error(`${nome} fora do intervalo: ${v}`);
  }
  return n;
}

function lerUntil(v: string, fuso: string): RegraRecorrencia['until'] {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(v);
  if (!m) throw new Error(`UNTIL inválido: ${v}`);
  const [, a, me, d, h, mi, s, z] = m;
  const ano = Number(a);
  const mes = Number(me);
  const dia = Number(d);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new Error(`UNTIL inválido: ${v}`);
  }
  if (h === undefined) return { dia: montarDia(ano, mes, dia) };
  if (z) {
    return { instante: new Date(Date.UTC(ano, mes - 1, dia, +h, +mi!, +s!)) };
  }
  // Hora "flutuante" (sem Z): hora de parede do fuso da série.
  const t = instanteDeParede(ano, mes, dia, +h, +mi!, fuso);
  return { instante: new Date(t.getTime() + Number(s) * 1000) };
}

/** Valida e interpreta. Nunca lança: devolve o motivo legível da recusa. */
export function validarRRule(texto: string, fuso: string = FUSO_PADRAO): ResultadoValidacao {
  try {
    return { valida: true, regra: interpretar(texto, fuso) };
  } catch (e) {
    return { valida: false, motivo: (e as Error).message };
  }
}

export function interpretar(texto: string, fuso: string = FUSO_PADRAO): RegraRecorrencia {
  const corpo = texto.trim().replace(/^RRULE:/i, '');
  if (!corpo) throw new Error('regra vazia');
  const partes = new Map<string, string>();
  for (const parte of corpo.split(';')) {
    if (!parte) continue;
    const i = parte.indexOf('=');
    if (i <= 0) throw new Error(`parte malformada: ${parte}`);
    const nome = parte.slice(0, i).toUpperCase();
    const valor = parte.slice(i + 1).toUpperCase();
    if (REJEITADAS[nome]) throw new Error(REJEITADAS[nome]);
    if (
      !['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'UNTIL', 'COUNT', 'WKST'].includes(
        nome,
      )
    ) {
      throw new Error(`parte desconhecida: ${nome}`);
    }
    if (partes.has(nome)) throw new Error(`${nome} repetido`);
    if (!valor) throw new Error(`${nome} sem valor`);
    partes.set(nome, nome === 'UNTIL' ? parte.slice(i + 1) : valor);
  }

  const freq = partes.get('FREQ');
  if (!freq) throw new Error('FREQ é obrigatório');
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    throw new Error(`FREQ não suportado: ${freq}`);
  }
  if (partes.has('UNTIL') && partes.has('COUNT')) throw new Error('UNTIL e COUNT juntos');

  const byDay: DiaDaRegra[] = (partes.get('BYDAY')?.split(',') ?? []).map((v) => {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(v);
    if (!m) throw new Error(`BYDAY inválido: ${v}`);
    const dia = DIAS_RFC.indexOf(m[2]!);
    if (m[1] === undefined) return { dia };
    if (freq !== 'MONTHLY' && freq !== 'YEARLY') {
      throw new Error(`BYDAY ordinal (${v}) só vale com FREQ=MONTHLY ou YEARLY`);
    }
    return { dia, ordinal: inteiro(m[1], -5, 5, 'ordinal do BYDAY', true) };
  });
  const byMonthDay = (partes.get('BYMONTHDAY')?.split(',') ?? []).map((v) =>
    inteiro(v, -31, 31, 'BYMONTHDAY', true),
  );
  const byMonth = (partes.get('BYMONTH')?.split(',') ?? []).map((v) =>
    inteiro(v, 1, 12, 'BYMONTH'),
  );
  if (freq === 'WEEKLY' && byMonthDay.length) throw new Error('BYMONTHDAY não vale com WEEKLY');
  if (freq === 'YEARLY' && byDay.length && !byMonth.length) {
    throw new Error('BYDAY em FREQ=YEARLY exige BYMONTH');
  }

  const wkstTexto = partes.get('WKST');
  const wkst = wkstTexto === undefined ? 1 : DIAS_RFC.indexOf(wkstTexto);
  if (wkst < 0) throw new Error(`WKST inválido: ${wkstTexto}`);

  return {
    freq: freq as Frequencia,
    intervalo: partes.has('INTERVAL') ? inteiro(partes.get('INTERVAL')!, 1, 1000, 'INTERVAL') : 1,
    byDay,
    byMonthDay,
    byMonth,
    until: partes.has('UNTIL') ? lerUntil(partes.get('UNTIL')!, fuso) : null,
    count: partes.has('COUNT') ? inteiro(partes.get('COUNT')!, 1, 100_000, 'COUNT') : null,
    wkst,
  };
}

/** Serializa de volta para texto RFC (forma canônica). */
export function serializarRRule(r: RegraRecorrencia): string {
  const p = [`FREQ=${r.freq}`];
  if (r.intervalo !== 1) p.push(`INTERVAL=${r.intervalo}`);
  if (r.byDay.length) {
    p.push(`BYDAY=${r.byDay.map((d) => `${d.ordinal ?? ''}${DIAS_RFC[d.dia]}`).join(',')}`);
  }
  if (r.byMonthDay.length) p.push(`BYMONTHDAY=${r.byMonthDay.join(',')}`);
  if (r.byMonth.length) p.push(`BYMONTH=${r.byMonth.join(',')}`);
  if (r.wkst !== 1) p.push(`WKST=${DIAS_RFC[r.wkst]}`);
  if (r.count !== null) p.push(`COUNT=${r.count}`);
  if (r.until) {
    if ('dia' in r.until) p.push(`UNTIL=${r.until.dia.replace(/-/g, '')}`);
    else
      p.push(`UNTIL=${r.until.instante.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`);
  }
  return p.join(';');
}

// ---- expansão -------------------------------------------------------------------------------

/** Dias do mês que casam com BYMONTHDAY/BYDAY (ou o dia do DTSTART), em ordem. */
function diasNoMesDaRegra(
  r: RegraRecorrencia,
  ano: number,
  mes: number,
  diaInicial: number,
): number[] {
  const total = diasNoMes(ano, mes);
  let candidatos: number[];
  if (r.byMonthDay.length) {
    // Dia inexistente no mês (31 em abril, 30 em fevereiro) é PULADO — especificação §5.1.
    candidatos = r.byMonthDay
      .map((n) => (n > 0 ? n : total + 1 + n))
      .filter((n) => n >= 1 && n <= total);
  } else if (r.byDay.length) {
    candidatos = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    candidatos = diaInicial <= total ? [diaInicial] : [];
  }
  if (r.byDay.length) {
    candidatos = candidatos.filter((d) => {
      const semana = diaDaSemana(montarDia(ano, mes, d));
      return r.byDay.some((b) => {
        if (b.dia !== semana) return false;
        if (b.ordinal === undefined) return true;
        const n = b.ordinal > 0 ? Math.ceil(d / 7) : -Math.ceil((total - d + 1) / 7);
        return n === b.ordinal;
      });
    });
  }
  return [...new Set(candidatos)].sort((a, b) => a - b);
}

/**
 * Gera os dias civis da série em ordem, a partir do dia do DTSTART, até `limite` (inclusive).
 * Não aplica COUNT nem UNTIL — isso é de `ocorrencias`.
 */
function* diasDaSerie(r: RegraRecorrencia, inicio: Dia, limite: Dia): Generator<Dia> {
  const { ano: a0, mes: m0, dia: d0 } = partesDoDia(inicio);
  const passaMes = (mes: number) => !r.byMonth.length || r.byMonth.includes(mes);

  if (r.freq === 'DAILY') {
    for (let d = inicio; d <= limite; d = somarDias(d, r.intervalo)) {
      const { mes, dia } = partesDoDia(d);
      if (!passaMes(mes)) continue;
      if (r.byMonthDay.length) {
        const total = diasNoMes(partesDoDia(d).ano, mes);
        if (!r.byMonthDay.some((n) => (n > 0 ? n : total + 1 + n) === dia)) continue;
      }
      if (r.byDay.length && !r.byDay.some((b) => b.dia === diaDaSemana(d))) continue;
      yield d;
    }
    return;
  }

  if (r.freq === 'WEEKLY') {
    const dias = r.byDay.length ? r.byDay.map((b) => b.dia) : [diaDaSemana(inicio)];
    const recuo = (diaDaSemana(inicio) - r.wkst + 7) % 7;
    for (
      let semana = somarDias(inicio, -recuo);
      semana <= limite;
      semana = somarDias(semana, 7 * r.intervalo)
    ) {
      for (let i = 0; i < 7; i++) {
        const d = somarDias(semana, i);
        if (d < inicio || d > limite) continue;
        if (!dias.includes(diaDaSemana(d))) continue;
        if (!passaMes(partesDoDia(d).mes)) continue;
        yield d;
      }
    }
    return;
  }

  if (r.freq === 'MONTHLY') {
    for (let k = 0; ; k += r.intervalo) {
      const ano = a0 + Math.floor((m0 - 1 + k) / 12);
      const mes = ((m0 - 1 + k) % 12) + 1;
      if (montarDia(ano, mes, 1) > limite) return;
      if (!passaMes(mes)) continue;
      for (const dia of diasNoMesDaRegra(r, ano, mes, d0)) {
        const d = montarDia(ano, mes, dia);
        if (d >= inicio && d <= limite) yield d;
      }
    }
  }

  // YEARLY
  const meses = r.byMonth.length
    ? [...r.byMonth].sort((a, b) => a - b)
    : r.byMonthDay.length
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : [m0];
  for (let ano = a0; ; ano += r.intervalo) {
    if (montarDia(ano, 1, 1) > limite) return;
    for (const mes of meses) {
      // 29/02 anual: diasNoMesDaRegra não devolve o dia 29 em fevereiro de ano não bissexto.
      for (const dia of diasNoMesDaRegra(r, ano, mes, d0)) {
        const d = montarDia(ano, mes, dia);
        if (d >= inicio && d <= limite) yield d;
      }
    }
  }
}

export interface Ocorrencia {
  /** Data ORIGINAL da ocorrência segundo a regra — a identidade dela, mesmo se for movida. */
  data: Dia;
  inicio: Date;
  fim: Date | null;
}

export interface Serie {
  rrule: string | RegraRecorrencia;
  /** Início da primeira ocorrência (DTSTART). */
  inicio: Date;
  /** Duração de cada ocorrência, em ms. 0 ou null = ponto no tempo. */
  duracaoMs: number | null;
  fuso?: string;
}

const LIMITE_DE_BUSCA_DIAS = 366 * 200;

/**
 * Ocorrências cujo intervalo `[inicio, fim)` toca `[de, ate)` — ou, sem duração, cujo início
 * cai em `[de, ate)`. COUNT conta desde o início da série, não desde `de`.
 */
export function ocorrencias(serie: Serie, de: Date, ate: Date): Ocorrencia[] {
  const fuso = serie.fuso ?? FUSO_PADRAO;
  const r = typeof serie.rrule === 'string' ? interpretar(serie.rrule, fuso) : serie.rrule;
  const duracao = serie.duracaoMs ?? 0;
  const p = partesNoFuso(serie.inicio, fuso);
  const primeiroDia = montarDia(p.ano, p.mes, p.dia);
  // Segundos e milissegundos do início (a hora de parede só tem hora e minuto): sem eles, um
  // início às 19:00:30 descartaria a primeira ocorrência, gerada às 19:00:00.
  const restoMs = serie.inicio.getTime() % 60_000;

  // Dia civil mais tardio que pode produzir ocorrência no intervalo.
  let limite = diaDe(new Date(ate.getTime() - 1), fuso);
  if (r.until) {
    const u = 'dia' in r.until ? r.until.dia : diaDe(r.until.instante, fuso);
    if (u < limite) limite = u;
  }
  const teto = somarDias(primeiroDia, LIMITE_DE_BUSCA_DIAS);
  if (limite > teto) limite = teto;
  // Com duração, uma ocorrência que começou antes de `de` ainda pode tocar o intervalo.
  const diaMinimo = diaDe(new Date(de.getTime() - duracao), fuso);

  const saida: Ocorrencia[] = [];
  let contadas = 0;
  for (const dia of diasDaSerie(r, primeiroDia, limite)) {
    if (r.count !== null && contadas >= r.count) break;
    contadas++;
    if (dia < diaMinimo && r.count === null) continue;
    const { ano, mes, dia: d } = partesDoDia(dia);
    const inicio = new Date(
      instanteDeParede(ano, mes, d, p.hora, p.minuto, fuso).getTime() + restoMs,
    );
    if (inicio < serie.inicio) {
      contadas--;
      continue;
    }
    if (r.until && 'instante' in r.until && inicio > r.until.instante) break;
    const fim = duracao > 0 ? new Date(inicio.getTime() + duracao) : null;
    const toca = fim ? inicio < ate && fim > de : inicio >= de && inicio < ate;
    if (toca) saida.push({ data: dia, inicio, fim });
  }
  return saida;
}

/** A data dada é uma ocorrência da série? (Rotas de ocorrência validam com isto.) */
export function ehOcorrencia(serie: Serie, data: Dia): boolean {
  const fuso = serie.fuso ?? FUSO_PADRAO;
  const de = inicioDoDia(data, fuso);
  const ate = inicioDoDia(somarDias(data, 1), fuso);
  return ocorrencias({ ...serie, duracaoMs: 0 }, de, ate).some((o) => o.data === data);
}

/**
 * Fim da última ocorrência, ou null se a série não termina. É o `recurrenceEndsAt` desnormalizado
 * da especificação §5 — com COUNT, calculado a partir da última ocorrência.
 */
export function fimDaSerie(serie: Serie): Date | null {
  const fuso = serie.fuso ?? FUSO_PADRAO;
  const r = typeof serie.rrule === 'string' ? interpretar(serie.rrule, fuso) : serie.rrule;
  if (r.count === null && r.until === null) return null;
  const todas = ocorrencias(
    { ...serie, rrule: r, duracaoMs: 0 },
    serie.inicio,
    new Date(serie.inicio.getTime() + LIMITE_DE_BUSCA_DIAS * 86_400_000),
  );
  const ultima = todas.at(-1);
  if (!ultima) return serie.inicio;
  return new Date(ultima.inicio.getTime() + (serie.duracaoMs ?? 0));
}
