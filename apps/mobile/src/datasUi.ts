import {
  diaDe,
  FUSO_PADRAO,
  horaDe,
  instanteDeParede,
  nomeDoMes,
  partesDoDia,
  partesNoFuso,
  type Dia,
} from '@compasso/core';

/**
 * Pontes entre a hora de São Paulo (ADR-0003) e o seletor de data nativo, que só fala o fuso do
 * aparelho. O seletor recebe um Date cujos campos LOCAIS são a hora de parede de São Paulo; o
 * que ele devolve é lido pelos campos locais e reconvertido. Funciona em qualquer fuso.
 */
export function paraSeletor(instante: Date): Date {
  const p = partesNoFuso(instante, FUSO_PADRAO);
  return new Date(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
}

export function doSeletor(valor: Date): Date {
  return instanteDeParede(
    valor.getFullYear(),
    valor.getMonth() + 1,
    valor.getDate(),
    valor.getHours(),
    valor.getMinutes(),
    FUSO_PADRAO,
  );
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "quarta, 23 de setembro" */
export function tituloDoDia(dia: Dia): string {
  const { ano, mes, dia: d } = partesDoDia(dia);
  const semana = SEMANA[new Date(Date.UTC(ano, mes - 1, d)).getUTCDay()];
  return `${semana}, ${d} de ${nomeDoMes(mes)}`;
}

/** "23/09 14:30" — sempre em São Paulo. */
export function dataHoraCurta(instante: Date): string {
  const { dia, mes } = partesDoDia(diaDe(instante));
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} ${horaDe(instante)}`;
}

export function fusoDoAparelhoDifere(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone !== FUSO_PADRAO;
  } catch {
    return false;
  }
}

/** Título do dia em duas partes: `{ semana: 'quarta', data: '23 de setembro' }`. */
export function partesDoTitulo(dia: Dia): { semana: string; data: string } {
  const [semana = '', data = ''] = tituloDoDia(dia).split(', ');
  return { semana, data };
}

/** Sala regular de um horário da grade (a do horário, senão a padrão da disciplina). */
export function salaRegular(
  grade: {
    horarios: { id: string; room: string | null; courseId: string }[];
    disciplinas: { id: string; defaultRoom: string | null }[];
  },
  slotId: string,
): string | null {
  const h = grade.horarios.find((x) => x.id === slotId);
  if (!h) return null;
  return h.room ?? grade.disciplinas.find((c) => c.id === h.courseId)?.defaultRoom ?? null;
}
