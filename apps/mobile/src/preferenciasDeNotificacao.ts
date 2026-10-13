import { REGEX_HORA } from '@compasso/core';
import { metadados } from '@compasso/core/local';
import { like } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { db } from './db';
import { gravarPreferencia, lerPreferencia } from './preferencias';

/**
 * Lembrete de aula e resumo da manhã (especificação §6.2). São preferências DESTE aparelho, como o
 * limiar de dia cheio: a notificação é local, e o celular que avisa da aula não precisa ser o
 * mesmo tablet que fica em casa. Os dois nascem desligados.
 */
export interface PreferenciasDeNotificacao {
  /** Minutos antes de cada aula; null = sem lembrete de aula. */
  aulaMinutos: number | null;
  /** Disciplinas (`courseId`) que não avisam, com o lembrete de aula ligado. */
  silenciadas: string[];
  /** `HH:mm` do resumo da manhã; null = desligado. */
  resumoHora: string | null;
}

const CHAVES = {
  aulaMinutos: 'notificacoes.aula',
  silenciadas: 'notificacoes.aulasSilenciadas',
  resumoHora: 'notificacoes.resumo',
} as const;

function interpretar(
  valor: (chave: string) => string | null | undefined,
): PreferenciasDeNotificacao {
  const minutos = Number(valor(CHAVES.aulaMinutos) ?? NaN);
  const hora = valor(CHAVES.resumoHora) ?? '';
  let silenciadas: string[] = [];
  try {
    const lista: unknown = JSON.parse(valor(CHAVES.silenciadas) ?? '[]');
    if (Array.isArray(lista)) silenciadas = lista.filter((x) => typeof x === 'string');
  } catch {
    // Valor corrompido: ninguém silenciado.
  }
  return {
    aulaMinutos: Number.isInteger(minutos) && minutos >= 0 ? minutos : null,
    silenciadas,
    resumoHora: REGEX_HORA.test(hora) ? hora : null,
  };
}

export function lerPreferenciasDeNotificacao(): PreferenciasDeNotificacao {
  return interpretar(lerPreferencia);
}

export function gravarLembreteDeAula(minutos: number | null): void {
  gravarPreferencia(CHAVES.aulaMinutos, minutos === null ? 'off' : String(minutos));
}

export function gravarDisciplinaSilenciada(courseId: string, silenciada: boolean): void {
  const atuais = new Set(lerPreferenciasDeNotificacao().silenciadas);
  if (silenciada) atuais.add(courseId);
  else atuais.delete(courseId);
  gravarPreferencia(CHAVES.silenciadas, JSON.stringify([...atuais]));
}

export function gravarResumoDaManha(hora: string | null): void {
  gravarPreferencia(CHAVES.resumoHora, hora ?? 'off');
}

/** As preferências, observadas: a tela de configurações reflete o toque na hora. */
export function usePreferenciasDeNotificacao(): PreferenciasDeNotificacao {
  const { data } = useLiveQuery(
    db.select().from(metadados).where(like(metadados.chave, 'ui.notificacoes.%')),
  );
  return useMemo(
    () => interpretar((chave) => data.find((l) => l.chave === `ui.${chave}`)?.valor),
    [data],
  );
}
