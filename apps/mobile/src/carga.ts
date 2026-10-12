import {
  aulasDoDia,
  cargaDoDia,
  diaPesado,
  intervaloDosDias,
  LIMIAR_DE_CARGA_PADRAO,
  rotuloDaCarga,
  type Carga,
  type Dia,
  type LimiarDeCarga,
} from '@compasso/core';
import { metadados } from '@compasso/core/local';
import { like } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { db } from './db';
import { gravarPreferencia, lerPreferencia } from './preferencias';
import { repositorio } from './sync';

/**
 * Limiar de "dia cheio" (especificação §7): preferência deste aparelho, como a visão do
 * calendário. Sem valor gravado vale o padrão; `off` desliga a medida.
 */
const CHAVES = { esforco: 'carga.esforco', horas: 'carga.horas' } as const;

function interpretar(valor: string | null | undefined, padrao: number | null): number | null {
  if (valor === null || valor === undefined) return padrao;
  if (valor === 'off') return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export function lerLimiarDeCarga(): LimiarDeCarga {
  return {
    esforco: interpretar(lerPreferencia(CHAVES.esforco), LIMIAR_DE_CARGA_PADRAO.esforco),
    horas: interpretar(lerPreferencia(CHAVES.horas), LIMIAR_DE_CARGA_PADRAO.horas),
  };
}

export function gravarLimiarDeCarga(medida: keyof LimiarDeCarga, valor: number | null): void {
  gravarPreferencia(CHAVES[medida], valor === null ? 'off' : String(valor));
}

/** O limiar, observado: mudar nas configurações redesenha o calendário e a aba Hoje. */
export function useLimiarDeCarga(): LimiarDeCarga {
  const { data } = useLiveQuery(
    db.select().from(metadados).where(like(metadados.chave, 'ui.carga.%')),
  );
  const valor = (chave: string) => data.find((l) => l.chave === `ui.${chave}`)?.valor;
  const esforco = interpretar(valor(CHAVES.esforco), LIMIAR_DE_CARGA_PADRAO.esforco);
  const horas = interpretar(valor(CHAVES.horas), LIMIAR_DE_CARGA_PADRAO.horas);
  return useMemo(() => ({ esforco, horas }), [esforco, horas]);
}

/** Carga do dia lida direto do SQLite, sem contar o item `exceto` (o que está sendo editado). */
export function cargaAtualDoDia(dia: Dia, exceto?: string): Carga {
  const { de, ate } = intervaloDosDias(dia, dia);
  const entradas = repositorio.agenda(de, ate).filter((e) => e.itemId !== exceto);
  return cargaDoDia(dia, entradas, aulasDoDia(repositorio.grade(), dia));
}

/**
 * Texto do aviso ao pôr algo num dia que já está cheio, ou null. Só informa: quem chama nunca
 * impede a ação por causa dele.
 */
export function avisoDeDiaCheio(
  dia: Dia,
  exceto?: string,
  limiar: LimiarDeCarga = lerLimiarDeCarga(),
): string | null {
  const carga = cargaAtualDoDia(dia, exceto);
  return diaPesado(carga, limiar) ? `dia já cheio: ${rotuloDaCarga(carga)}` : null;
}
