import type { DisciplinaLocal } from '@compasso/core/local';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { repositorio } from './sync';

/**
 * Disciplinas por id, para o selo de prova/trabalho (issue #62). Uma consulta só, no topo do
 * app — e não uma por item desenhado.
 */
const Contexto = createContext<Map<string, DisciplinaLocal>>(new Map());

export function ProvedorDeDisciplinas({ children }: { children: ReactNode }) {
  const { data } = useLiveQuery(repositorio.consultasDaGrade().disciplinas);
  const mapa = useMemo(() => new Map(data.map((d) => [d.id, d])), [data]);
  return <Contexto.Provider value={mapa}>{children}</Contexto.Provider>;
}

export function useDisciplina(id: string | null): DisciplinaLocal | null {
  const mapa = useContext(Contexto);
  return id ? (mapa.get(id) ?? null) : null;
}
