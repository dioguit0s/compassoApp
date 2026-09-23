/**
 * Conclusão idempotente e ledger (especificação §4.3, §4.6, §6.4, §6.6; ADR-0006).
 *
 * A conclusão é um EVENTO append-only (`completions`): `{ id, itemId, occurrenceDate, action }`,
 * com `id` gerado no aparelho no momento do toque — é a chave de idempotência. O ledger (XP e
 * moeda) é gerado a partir do evento por uma máquina de estados que olha o que o item (ou a
 * ocorrência) já creditou: concluir o que já está creditado é no-op, desfazer o que não está é
 * no-op. Assim, o mesmo evento chegando três vezes (retry), ou dois aparelhos concluindo offline,
 * creditam UMA vez. O servidor é a fonte da verdade do ledger; o app aplica a mesma função para
 * mostrar o resultado antes de sincronizar.
 */
import { z } from 'zod';
import { ATRIBUTOS, type Atributo } from './atributos';
import { lancamentosDeXp, moedasDaConclusao, type LancamentoDeXp } from './gamificacao';

const dataIso = z.iso.datetime({ offset: true });

export const esquemaConclusao = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  occurrenceDate: z.iso.date().nullable(),
  action: z.enum(['complete', 'uncomplete']),
  /** Relógio do aparelho no toque. Vira `earnedAt` (limitado ao relógio do servidor). */
  at: dataIso,
  createdAt: dataIso,
  /** Estes três só existem para o motor de sync tratar a tabela como as outras. */
  updatedAt: dataIso,
});
export type ConclusaoWire = z.infer<typeof esquemaConclusao>;

export interface LancamentoWire {
  id: string;
  itemId: string;
  occurrenceDate: string | null;
  completionId: string;
  attribute: Atributo;
  points: number;
  earnedAt: string;
}

export interface MoedaWire {
  id: string;
  amount: number;
  source: 'task' | 'redemption';
  refId: string;
  createdAt: string;
}

export const esquemaLancamento = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  occurrenceDate: z.iso.date().nullable(),
  completionId: z.uuid(),
  attribute: z.enum(ATRIBUTOS),
  points: z.number().int(),
  earnedAt: dataIso,
});

export const esquemaMoeda = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  source: z.enum(['task', 'redemption']),
  refId: z.uuid(),
  createdAt: dataIso,
});

/** O que a máquina de estados precisa saber do item no momento do evento. */
export interface ItemPontuavel {
  effort: number | null;
  primaryAttribute: Atributo | null;
  secondaryAttribute: Atributo | null;
}

export type EfeitoDaConclusao =
  | { tipo: 'creditar'; xp: LancamentoDeXp[]; moedas: number }
  | { tipo: 'estornar'; xp: LancamentoDeXp[]; moedas: number }
  | { tipo: 'nada'; motivo: string };

/**
 * Efeito de um evento, dado o que o item/ocorrência já tem no ledger (`xpAtual`, `moedasAtuais`
 * = somas líquidas até agora). Estorno devolve os opostos exatos do que está creditado — não
 * recalcula pelo esforço de hoje, que pode ter mudado. Saldo de moedas pode ficar negativo no
 * estorno (ADR-0006, issue #65): é correção de registro, não punição.
 */
export function efeitoDaConclusao(
  acao: 'complete' | 'uncomplete',
  item: ItemPontuavel | null,
  xpAtual: LancamentoDeXp[],
  moedasAtuais: number,
): EfeitoDaConclusao {
  const liquido = somarPorAtributo(xpAtual);
  const creditado = liquido.some((l) => l.points !== 0);
  if (acao === 'complete') {
    if (creditado) return { tipo: 'nada', motivo: 'já concluído' };
    if (!item) return { tipo: 'nada', motivo: 'item não encontrado' };
    if (item.effort === null || item.primaryAttribute === null) {
      return { tipo: 'nada', motivo: 'compromisso sem esforço não é concluível' };
    }
    return {
      tipo: 'creditar',
      xp: lancamentosDeXp(item.effort, item.primaryAttribute, item.secondaryAttribute),
      moedas: moedasDaConclusao(item.effort),
    };
  }
  if (!creditado) return { tipo: 'nada', motivo: 'não estava concluído' };
  return {
    tipo: 'estornar',
    xp: liquido
      .filter((l) => l.points !== 0)
      .map((l) => ({ attribute: l.attribute, points: -l.points })),
    moedas: -moedasAtuais,
  };
}

export function somarPorAtributo(l: LancamentoDeXp[]): LancamentoDeXp[] {
  const mapa = new Map<Atributo, number>();
  for (const x of l) mapa.set(x.attribute, (mapa.get(x.attribute) ?? 0) + x.points);
  return [...mapa].map(([attribute, points]) => ({ attribute, points }));
}

/** Chave do alvo de uma conclusão: o item, ou a ocorrência da série. */
export function alvoDaConclusao(c: { itemId: string; occurrenceDate: string | null }): string {
  return `${c.itemId}@${c.occurrenceDate ?? 'unico'}`;
}
