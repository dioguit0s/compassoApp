import { FUSO_PADRAO, instanteDeParede, partesDoDia, type Dia } from './calendario';
import type { EntradaAgenda } from './projecao';

/**
 * Arrastar uma tarefa para a grade da semana e agendá-la (especificação §3 e §7). Tarefa e evento
 * são a mesma linha (§5): agendar é trocar o prazo (`dueAt`) por um bloco de tempo
 * (`startAt`/`endAt`), mantendo esforço e atributos — um evento com esforço continua pontuando
 * (§4.8).
 */

/** Passo do encaixe na grade, em minutos. */
export const PASSO_DO_AGENDAMENTO_MIN = 15;
/** Duração do bloco criado ao agendar — a mesma da captura rápida. Ajusta-se no detalhe. */
export const DURACAO_DO_AGENDAMENTO_MIN = 60;

/**
 * Só tarefa simples e aberta. Ocorrência de série fica de fora: agendar uma ocorrência exigiria
 * decidir o alcance (só esta ou esta e as futuras), o que o detalhe já faz.
 */
export function podeAgendarArrastando(e: EntradaAgenda): boolean {
  return e.kind === 'task' && e.ocorrencia === null && e.status !== 'done';
}

/**
 * Minutos do dia (hora de parede) sob a posição `y` da grade, encaixados no passo. Fica dentro do
 * dia: o bloco começa no máximo em 23:00 para caber a duração padrão.
 */
export function minutosNaGrade(
  y: number,
  pixelsPorHora: number,
  passo: number = PASSO_DO_AGENDAMENTO_MIN,
): number {
  const bruto = (y / pixelsPorHora) * 60;
  const encaixado = Math.round(bruto / passo) * passo;
  return Math.min(Math.max(encaixado, 0), 24 * 60 - DURACAO_DO_AGENDAMENTO_MIN);
}

/** Mudanças que transformam a tarefa num bloco que começa em `minutos` do dia `dia`, no fuso. */
export function agendarTarefa(
  dia: Dia,
  minutos: number,
  fuso: string = FUSO_PADRAO,
): { kind: 'event'; allDay: false; dueAt: null; startAt: Date; endAt: Date } {
  const { ano, mes, dia: d } = partesDoDia(dia);
  const startAt = instanteDeParede(ano, mes, d, Math.floor(minutos / 60), minutos % 60, fuso);
  const endAt = new Date(startAt.getTime() + DURACAO_DO_AGENDAMENTO_MIN * 60_000);
  return { kind: 'event', allDay: false, dueAt: null, startAt, endAt };
}
