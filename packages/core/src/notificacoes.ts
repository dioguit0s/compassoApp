/**
 * Janela deslizante de notificações (especificação §6.2, issue #48). O iOS mantém no máximo 64
 * notificações pendentes por app; uma série diária sozinha estoura isso em dois meses. Então só as
 * próximas entram, priorizadas por proximidade, e o app reagenda sempre que algo muda.
 *
 * O instante do disparo vem da hora de São Paulo (ADR-0003): um lembrete de um compromisso às
 * 14:00 de São Paulo dispara às 14:00 de São Paulo, esteja o aparelho onde estiver.
 */
import type { EntradaAgenda } from './projecao';

/** 60 de 64: folga para notificações de teste e do sistema. */
export const ORCAMENTO_NOTIFICACOES = 60;

/** Quanto à frente a agenda é projetada para escolher os disparos. */
export const HORIZONTE_NOTIFICACOES_DIAS = 45;

export interface Disparo {
  /**
   * Identificador estável: muda se o instante mudar, então reagendar cancela o antigo e agenda o
   * novo; se nada mudou, o mesmo id é reconhecido e nada é refeito.
   */
  id: string;
  itemId: string;
  ocorrencia: string | null;
  instante: Date;
  titulo: string;
  corpo: string;
}

function inicioDaEntrada(e: EntradaAgenda): Date | null {
  return e.kind === 'task' ? e.dueAt : e.startAt;
}

/** Prefixo dos identificadores do Compasso no agendador do sistema. */
export const PREFIXO_DISPARO = 'compasso:';

export function selecionarDisparos(
  entradas: EntradaAgenda[],
  agora: Date,
  orcamento: number = ORCAMENTO_NOTIFICACOES,
  descreverQuando: (e: EntradaAgenda) => string = () => '',
): Disparo[] {
  const disparos: Disparo[] = [];
  for (const e of entradas) {
    if (e.reminderMinutesBefore === null || e.status === 'done') continue;
    const inicio = inicioDaEntrada(e);
    if (!inicio) continue;
    const instante = new Date(inicio.getTime() - e.reminderMinutesBefore * 60_000);
    if (instante <= agora) continue;
    disparos.push({
      id: `${PREFIXO_DISPARO}${e.itemId}@${e.ocorrencia ?? 'unico'}@${instante.getTime()}`,
      itemId: e.itemId,
      ocorrencia: e.ocorrencia,
      instante,
      titulo: e.title,
      corpo: descreverQuando(e),
    });
  }
  disparos.sort((a, b) => a.instante.getTime() - b.instante.getTime() || a.id.localeCompare(b.id));
  return disparos.slice(0, Math.max(0, orcamento));
}

/**
 * Diferença entre o que está agendado no sistema e a seleção: o que cancelar e o que agendar.
 * Identificadores que não são do Compasso nunca são tocados.
 */
export function planejarReagendamento(
  agendados: string[],
  selecao: Disparo[],
): { cancelar: string[]; agendar: Disparo[] } {
  const desejados = new Set(selecao.map((d) => d.id));
  const existentes = new Set(agendados);
  return {
    cancelar: agendados.filter((id) => id.startsWith(PREFIXO_DISPARO) && !desejados.has(id)),
    agendar: selecao.filter((d) => !existentes.has(d.id)),
  };
}
