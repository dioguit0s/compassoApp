/**
 * Aritmética de calendário para o Compasso. Regra de fuso (ADR-0003): **todo horário é hora de
 * São Paulo**, independente do fuso do aparelho. As funções recebem o fuso por parâmetro para
 * serem testáveis e para não fechar a porta, mas o app sempre passa `FUSO_PADRAO`.
 *
 * Dia civil é uma string `AAAA-MM-DD` — sem hora, sem fuso. Converter para instante só na borda
 * (`inicioDoDia`), nunca comparando datas de dia inteiro com instantes UTC soltos.
 */
import { partesNoFuso } from './datas';

export const FUSO_PADRAO = 'America/Sao_Paulo';

/** Primeiro dia da semana: domingo (0), como o calendário brasileiro e `classSlots.weekday`. */
export const PRIMEIRO_DIA_DA_SEMANA = 0;

export type Dia = string; // 'AAAA-MM-DD'

const d2 = (n: number) => String(n).padStart(2, '0');

export function montarDia(ano: number, mes: number, dia: number): Dia {
  return `${ano}-${d2(mes)}-${d2(dia)}`;
}

export function partesDoDia(dia: Dia): { ano: number; mes: number; dia: number } {
  const [a, m, d] = dia.split('-').map(Number);
  return { ano: a!, mes: m!, dia: d! };
}

/** Deslocamento do fuso (ms, positivo a leste de UTC) no instante dado. */
function deslocamento(instanteMs: number, fuso: string): number {
  const p = partesNoFuso(new Date(instanteMs), fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return comoUtc - Math.floor(instanteMs / 60_000) * 60_000;
}

/**
 * Instante em que o relógio de parede do fuso marca a data/hora dada. Numa lacuna de horário de
 * verão (hora que não existe), avança para depois dela; numa hora repetida, escolhe a primeira.
 */
export function instanteDeParede(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  fuso: string = FUSO_PADRAO,
): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const t1 = alvo - deslocamento(alvo, fuso);
  const off1 = deslocamento(t1, fuso);
  let t = t1;
  if (alvo - off1 !== t1) {
    const t2 = alvo - off1;
    // t2 é válido se o deslocamento nele confirma; senão a hora pedida está numa lacuna de
    // horário de verão e fica o instante logo depois dela.
    t = deslocamento(t2, fuso) === off1 ? t2 : Math.max(t1, t2);
  }
  return new Date(t);
}

/** Dia civil em que o instante cai, no fuso. */
export function diaDe(instante: Date, fuso: string = FUSO_PADRAO): Dia {
  const p = partesNoFuso(instante, fuso);
  return montarDia(p.ano, p.mes, p.dia);
}

/** `HH:mm` do instante no fuso. */
export function horaDe(instante: Date, fuso: string = FUSO_PADRAO): string {
  const p = partesNoFuso(instante, fuso);
  return `${d2(p.hora)}:${d2(p.minuto)}`;
}

/** Minutos desde a meia-noite do dia civil, no fuso. */
export function minutosDoDia(instante: Date, fuso: string = FUSO_PADRAO): number {
  const p = partesNoFuso(instante, fuso);
  return p.hora * 60 + p.minuto;
}

export function inicioDoDia(dia: Dia, fuso: string = FUSO_PADRAO): Date {
  const { ano, mes, dia: d } = partesDoDia(dia);
  return instanteDeParede(ano, mes, d, 0, 0, fuso);
}

export function somarDias(dia: Dia, n: number): Dia {
  const { ano, mes, dia: d } = partesDoDia(dia);
  const t = new Date(Date.UTC(ano, mes - 1, d + n));
  return montarDia(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function somarMeses(dia: Dia, n: number): Dia {
  const { ano, mes, dia: d } = partesDoDia(dia);
  const alvo = new Date(Date.UTC(ano, mes - 1 + n, 1));
  const ultimo = diasNoMes(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1);
  return montarDia(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, Math.min(d, ultimo));
}

export function diferencaEmDias(de: Dia, ate: Dia): number {
  const a = partesDoDia(de);
  const b = partesDoDia(ate);
  return Math.round(
    (Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000,
  );
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: Dia): number {
  const { ano, mes, dia: d } = partesDoDia(dia);
  return new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function inicioDaSemana(dia: Dia): Dia {
  const recuo = (diaDaSemana(dia) - PRIMEIRO_DIA_DA_SEMANA + 7) % 7;
  return somarDias(dia, -recuo);
}

export function diasDaSemana(dia: Dia): Dia[] {
  const inicio = inicioDaSemana(dia);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

export function inicioDoMes(dia: Dia): Dia {
  const { ano, mes } = partesDoDia(dia);
  return montarDia(ano, mes, 1);
}

/** Semanas completas que cobrem o mês do dia dado (4 a 6 linhas de 7 dias). */
export function semanasDoMes(dia: Dia): Dia[][] {
  const { ano, mes } = partesDoDia(dia);
  const primeiro = montarDia(ano, mes, 1);
  const ultimo = montarDia(ano, mes, diasNoMes(ano, mes));
  const semanas: Dia[][] = [];
  for (let s = inicioDaSemana(primeiro); s <= ultimo; s = somarDias(s, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(s, i)));
  }
  return semanas;
}

/** Intervalo semiaberto `[de, ate)` em instantes, cobrindo os dias civis `[primeiro, ultimo]`. */
export function intervaloDosDias(
  primeiro: Dia,
  ultimo: Dia,
  fuso: string = FUSO_PADRAO,
): { de: Date; ate: Date } {
  return { de: inicioDoDia(primeiro, fuso), ate: inicioDoDia(somarDias(ultimo, 1), fuso) };
}

/** Próxima hora cheia depois de `agora` — o default da captura rápida. */
export function proximaHoraCheia(agora: Date, fuso: string = FUSO_PADRAO): Date {
  const p = partesNoFuso(agora, fuso);
  return instanteDeParede(p.ano, p.mes, p.dia, p.hora + 1, 0, fuso);
}

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
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function nomeDoMes(mes: number): string {
  return MESES[mes - 1]!;
}

export function nomeCurtoDoDia(dia: Dia): string {
  return DIAS_SEMANA[diaDaSemana(dia)]!;
}

/** "23/09" ou "23/09/2027" quando o ano difere do de referência. */
export function formatarDiaCurto(dia: Dia, anoReferencia?: number): string {
  const { ano, mes, dia: d } = partesDoDia(dia);
  return anoReferencia === undefined || ano === anoReferencia
    ? `${d2(d)}/${d2(mes)}`
    : `${d2(d)}/${d2(mes)}/${ano}`;
}
