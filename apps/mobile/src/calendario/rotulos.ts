import { diasDaSemana, formatarDiaCurto, partesDoDia, type Dia } from '@compasso/core';

/** "20/09 – 26/09" da semana que contém o dia. */
export function formatarDiaCurtoIntervalo(referencia: Dia): string {
  const dias = diasDaSemana(referencia);
  const ano = partesDoDia(referencia).ano;
  return `${formatarDiaCurto(dias[0]!, ano)} – ${formatarDiaCurto(dias[6]!, ano)}`;
}
