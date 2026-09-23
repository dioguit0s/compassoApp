/**
 * Regras puras da gamificação (especificação §4). Determinísticas e caras de errar em silêncio:
 * testadas unitariamente, e usadas igual no app e na API.
 */
import { ATRIBUTOS, type Atributo, type Esforco } from './atributos';
import { diaDe, FUSO_PADRAO, type Dia } from './calendario';

// ---- XP (§4.3) -------------------------------------------------------------------------------

export interface LancamentoDeXp {
  attribute: Atributo;
  /** Décimos de ponto, inteiro. Negativo só em estorno. */
  points: number;
}

/**
 * XP = esforço, em décimos inteiros. Sem secundário: 100% no principal. Com secundário: 70/30 —
 * o secundário divide, nunca soma. A soma é SEMPRE exatamente `esforço × 10`: o principal leva o
 * arredondamento, o secundário o resto (na escala 1, 2, 3, 5, 8 a divisão já é exata).
 */
export function lancamentosDeXp(
  esforco: number,
  principal: Atributo,
  secundario: Atributo | null,
): LancamentoDeXp[] {
  const total = esforco * 10;
  if (!secundario) return [{ attribute: principal, points: total }];
  const p = Math.round((total * 7) / 10);
  return [
    { attribute: principal, points: p },
    { attribute: secundario, points: total - p },
  ];
}

/** Moeda (§4.6): 1 por ponto de esforço, valor cheio — a divisão 70/30 é só do XP. */
export function moedasDaConclusao(esforco: number): number {
  return esforco;
}

// ---- nível (§4.4) ----------------------------------------------------------------------------

/**
 * Curva de nível — constante de configuração, não dado gravado: trocar os números não exige
 * migração, porque o nível é sempre derivado do acumulado. `PROPOSTA` da especificação, a
 * calibrar na F9: a faixa 1 custa 500 décimos e cada faixa seguinte custa 1,5× a anterior.
 */
export interface CurvaDeNivel {
  primeiraFaixa: number;
  fator: number;
}

export const CURVA_DE_NIVEL: Readonly<CurvaDeNivel> = { primeiraFaixa: 500, fator: 1.5 };

/** Custo, em décimos, de sair do nível `n - 1` para o `n` (n ≥ 1). Arredondado ao inteiro. */
export function custoDaFaixa(n: number, curva: CurvaDeNivel = CURVA_DE_NIVEL): number {
  return Math.round(curva.primeiraFaixa * curva.fator ** (n - 1));
}

export interface Nivel {
  nivel: number;
  /** Décimos acumulados dentro da faixa atual. */
  naFaixa: number;
  /** Custo total da faixa atual (para o próximo nível). */
  custoDaFaixa: number;
  /** Quanto falta, em décimos, para o próximo nível. */
  faltam: number;
}

/** Nível derivado do acumulado de um atributo (nunca negativo). */
export function nivelDoAcumulado(acumulado: number, curva: CurvaDeNivel = CURVA_DE_NIVEL): Nivel {
  let restante = Math.max(0, acumulado);
  let nivel = 0;
  for (;;) {
    const custo = custoDaFaixa(nivel + 1, curva);
    if (restante < custo)
      return { nivel, naFaixa: restante, custoDaFaixa: custo, faltam: custo - restante };
    restante -= custo;
    nivel++;
  }
}

// ---- radar (§4.5) ----------------------------------------------------------------------------

export const JANELA_DO_RADAR_DIAS = 30;

export interface MedidaDoAtributo {
  attribute: Atributo;
  acumulado: number;
  janela30: number;
  nivel: Nivel;
}

/** Acumulado e janela de 30 dias por atributo — os cinco sempre presentes, mesmo zerados. */
export function medidasDoRadar(
  lancamentos: { attribute: string; points: number; earnedAt: Date }[],
  agora: Date,
): MedidaDoAtributo[] {
  const corte = agora.getTime() - JANELA_DO_RADAR_DIAS * 86_400_000;
  return ATRIBUTOS.map((attribute) => {
    let acumulado = 0;
    let janela30 = 0;
    for (const l of lancamentos) {
      if (l.attribute !== attribute) continue;
      acumulado += l.points;
      if (l.earnedAt.getTime() >= corte) janela30 += l.points;
    }
    return { attribute, acumulado, janela30, nivel: nivelDoAcumulado(acumulado) };
  });
}

// ---- congelamento do esforço (§4.1, ADR-0006) ------------------------------------------------

/**
 * Data que decide o congelamento: o prazo da tarefa ou o início do evento (numa série, o início
 * da primeira ocorrência — o esforço é da série).
 */
function dataDoItem(i: {
  kind: 'task' | 'event';
  dueAt: Date | null;
  startAt: Date | null;
}): Date | null {
  return i.kind === 'task' ? i.dueAt : i.startAt;
}

/**
 * O esforço deste item já deveria estar travado? Sim quando ele pontua e o seu dia (em São Paulo)
 * chegou. É a regra que dispara a GRAVAÇÃO de `effortLockedAt` — o travamento em si é o campo
 * gravado, não a data: adiar o item depois não destrava (issue #64).
 */
export function deveCongelar(
  i: {
    kind: 'task' | 'event';
    dueAt: Date | null;
    startAt: Date | null;
    effort: number | null;
    effortLockedAt: Date | null;
  },
  hoje: Dia,
  fuso: string = FUSO_PADRAO,
): boolean {
  if (i.effort === null || i.effortLockedAt !== null) return false;
  const d = dataDoItem(i);
  return d !== null && diaDe(d, fuso) <= hoje;
}

export function esforcoCongelado(i: { effortLockedAt: Date | string | null }): boolean {
  return i.effortLockedAt !== null;
}

// ---- régua de esforço (§4.1, issue #66) ------------------------------------------------------

/**
 * Régua de referência exibida no momento da estimativa. Conteúdo fixo, não configurável, para a
 * escala não inflar com o tempo.
 *
 * PROVISÓRIA: a especificação (§10) pede exemplos escritos pelo autor, com tarefas da vida dele —
 * sem isso a escala não ancora. Estes são genéricos, só para a interface existir; a issue #66 é
 * reescrevê-los, e a F9 recalibrá-los com uso real.
 */
export const REGUA_DE_ESFORCO: Record<Esforco, { resumo: string; exemplos: string[] }> = {
  1: {
    resumo: 'minutos, sem pensar',
    exemplos: ['pagar uma conta', 'responder um e-mail', 'lavar a louça do dia'],
  },
  2: {
    resumo: 'meia hora de atenção',
    exemplos: ['arrumar o quarto', 'ler um capítulo', 'treino leve'],
  },
  3: {
    resumo: 'uma hora focada',
    exemplos: ['lista de exercícios', 'treino completo', 'fazer as compras do mês'],
  },
  5: {
    resumo: 'uma tarde, com esforço',
    exemplos: ['estudar para uma prova', 'faxina da casa', 'entregar um relatório'],
  },
  8: {
    resumo: 'um dia pesado ou mais',
    exemplos: ['trabalho final da disciplina', 'mudança de móveis', 'maratona de revisão'],
  },
};

export const NOMES_ATRIBUTOS: Record<Atributo, string> = {
  corpo: 'Corpo',
  mente: 'Mente',
  oficio: 'Ofício',
  casa: 'Casa',
  social: 'Social',
};
