/**
 * Carga do dia e da semana (especificação §7): duas medidas lado a lado, como o radar, para ver se
 * um dia já está cheio antes de encher mais. Só informa — não bloqueia nada nem sugere mover.
 *
 * - Esforço: soma do esforço dos itens pontuáveis ABERTOS do dia (tarefa com prazo no dia, evento
 *   pontuável). Um item de vários dias conta uma vez, no primeiro dia: o esforço é um só.
 * - Tempo ocupado: eventos com horário mais as aulas projetadas da grade, recortados ao dia. É a
 *   UNIÃO dos intervalos — uma reunião em cima da aula não ocupa a hora duas vezes. Dia inteiro e
 *   evento sem fim (um ponto no tempo) não contam tempo.
 *
 * Item concluído e aula cancelada ficam de fora; ocorrência cancelada nem chega aqui (a projeção
 * já a esconde). Puro: quem chama traz a agenda projetada (`projetarAgenda`) e as aulas
 * (`aulasDoDia`), que já resolvem séries, desvios e quinzenais.
 */
import { diasDoItem, type ItemDeAgenda } from './agenda';
import { diasDaSemana, FUSO_PADRAO, inicioDoDia, somarDias, type Dia } from './calendario';
import { instantesDaAula, type Aula } from './grade';

export interface Carga {
  esforco: number;
  minutosOcupados: number;
}

/** A partir de quanto o dia é "pesado". `null` desliga a medida. */
export interface LimiarDeCarga {
  esforco: number | null;
  horas: number | null;
}

export const LIMIAR_DE_CARGA_PADRAO: LimiarDeCarga = { esforco: 13, horas: 8 };

function uniaoEmMinutos(intervalos: [number, number][]): number {
  intervalos.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let fimAtual = -Infinity;
  for (const [ini, fim] of intervalos) {
    if (fim <= fimAtual) continue;
    total += fim - Math.max(ini, fimAtual);
    fimAtual = fim;
  }
  return Math.round(total / 60_000);
}

export function cargaDoDia(
  dia: Dia,
  entradas: ItemDeAgenda[],
  aulas: Aula[],
  fuso: string = FUSO_PADRAO,
): Carga {
  const inicio = inicioDoDia(dia, fuso).getTime();
  const fim = inicioDoDia(somarDias(dia, 1), fuso).getTime();
  const ocupados: [number, number][] = [];
  let esforco = 0;

  for (const e of entradas) {
    if (e.status === 'done') continue;
    const dias = diasDoItem(e, fuso);
    if (!dias.includes(dia)) continue;
    if (e.effort !== null && dias[0] === dia) esforco += e.effort;
    if (e.kind !== 'event' || e.allDay || !e.startAt || !e.endAt) continue;
    const a = Math.max(e.startAt.getTime(), inicio);
    const b = Math.min(e.endAt.getTime(), fim);
    if (b > a) ocupados.push([a, b]);
  }
  for (const aula of aulas) {
    if (aula.cancelada || aula.dia !== dia) continue;
    const t = instantesDaAula(aula, fuso);
    if (t.fim > t.inicio) ocupados.push([t.inicio.getTime(), t.fim.getTime()]);
  }
  return { esforco, minutosOcupados: uniaoEmMinutos(ocupados) };
}

/** A carga de cada dia pedido — o que as visões de semana e de mês desenham. */
export function cargaDosDias(
  dias: Dia[],
  entradas: ItemDeAgenda[],
  aulas: (dia: Dia) => Aula[],
  fuso: string = FUSO_PADRAO,
): Map<Dia, Carga> {
  return new Map(dias.map((d) => [d, cargaDoDia(d, entradas, aulas(d), fuso)]));
}

export interface CargaDaSemana {
  /** Domingo a sábado, na ordem. */
  dias: (Carga & { dia: Dia })[];
  total: Carga;
}

export function cargaDaSemana(
  referencia: Dia,
  entradas: ItemDeAgenda[],
  aulas: (dia: Dia) => Aula[],
  fuso: string = FUSO_PADRAO,
): CargaDaSemana {
  const dias = diasDaSemana(referencia).map((dia) => ({
    dia,
    ...cargaDoDia(dia, entradas, aulas(dia), fuso),
  }));
  return {
    dias,
    total: {
      esforco: dias.reduce((n, d) => n + d.esforco, 0),
      minutosOcupados: dias.reduce((n, d) => n + d.minutosOcupados, 0),
    },
  };
}

export function diaPesado(c: Carga, limiar: LimiarDeCarga = LIMIAR_DE_CARGA_PADRAO): boolean {
  return (
    (limiar.esforco !== null && c.esforco >= limiar.esforco) ||
    (limiar.horas !== null && c.minutosOcupados >= limiar.horas * 60)
  );
}

/** Quanto do limiar o dia já usou, de 0 a 1 — a barra do cabeçalho da semana. */
export function fracaoDaCarga(c: Carga, limiar: LimiarDeCarga = LIMIAR_DE_CARGA_PADRAO): number {
  const e = limiar.esforco ? c.esforco / limiar.esforco : 0;
  const h = limiar.horas ? c.minutosOcupados / (limiar.horas * 60) : 0;
  return Math.min(1, Math.max(e, h));
}

/** "5 h", "1 h 30", "40 min". */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** "esforço 9 · 5 h ocupadas" — só as medidas que têm valor; dia vazio devolve ''. */
export function rotuloDaCarga(c: Carga): string {
  const partes: string[] = [];
  if (c.esforco > 0) partes.push(`esforço ${c.esforco}`);
  if (c.minutosOcupados > 0) {
    const m = c.minutosOcupados;
    const sufixo = m < 60 ? 'ocupados' : m < 120 ? 'ocupada' : 'ocupadas';
    partes.push(`${formatarDuracao(m)} ${sufixo}`);
  }
  return partes.join(' · ');
}
