/**
 * Economia (especificação §4.6, ADR-0007). Regras puras, usadas igual no app (para mostrar) e na
 * API (para validar o resgate com o relógio do servidor).
 */
import { z } from 'zod';
import {
  diaDaSemana,
  diaDe,
  diferencaEmDias,
  FUSO_PADRAO,
  somarDias,
  type Dia,
} from './calendario';

const dataIso = z.iso.datetime({ offset: true });
const dia = z.iso.date();

export const esquemaRecompensa = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    /** Preço vigente (em moedas) a partir de `priceEffectiveFrom`. */
    price: z.number().int().min(1).max(1_000_000),
    cooldownDays: z.number().int().min(0).max(3650),
    priceEffectiveFrom: dia,
    pendingPrice: z.number().int().min(1).max(1_000_000).nullable(),
    pendingFrom: dia.nullable(),
    active: z.boolean(),
    deletedAt: dataIso.nullable(),
    createdAt: dataIso,
    updatedAt: dataIso,
  })
  .refine(
    (r) => (r.pendingPrice === null) === (r.pendingFrom === null),
    'preço pendente exige data, e vice-versa',
  );
export type RecompensaWire = z.infer<typeof esquemaRecompensa>;

export interface ResgateWire {
  id: string;
  rewardId: string;
  /** Preço pago na época — nunca recalculado (§5). */
  pricePaid: number;
  redeemedAt: string;
}

/**
 * Segunda-feira SEGUINTE a `d` (ADR-0007): de domingo, amanhã; de segunda, a da outra semana —
 * "seguinte" nunca é hoje. É o primeiro dia em que um preço criado ou alterado em `d` vale.
 */
export function proximaSegunda(d: Dia): Dia {
  const semana = diaDaSemana(d); // 0 = domingo, 1 = segunda
  const ate = (8 - semana) % 7 || 7;
  return somarDias(d, ate);
}

type Precos = Pick<RecompensaWire, 'price' | 'priceEffectiveFrom' | 'pendingPrice' | 'pendingFrom'>;

/** Preço vigente em `d`; null se a recompensa ainda está na carência da criação. */
export function precoVigente(r: Precos, d: Dia): number | null {
  if (d < r.priceEffectiveFrom) return null;
  if (r.pendingPrice !== null && r.pendingFrom !== null && d >= r.pendingFrom)
    return r.pendingPrice;
  return r.price;
}

/** Recompensa nova criada em `hoje`: só vale a partir da próxima segunda (carência §4.6). */
export function precosDaNova(preco: number, hoje: Dia): Precos {
  return {
    price: preco,
    priceEffectiveFrom: proximaSegunda(hoje),
    pendingPrice: null,
    pendingFrom: null,
  };
}

/**
 * Alterar o preço em `hoje` (para mais OU para menos — a regra diz "alterar"): o novo preço fica
 * pendente até a próxima segunda; até lá vale o anterior. Um pendente que já venceu é promovido
 * antes. Duas alterações na mesma semana: vale a última, na mesma segunda.
 */
export function alterarPreco(r: Precos, novo: number, hoje: Dia): Precos {
  const base = promover(r, hoje);
  if (novo === base.price && base.pendingPrice === null) return base;
  return { ...base, pendingPrice: novo, pendingFrom: proximaSegunda(hoje) };
}

/** Se o preço pendente já começou a valer, ele vira o preço vigente. */
export function promover(r: Precos, hoje: Dia): Precos {
  if (r.pendingPrice !== null && r.pendingFrom !== null && hoje >= r.pendingFrom) {
    return {
      price: r.pendingPrice,
      priceEffectiveFrom: r.pendingFrom,
      pendingPrice: null,
      pendingFrom: null,
    };
  }
  return { ...r };
}

/**
 * Proteção do servidor contra datas de carência antecipadas (ADR-0007): o que chega pelo sync é
 * normalizado contra a versão que o servidor já tem e contra o relógio DELE. Um preço vigente só
 * muda por promoção de um pendente que já venceu; qualquer outra mudança vira pendente para a
 * próxima segunda; e nenhuma data de vigência fica antes da próxima segunda de `hoje`.
 */
export function normalizarPrecos(servidor: Precos | null, recebido: Precos, hoje: Dia): Precos {
  const minimo = proximaSegunda(hoje);
  if (!servidor) {
    const inicio = recebido.priceEffectiveFrom < minimo ? minimo : recebido.priceEffectiveFrom;
    return {
      price: recebido.price,
      priceEffectiveFrom: inicio,
      pendingPrice: null,
      pendingFrom: null,
    };
  }
  const atual = promover(servidor, hoje);
  const desejado = recebido.pendingPrice ?? recebido.price;
  const vigenteRecebido = precoVigente(recebido, hoje);
  if (vigenteRecebido === atual.price && recebido.pendingPrice === atual.pendingPrice) return atual;
  if (desejado === atual.price) return { ...atual, pendingPrice: null, pendingFrom: null };
  const data =
    recebido.pendingFrom && recebido.pendingFrom >= minimo && recebido.pendingPrice === desejado
      ? recebido.pendingFrom
      : minimo;
  return { ...atual, pendingPrice: desejado, pendingFrom: data };
}

export type EstadoDaRecompensa =
  | { tipo: 'disponivel'; preco: number }
  | { tipo: 'carencia'; disponivelEm: Dia }
  | { tipo: 'sem-saldo'; preco: number; faltam: number }
  | { tipo: 'cooldown'; preco: number; disponivelEm: Dia }
  | { tipo: 'arquivada' };

/**
 * Pode resgatar agora? A ordem das checagens é a da explicação ao usuário: arquivada, carência,
 * cooldown (independente de saldo, §4.6) e por fim saldo. Saldo negativo nunca resgata.
 */
export function estadoDaRecompensa(
  r: Precos & { active: boolean; cooldownDays: number; deletedAt?: unknown },
  saldo: number,
  ultimoResgate: Date | null,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): EstadoDaRecompensa {
  if (!r.active || r.deletedAt) return { tipo: 'arquivada' };
  const hoje = diaDe(agora, fuso);
  const preco = precoVigente(r, hoje);
  if (preco === null) return { tipo: 'carencia', disponivelEm: r.priceEffectiveFrom };
  if (ultimoResgate && r.cooldownDays > 0) {
    const liberaEm = somarDias(diaDe(ultimoResgate, fuso), r.cooldownDays);
    if (hoje < liberaEm) return { tipo: 'cooldown', preco, disponivelEm: liberaEm };
  }
  if (saldo < preco)
    return {
      tipo: 'sem-saldo',
      preco,
      faltam: preco - Math.max(0, saldo) + Math.min(0, saldo) * -1,
    };
  return { tipo: 'disponivel', preco };
}

export function diasAte(de: Dia, ate: Dia): number {
  return diferencaEmDias(de, ate);
}
