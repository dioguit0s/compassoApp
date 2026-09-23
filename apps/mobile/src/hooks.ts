import { diaDe, FUSO_PADRAO, type Dia } from '@compasso/core';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
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

/** Itens em `[de, ate)`, lidos do SQLite e re-renderizados quando a tabela muda. */
export function useItensNoIntervalo(de: Date, ate: Date) {
  const { data } = useLiveQuery(repositorio.consultaNoIntervalo(de, ate), [
    de.getTime(),
    ate.getTime(),
  ]);
  return data;
}
