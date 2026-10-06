import {
  aulasDoDia,
  diaDe,
  diasDaSemana,
  FUSO_PADRAO,
  intervaloDosDias,
  projetarAgenda,
  resumirSemana,
  type Dia,
  type DiaResumido,
} from '@compasso/core';
import type { EntradaDoApp } from '../hooks';
import { repositorio } from '../sync';

export interface SemanaDoWidget {
  hoje: Dia;
  dias: DiaResumido<EntradaDoApp>[];
}

/**
 * A semana corrente lida direto do SQLite, fora do React: o widget é desenhado por uma tarefa
 * headless, sem telas montadas. Mesmas consultas e projeção de `useAgenda` e `useAulas`.
 */
export function carregarSemana(agora: Date, limite: number): SemanaDoWidget {
  const hoje = diaDe(agora, FUSO_PADRAO);
  const dias = diasDaSemana(hoje);
  const { de, ate } = intervaloDosDias(dias[0]!, dias[6]!);
  const itens = repositorio.consultaItensDaAgenda(de, ate).all();
  const atributos = new Map(itens.map((i) => [i.id, i.primaryAttribute]));
  const entradas = projetarAgenda(itens, repositorio.consultaDesvios().all(), de, ate).map((e) => ({
    ...e,
    atributo: atributos.get(e.itemId) ?? null,
  }));
  const grade = repositorio.grade();
  return { hoje, dias: resumirSemana(hoje, entradas, (d) => aulasDoDia(grade, d), limite) };
}
