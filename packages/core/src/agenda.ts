/**
 * Regras puras de "este item cai neste intervalo/dia?" e de layout, usadas pelas telas do app e
 * (a partir da F3) pela projeção da API. Todas as datas são instantes; dias civis são calculados
 * no fuso (sempre São Paulo — ADR-0003).
 *
 * Dia inteiro (ADR-0003): `startAt` é a meia-noite do primeiro dia e `endAt` a meia-noite do dia
 * SEGUINTE ao último (fim exclusivo). Um evento de sexta a domingo tem `endAt` = segunda 00:00.
 */
import { diaDe, FUSO_PADRAO, inicioDoDia, minutosDoDia, somarDias, type Dia } from './calendario';

export interface ItemDeAgenda {
  id: string;
  title: string;
  kind: 'task' | 'event';
  effort: number | null;
  allDay: boolean;
  dueAt: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  status: 'open' | 'done';
}

/** Sobreposição com `[de, ate)`. Evento sem fim é um ponto no tempo. Tarefa usa o prazo. */
export function itemNoIntervalo(item: ItemDeAgenda, de: Date, ate: Date): boolean {
  if (item.kind === 'task') {
    return item.dueAt !== null && item.dueAt >= de && item.dueAt < ate;
  }
  if (item.startAt === null) return false;
  if (item.startAt >= ate) return false;
  if (item.endAt !== null && item.endAt > item.startAt) return item.endAt > de;
  return item.startAt >= de;
}

/** Dias civis que o item ocupa, em ordem. */
export function diasDoItem(item: ItemDeAgenda, fuso: string = FUSO_PADRAO): Dia[] {
  const inicio = item.kind === 'task' ? item.dueAt : item.startAt;
  if (inicio === null) return [];
  const primeiro = diaDe(inicio, fuso);
  const fim = item.kind === 'event' ? item.endAt : null;
  if (fim === null || fim <= inicio) return [primeiro];
  // Fim exclusivo: um evento que termina exatamente à meia-noite não ocupa o dia seguinte.
  const ultimo = diaDe(new Date(fim.getTime() - 1), fuso);
  const dias: Dia[] = [];
  for (let d = primeiro; d <= ultimo; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** Ocupa a faixa de "dia inteiro" da visão: dia inteiro, vários dias ou tarefa com prazo. */
export function vaiParaFaixaDoDia(item: ItemDeAgenda, fuso: string = FUSO_PADRAO): boolean {
  return item.allDay || item.kind === 'task' || diasDoItem(item, fuso).length > 1;
}

/**
 * Ordem dentro de um dia: dia inteiro e vários dias primeiro, depois pelo horário (início do
 * evento ou prazo da tarefa), depois pelo título.
 */
export function compararNoDia(a: ItemDeAgenda, b: ItemDeAgenda): number {
  const fa = a.allDay ? 0 : 1;
  const fb = b.allDay ? 0 : 1;
  if (fa !== fb) return fa - fb;
  const ta = (a.kind === 'task' ? a.dueAt : a.startAt)?.getTime() ?? 0;
  const tb = (b.kind === 'task' ? b.dueAt : b.startAt)?.getTime() ?? 0;
  return ta - tb || a.title.localeCompare(b.title, 'pt-BR');
}

/** Distribui os itens pelos dias pedidos, cada dia já ordenado. */
export function agruparPorDia<T extends ItemDeAgenda>(
  itens: T[],
  dias: Dia[],
  fuso: string = FUSO_PADRAO,
): Map<Dia, T[]> {
  const mapa = new Map<Dia, T[]>(dias.map((d) => [d, []]));
  for (const item of itens) {
    for (const d of diasDoItem(item, fuso)) mapa.get(d)?.push(item);
  }
  for (const lista of mapa.values()) lista.sort(compararNoDia);
  return mapa;
}

export interface BlocoPosicionado<T> {
  item: T;
  /** Minutos desde a meia-noite do dia, recortados ao dia. */
  inicioMin: number;
  fimMin: number;
  coluna: number;
  colunas: number;
}

/** Duração mínima visual de um evento sem fim ou muito curto. */
const DURACAO_MINIMA = 30;

/**
 * Posiciona os eventos com hora de um dia numa grade: eventos simultâneos ficam lado a lado.
 * Algoritmo guloso por grupos de sobreposição — cada grupo divide a largura pelo número de
 * colunas que precisou.
 */
export function posicionarNoDia<T extends ItemDeAgenda>(
  itens: T[],
  dia: Dia,
  fuso: string = FUSO_PADRAO,
): BlocoPosicionado<T>[] {
  const inicioDia = inicioDoDia(dia, fuso).getTime();
  const fimDia = inicioDoDia(somarDias(dia, 1), fuso).getTime();
  const minutosNoDia = Math.round((fimDia - inicioDia) / 60_000);

  const blocos = itens
    .filter((i) => i.kind === 'event' && i.startAt && !vaiParaFaixaDoDia(i, fuso))
    .map((item) => {
      const ini = item.startAt!.getTime() < inicioDia ? 0 : minutosDoDia(item.startAt!, fuso);
      const fimReal =
        item.endAt === null
          ? ini + DURACAO_MINIMA
          : item.endAt.getTime() >= fimDia
            ? minutosNoDia
            : minutosDoDia(item.endAt, fuso);
      return {
        item,
        inicioMin: ini,
        fimMin: Math.min(minutosNoDia, Math.max(fimReal, ini + DURACAO_MINIMA)),
        coluna: 0,
        colunas: 1,
      };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin);

  let grupo: typeof blocos = [];
  let fimDoGrupo = -1;
  const fecharGrupo = () => {
    const colunas = Math.max(1, ...grupo.map((b) => b.coluna + 1));
    for (const b of grupo) b.colunas = colunas;
    grupo = [];
  };
  for (const bloco of blocos) {
    if (bloco.inicioMin >= fimDoGrupo) fecharGrupo();
    const ocupadas = new Set(grupo.filter((g) => g.fimMin > bloco.inicioMin).map((g) => g.coluna));
    let c = 0;
    while (ocupadas.has(c)) c++;
    bloco.coluna = c;
    grupo.push(bloco);
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fimMin);
  }
  fecharGrupo();
  return blocos;
}

/** Até `limite` itens por dia e quantos sobraram — a regra da visão de mês. */
export function recortarDia<T>(itens: T[], limite = 3): { visiveis: T[]; excedentes: number } {
  return { visiveis: itens.slice(0, limite), excedentes: Math.max(0, itens.length - limite) };
}

/** `startAt`/`endAt` de um evento de dia inteiro que vai de `primeiro` a `ultimo` (inclusive). */
export function limitesDiaInteiro(
  primeiro: Dia,
  ultimo: Dia,
  fuso: string = FUSO_PADRAO,
): { startAt: Date; endAt: Date } {
  return { startAt: inicioDoDia(primeiro, fuso), endAt: inicioDoDia(somarDias(ultimo, 1), fuso) };
}
