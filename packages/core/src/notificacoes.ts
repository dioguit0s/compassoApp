/**
 * Janela deslizante de notificações (especificação §6.2, issue #48). O iOS mantém no máximo 64
 * notificações pendentes por app; uma série diária sozinha estoura isso em dois meses. Então só as
 * próximas entram, priorizadas por proximidade, e o app reagenda sempre que algo muda.
 *
 * O instante do disparo vem da hora de São Paulo (ADR-0003): um lembrete de um compromisso às
 * 14:00 de São Paulo dispara às 14:00 de São Paulo, esteja o aparelho onde estiver.
 *
 * Um item pode ter vários lembretes (ADR-0018): cada um vira um disparo, e todos disputam o mesmo
 * orçamento — uma série diária com dois lembretes gasta o dobro e alcança metade dos dias.
 */
import type { EntradaAgenda } from './projecao';

/** 60 de 64: folga para notificações de teste e do sistema. */
export const ORCAMENTO_NOTIFICACOES = 60;

/** Quanto à frente a agenda é projetada para escolher os disparos. */
export const HORIZONTE_NOTIFICACOES_DIAS = 45;

export interface Disparo {
  /**
   * Identificador estável: muda se o instante, o lembrete ou o texto mudar, então reagendar
   * cancela o antigo e agenda o novo; se nada mudou, o mesmo id é reconhecido e nada é refeito.
   */
  id: string;
  itemId: string;
  ocorrencia: string | null;
  /** Qual lembrete do item gerou o disparo, em minutos antes do início. */
  minutosAntes: number;
  instante: Date;
  titulo: string;
  corpo: string;
}

function inicioDaEntrada(e: EntradaAgenda): Date | null {
  return e.kind === 'task' ? e.dueAt : e.startAt;
}

/** Hash curto (djb2, base 36) do texto — só para o id mudar quando título ou corpo mudam. */
function resumo(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = (h * 33 + texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Prefixo dos identificadores do Compasso no agendador do sistema. */
export const PREFIXO_DISPARO = 'compasso:';

/**
 * Instante (ms) de um id de disparo: `compasso:<item>@<ocorrência>@<instante>@<minutos>@<resumo>`.
 * É sempre o terceiro segmento; ids da versão anterior (sem os minutos) também são lidos, para o
 * diagnóstico ordenar o que ainda não foi reagendado. Id fora do formato → null.
 */
export function instanteDoDisparo(id: string): number | null {
  if (!id.startsWith(PREFIXO_DISPARO)) return null;
  const partes = id.split('@');
  if (partes.length !== 4 && partes.length !== 5) return null;
  const ms = Number(partes[2]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Todos os disparos futuros da agenda, um por lembrete de cada entrada, do mais próximo para o
 * mais distante — ainda sem o corte do orçamento. `descreverQuando` recebe também o instante do
 * disparo: um lembrete de véspera precisa dizer o dia, o da própria hora não.
 */
export function listarDisparos(
  entradas: EntradaAgenda[],
  agora: Date,
  descreverQuando: (e: EntradaAgenda, instante: Date) => string = () => '',
): Disparo[] {
  const disparos: Disparo[] = [];
  for (const e of entradas) {
    if (e.status === 'done') continue;
    const inicio = inicioDaEntrada(e);
    if (!inicio) continue;
    for (const minutos of e.remindersMinutesBefore) {
      const instante = new Date(inicio.getTime() - minutos * 60_000);
      if (instante <= agora) continue;
      const corpo = descreverQuando(e, instante);
      disparos.push({
        id: `${PREFIXO_DISPARO}${e.itemId}@${e.ocorrencia ?? 'unico'}@${instante.getTime()}@${minutos}@${resumo(`${e.title}\n${corpo}`)}`,
        itemId: e.itemId,
        ocorrencia: e.ocorrencia,
        minutosAntes: minutos,
        instante,
        titulo: e.title,
        corpo,
      });
    }
  }
  return disparos.sort(
    (a, b) => a.instante.getTime() - b.instante.getTime() || a.id.localeCompare(b.id),
  );
}

/** Os disparos que cabem no orçamento: os mais próximos primeiro. */
export function selecionarDisparos(
  entradas: EntradaAgenda[],
  agora: Date,
  orcamento: number = ORCAMENTO_NOTIFICACOES,
  descreverQuando: (e: EntradaAgenda, instante: Date) => string = () => '',
): Disparo[] {
  return listarDisparos(entradas, agora, descreverQuando).slice(0, Math.max(0, orcamento));
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
