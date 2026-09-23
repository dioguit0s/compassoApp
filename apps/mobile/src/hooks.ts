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
import { repositorio } from './sync';

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
