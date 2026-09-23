import {
  aulasDoDia,
  diaDe,
  FUSO_PADRAO,
  projetarAgenda,
  type Aula,
  type Dia,
  type EntradaAgenda,
} from '@compasso/core';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { coinEntries, completions, xpEntries } from '@compasso/core/local';
import { db } from './db';
import { observarSync, repositorio, type EstadoSync } from './sync';

/**
 * Dia civil de hoje em São Paulo (ADR-0003). Reavalia a cada minuto e quando o app volta ao
 * primeiro plano, para a virada da meia-noite com o app aberto atualizar as telas.
 */
export function useHoje(): Dia {
  const [hoje, setHoje] = useState(() => diaDe(new Date(), FUSO_PADRAO));
  useEffect(() => {
    const atualizar = () => setHoje(diaDe(new Date(), FUSO_PADRAO));
    const timer = setInterval(atualizar, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && atualizar());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return hoje;
}

/**
 * Agenda de `[de, ate)` projetada do SQLite com a MESMA função da API (`projetarAgenda`): itens
 * simples, séries expandidas e desvios de ocorrência. Re-renderiza quando as tabelas mudam.
 */
export function useAgenda(de: Date, ate: Date): EntradaAgenda[] {
  const { data: itens } = useLiveQuery(repositorio.consultaItensDaAgenda(de, ate), [
    de.getTime(),
    ate.getTime(),
  ]);
  const { data: desvios } = useLiveQuery(repositorio.consultaDesvios());
  return useMemo(() => projetarAgenda(itens, desvios, de, ate), [itens, desvios, de, ate]);
}

/** A grade acadêmica do SQLite, observada. */
export function useGrade() {
  const q = repositorio.consultasDaGrade();
  const { data: semestres } = useLiveQuery(q.semestres);
  const { data: disciplinas } = useLiveQuery(q.disciplinas);
  const { data: horarios } = useLiveQuery(q.horarios);
  const { data: excecoes } = useLiveQuery(q.excecoes);
  return useMemo(
    () => ({ semestres, disciplinas, horarios, excecoes }),
    [semestres, disciplinas, horarios, excecoes],
  );
}

/** Aulas projetadas (nunca gravadas) de cada dia pedido — a mesma função de `GET /agenda`. */
export function useAulas(dias: Dia[]): Map<Dia, Aula[]> {
  const grade = useGrade();
  return useMemo(() => new Map(dias.map((d) => [d, aulasDoDia(grade, d)])), [grade, dias]);
}

/**
 * Radar e saldo do aparelho: ledger que o servidor gerou + efeito dos eventos locais ainda não
 * sincronizados. Recalcula quando o ledger ou os eventos mudam.
 */
export function useProgresso() {
  const { data: xp } = useLiveQuery(db.select({ id: xpEntries.id }).from(xpEntries));
  const { data: eventos } = useLiveQuery(
    db.select({ id: completions.id, dirty: completions.dirty }).from(completions),
  );
  const { data: moedas } = useLiveQuery(db.select({ id: coinEntries.id }).from(coinEntries));
  return useMemo(
    () => ({
      radar: repositorio.radar(),
      saldo: repositorio.saldo(),
      temLancamentos: xp.length > 0 || eventos.some((e) => e.dirty),
    }),
    // As consultas só servem de gatilho: o cálculo lê o repositório.
    [xp, eventos, moedas],
  );
}

/** Estado da última sincronização (`null` = sincronizando agora; `undefined` = nenhuma ainda). */
export function useEstadoSync(): EstadoSync | null | undefined {
  const [e, setE] = useState<EstadoSync | null | undefined>(undefined);
  useEffect(() => observarSync(setE), []);
  return e;
}
