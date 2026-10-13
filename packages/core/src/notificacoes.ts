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
 *
 * Três origens de disparo dividem o orçamento: lembretes de item, lembretes de aula (a grade não
 * é item, então a aula não tem lembrete próprio: vale uma preferência do aparelho) e o resumo da
 * manhã, que ocupa uma vaga fixa. As regras de seleção são todas daqui, puras e testadas; o app
 * só as executa contra o agendador do sistema.
 */
import { diasDoItem, type ItemDeAgenda } from './agenda';
import {
  diaDe,
  FUSO_PADRAO,
  instanteDeParede,
  partesDoDia,
  somarDias,
  type Dia,
} from './calendario';
import { cargaDoDia, rotuloDaCarga, type Carga } from './carga';
import { instantesDaAula, REGEX_HORA, type Aula } from './grade';
import type { EntradaAgenda } from './projecao';

/** 60 de 64: folga para notificações de teste e do sistema. */
export const ORCAMENTO_NOTIFICACOES = 60;

/** Quanto à frente a agenda é projetada para escolher os disparos. */
export const HORIZONTE_NOTIFICACOES_DIAS = 45;

export type TipoDeDisparo = 'item' | 'aula' | 'resumo';

export interface Disparo {
  /**
   * Identificador estável: muda se o instante, o lembrete ou o texto mudar, então reagendar
   * cancela o antigo e agenda o novo; se nada mudou, o mesmo id é reconhecido e nada é refeito.
   */
  id: string;
  tipo: TipoDeDisparo;
  /** Só em `item`. */
  itemId: string | null;
  ocorrencia: string | null;
  /** Só em `aula`: o horário da grade. */
  slotId: string | null;
  /** Em `aula` e `resumo`: o dia a que o disparo se refere. */
  dia: Dia | null;
  /** Qual lembrete gerou o disparo, em minutos antes do início (0 no resumo). */
  minutosAntes: number;
  /** Item pontuável: a notificação oferece "Concluir" (ADR-0006: o mesmo fluxo idempotente). */
  concluivel: boolean;
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
 * Instante (ms) de um id de disparo: `compasso:<item>@<ocorrência>@<instante>@<minutos>@<resumo>`
 * (em aula, `aula.<horário>@<dia>`; no resumo da manhã, `resumo@<dia>`).
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
        tipo: 'item',
        itemId: e.itemId,
        ocorrencia: e.ocorrencia,
        slotId: null,
        dia: null,
        minutosAntes: minutos,
        concluivel: e.effort !== null,
        instante,
        titulo: e.title,
        corpo,
      });
    }
  }
  return disparos.sort(porProximidade);
}

const porProximidade = (a: Disparo, b: Disparo) =>
  a.instante.getTime() - b.instante.getTime() || a.id.localeCompare(b.id);

/** Os disparos que cabem no orçamento: os mais próximos primeiro. */
export function selecionarDisparos(
  entradas: EntradaAgenda[],
  agora: Date,
  orcamento: number = ORCAMENTO_NOTIFICACOES,
  descreverQuando: (e: EntradaAgenda, instante: Date) => string = () => '',
): Disparo[] {
  return listarDisparos(entradas, agora, descreverQuando).slice(0, Math.max(0, orcamento));
}

// ---- lembrete de aula ----------------------------------------------------------------------

export interface LembreteDeAula {
  /** Quantos minutos antes do início da aula. */
  minutosAntes: number;
  /** Disciplinas (`courseId`) que não avisam. */
  silenciadas?: ReadonlySet<string>;
}

/** "19:00–20:40 · sala B-204"; com a sala trocada, ela vem na frente: é o que não pode passar. */
export function corpoDoLembreteDeAula(a: Aula): string {
  const horario = `${a.inicio}–${a.fim}`;
  if (a.salaTrocada && a.sala) return `Sala trocada: ${a.sala} · ${horario}`;
  return a.sala ? `${horario} · sala ${a.sala}` : horario;
}

/**
 * Um aviso antes de cada aula projetada (ADR-0005: aula não é item, então não há lembrete por
 * aula — a regra é uma só, com disciplinas silenciáveis). Aula cancelada não avisa; a extra
 * (reposição) avisa. O id usa `aula.<horário>` no lugar do item.
 */
export function listarDisparosDeAulas(
  aulas: Aula[],
  agora: Date,
  lembrete: LembreteDeAula,
  fuso: string = FUSO_PADRAO,
): Disparo[] {
  const disparos: Disparo[] = [];
  for (const a of aulas) {
    if (a.cancelada || lembrete.silenciadas?.has(a.courseId)) continue;
    const { inicio } = instantesDaAula(a, fuso);
    const instante = new Date(inicio.getTime() - lembrete.minutosAntes * 60_000);
    if (instante <= agora) continue;
    const titulo = a.extra ? `${a.disciplina} (reposição)` : a.disciplina;
    const corpo = corpoDoLembreteDeAula(a);
    disparos.push({
      id: `${PREFIXO_DISPARO}aula.${a.slotId}@${a.dia}@${instante.getTime()}@${lembrete.minutosAntes}@${resumo(`${titulo}\n${corpo}`)}`,
      tipo: 'aula',
      itemId: null,
      ocorrencia: null,
      slotId: a.slotId,
      dia: a.dia,
      minutosAntes: lembrete.minutosAntes,
      concluivel: false,
      instante,
      titulo,
      corpo,
    });
  }
  return disparos.sort(porProximidade);
}

// ---- resumo da manhã -----------------------------------------------------------------------

export interface ResumoDoDia {
  aulas: number;
  compromissos: number;
  tarefas: number;
  carga: Carga;
}

/** O que há no dia: aulas não canceladas, eventos e tarefas em aberto, e a carga (§7). */
export function resumirDia(
  dia: Dia,
  entradas: ItemDeAgenda[],
  aulas: Aula[],
  fuso: string = FUSO_PADRAO,
): ResumoDoDia {
  const abertas = entradas.filter((e) => e.status !== 'done' && diasDoItem(e, fuso).includes(dia));
  return {
    aulas: aulas.filter((a) => !a.cancelada && a.dia === dia).length,
    compromissos: abertas.filter((e) => e.kind === 'event').length,
    tarefas: abertas.filter((e) => e.kind === 'task').length,
    carga: cargaDoDia(dia, entradas, aulas, fuso),
  };
}

/** "3 aulas, 2 compromissos, 1 tarefa · esforço 8 · 5 h ocupadas"; dia sem nada devolve null. */
export function textoDoResumo(r: ResumoDoDia): string | null {
  const n = (q: number, um: string, varios: string) => (q ? `${q} ${q === 1 ? um : varios}` : '');
  const contagem = [
    n(r.aulas, 'aula', 'aulas'),
    n(r.compromissos, 'compromisso', 'compromissos'),
    n(r.tarefas, 'tarefa', 'tarefas'),
  ]
    .filter(Boolean)
    .join(', ');
  if (!contagem) return null;
  const carga = rotuloDaCarga(r.carga);
  return carga ? `${contagem} · ${carga}` : contagem;
}

/** Próxima vez que o relógio de parede marca `hora` (`HH:mm`): hoje, ou amanhã se já passou. */
export function proximoResumo(
  agora: Date,
  hora: string,
  fuso: string = FUSO_PADRAO,
): { dia: Dia; instante: Date } | null {
  if (!REGEX_HORA.test(hora)) return null;
  const [h, m] = hora.split(':').map(Number);
  const em = (dia: Dia) => {
    const p = partesDoDia(dia);
    return instanteDeParede(p.ano, p.mes, p.dia, h!, m!, fuso);
  };
  const hoje = diaDe(agora, fuso);
  const instante = em(hoje);
  if (instante > agora) return { dia: hoje, instante };
  const amanha = somarDias(hoje, 1);
  return { dia: amanha, instante: em(amanha) };
}

/**
 * O disparo do próximo resumo da manhã, com o texto do dia a que ele se refere. Só o próximo é
 * agendado — uma vaga do orçamento, não uma por dia: o app reagenda a cada abertura e em
 * background, e aí entra o do dia seguinte. Dia sem nada marcado não gera resumo.
 */
export function disparoDoResumo(
  agora: Date,
  hora: string,
  doDia: (dia: Dia) => { entradas: ItemDeAgenda[]; aulas: Aula[] },
  fuso: string = FUSO_PADRAO,
): Disparo | null {
  const proximo = proximoResumo(agora, hora, fuso);
  if (!proximo) return null;
  const { entradas, aulas } = doDia(proximo.dia);
  const corpo = textoDoResumo(resumirDia(proximo.dia, entradas, aulas, fuso));
  if (!corpo) return null;
  const titulo = 'Hoje';
  return {
    id: `${PREFIXO_DISPARO}resumo@${proximo.dia}@${proximo.instante.getTime()}@0@${resumo(`${titulo}\n${corpo}`)}`,
    tipo: 'resumo',
    itemId: null,
    ocorrencia: null,
    slotId: null,
    dia: proximo.dia,
    minutosAntes: 0,
    concluivel: false,
    instante: proximo.instante,
    titulo,
    corpo,
  };
}

// ---- orçamento compartilhado -----------------------------------------------------------------

export interface PlanoDeNotificacoes {
  /** O que fica agendado, em ordem de disparo; nunca mais que o orçamento. */
  selecao: Disparo[];
  /** O que não coube, em ordem de disparo: o primeiro é o próximo a entrar quando abrir vaga. */
  descartados: Disparo[];
}

/**
 * Reparte o orçamento. O resumo da manhã, quando existe, tem uma vaga fixa (é um só e perde o
 * sentido se for o primeiro a cair). O resto — lembretes de item e de aula, sem distinção — entra
 * por proximidade: o que dispara antes ganha de qualquer coisa que dispara depois.
 */
export function aplicarOrcamento(
  disparos: Disparo[],
  resumoDaManha: Disparo | null = null,
  orcamento: number = ORCAMENTO_NOTIFICACOES,
): PlanoDeNotificacoes {
  const total = Math.max(0, orcamento);
  const fixo = resumoDaManha && total > 0 ? [resumoDaManha] : [];
  const ordenados = [...disparos].sort(porProximidade);
  const vagas = total - fixo.length;
  return {
    selecao: [...ordenados.slice(0, vagas), ...fixo].sort(porProximidade),
    descartados: ordenados.slice(vagas),
  };
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
