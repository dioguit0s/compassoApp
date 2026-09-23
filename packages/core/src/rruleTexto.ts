/**
 * Ponte entre a RRULE e a interface: montar a regra a partir das opções do editor (issue #43) e
 * descrevê-la em português ("Toda terça e quinta, até 30/11/2026").
 */
import { diaDaSemana, diasNoMes, FUSO_PADRAO, partesDoDia, type Dia, diaDe } from './calendario';
import { interpretar, serializarRRule, type Frequencia, type RegraRecorrencia } from './rrule';

export type FimDaRecorrencia =
  { tipo: 'nunca' } | { tipo: 'data'; dia: Dia } | { tipo: 'vezes'; n: number };

export interface OpcoesRecorrencia {
  freq: Frequencia;
  intervalo: number;
  /** WEEKLY: dias da semana (0 = domingo). Vazio = o dia do início. */
  diasDaSemana: number[];
  /** MONTHLY: no mesmo dia do mês do início, ou na mesma "n-ésima semana" (2ª terça, última sexta). */
  mensal: 'dia' | 'semana';
  fim: FimDaRecorrencia;
}

/** Ordinal do dia no mês: 1..4, ou -1 quando é a última ocorrência daquele dia da semana. */
export function ordinalNoMes(dia: Dia): number {
  const { ano, mes, dia: d } = partesDoDia(dia);
  if (d + 7 > diasNoMes(ano, mes)) return -1;
  return Math.ceil(d / 7);
}

export function montarRRule(
  o: OpcoesRecorrencia,
  inicio: Date,
  fuso: string = FUSO_PADRAO,
): string {
  const dia = diaDe(inicio, fuso);
  const regra: RegraRecorrencia = {
    freq: o.freq,
    intervalo: Math.max(1, Math.floor(o.intervalo)),
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    until: o.fim.tipo === 'data' ? { dia: o.fim.dia } : null,
    count: o.fim.tipo === 'vezes' ? Math.max(1, Math.floor(o.fim.n)) : null,
    wkst: 1,
  };
  if (o.freq === 'WEEKLY' && o.diasDaSemana.length) {
    regra.byDay = [...new Set(o.diasDaSemana)].sort((a, b) => a - b).map((d) => ({ dia: d }));
  }
  if (o.freq === 'MONTHLY' && o.mensal === 'semana') {
    regra.byDay = [{ dia: diaDaSemana(dia), ordinal: ordinalNoMes(dia) }];
  }
  return serializarRRule(regra);
}

/** Opções do editor para uma regra existente; null se a regra não cabe no editor simples. */
export function lerOpcoes(
  rrule: string,
  inicio: Date,
  fuso: string = FUSO_PADRAO,
): OpcoesRecorrencia | null {
  let r: RegraRecorrencia;
  try {
    r = interpretar(rrule, fuso);
  } catch {
    return null;
  }
  const dia = diaDe(inicio, fuso);
  const fim: FimDaRecorrencia =
    r.count !== null
      ? { tipo: 'vezes', n: r.count }
      : r.until
        ? { tipo: 'data', dia: 'dia' in r.until ? r.until.dia : diaDe(r.until.instante, fuso) }
        : { tipo: 'nunca' };
  const base = {
    freq: r.freq,
    intervalo: r.intervalo,
    diasDaSemana: [],
    mensal: 'dia' as const,
    fim,
  };
  if (r.byMonth.length || r.byMonthDay.length || r.wkst !== 1) return null;
  if (r.freq === 'DAILY' || r.freq === 'YEARLY') return r.byDay.length ? null : base;
  if (r.freq === 'WEEKLY') {
    if (r.byDay.some((b) => b.ordinal !== undefined)) return null;
    return { ...base, diasDaSemana: r.byDay.map((b) => b.dia) };
  }
  if (!r.byDay.length) return base;
  const b = r.byDay[0]!;
  if (r.byDay.length === 1 && b.dia === diaDaSemana(dia) && b.ordinal === ordinalNoMes(dia)) {
    return { ...base, mensal: 'semana' };
  }
  return null;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

function ordinal(n: number): string {
  return n === -1 ? 'última' : n < 0 ? `${-n}ª de trás para frente` : `${n}ª`;
}

/** "Toda terça e quinta, até 30/11/2026". Usa o início da série quando a regra depende dele. */
export function descreverRegra(rrule: string, inicio: Date, fuso: string = FUSO_PADRAO): string {
  let r: RegraRecorrencia;
  try {
    r = interpretar(rrule, fuso);
  } catch (e) {
    return `regra inválida: ${(e as Error).message}`;
  }
  const dia = diaDe(inicio, fuso);
  const { mes, dia: d } = partesDoDia(dia);
  const n = r.intervalo;
  let texto: string;
  switch (r.freq) {
    case 'DAILY':
      texto = n === 1 ? 'Todo dia' : `A cada ${n} dias`;
      break;
    case 'WEEKLY': {
      const dias = (r.byDay.length ? r.byDay.map((b) => b.dia) : [diaDaSemana(dia)]).map(
        (x) => DIAS[x]!,
      );
      const artigo = dias.every((x) => x === 'sábado' || x === 'domingo') ? 'Todo' : 'Toda';
      texto = n === 1 ? `${artigo} ${lista(dias)}` : `A cada ${n} semanas: ${lista(dias)}`;
      break;
    }
    case 'MONTHLY': {
      const quando = r.byDay.length
        ? `na ${lista(r.byDay.map((b) => `${b.ordinal !== undefined ? ordinal(b.ordinal) + ' ' : ''}${DIAS[b.dia]}`))}`
        : `no dia ${r.byMonthDay.length ? lista(r.byMonthDay.map((x) => (x < 0 ? (x === -1 ? 'último' : String(x)) : String(x)))) : d}`;
      texto = `${n === 1 ? 'Todo mês' : `A cada ${n} meses`} ${quando}`;
      break;
    }
    case 'YEARLY': {
      const meses = r.byMonth.length ? r.byMonth : [mes];
      const quando = r.byDay.length
        ? `na ${lista(r.byDay.map((b) => `${b.ordinal !== undefined ? ordinal(b.ordinal) + ' ' : ''}${DIAS[b.dia]}`))} de ${lista(meses.map((m) => MESES[m - 1]!))}`
        : `em ${r.byMonthDay.length ? lista(r.byMonthDay.map(String)) : d} de ${lista(meses.map((m) => MESES[m - 1]!))}`;
      texto = `${n === 1 ? 'Todo ano' : `A cada ${n} anos`} ${quando}`;
      break;
    }
  }
  if (r.count !== null) texto += `, ${r.count} ${r.count === 1 ? 'vez' : 'vezes'}`;
  if (r.until) {
    const u = 'dia' in r.until ? r.until.dia : diaDe(r.until.instante, fuso);
    const p = partesDoDia(u);
    texto += `, até ${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}/${p.ano}`;
  }
  return texto;
}
