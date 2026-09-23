import { NOMES_ATRIBUTOS, type EfeitoDaConclusao } from '@compasso/core';
import { moedas } from './texto';

/** "+3,5 Mente · +1,5 Ofício · +5 moedas" — décimos divididos por 10 só na exibição (§4.3). */
export function descreverEfeito(e: EfeitoDaConclusao): string {
  if (e.tipo === 'nada') return e.motivo;
  const pontos = (d: number) => (d / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const sinal = (n: number) => (n > 0 ? '+' : '');
  const xp = e.xp.map(
    (x) => `${sinal(x.points)}${pontos(x.points)} ${NOMES_ATRIBUTOS[x.attribute]}`,
  );
  return [...xp, `${sinal(e.moedas)}${moedas(e.moedas)}`].join(' · ');
}
