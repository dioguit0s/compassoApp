/**
 * Resumo da semana corrente para o widget de home screen (ADR-0015): 7 colunas de domingo a
 * sábado, cada uma com os primeiros itens do dia — entradas da agenda e aulas da grade na mesma
 * ordem da visão de semana — e quantos sobraram. Puro: quem chama traz a agenda já projetada
 * (`projetarAgenda`) e as aulas (`aulasDoDia`), e resolve cores e estados.
 */
import { agruparPorDia, recortarDia, vaiParaFaixaDoDia, type ItemDeAgenda } from './agenda';
import { diasDaSemana, FUSO_PADRAO, minutosDoDia, type Dia } from './calendario';
import { minutosDeHora, type Aula } from './grade';

export type ItemDaSemana<T> = { tipo: 'agenda'; entrada: T } | { tipo: 'aula'; aula: Aula };

export interface DiaResumido<T> {
  dia: Dia;
  ehHoje: boolean;
  itens: ItemDaSemana<T>[];
  excedentes: number;
}

/**
 * Posição do item no dia: faixa (dia inteiro, vários dias, tarefa) antes de tudo, depois pelo
 * minuto de início. Aula cancelada não entra — no widget o espaço é pouco.
 */
function chave<T extends ItemDeAgenda>(item: ItemDaSemana<T>, fuso: string): number {
  if (item.tipo === 'aula') return minutosDeHora(item.aula.inicio);
  const e = item.entrada;
  if (vaiParaFaixaDoDia(e, fuso) || e.startAt === null) return -1;
  return minutosDoDia(e.startAt, fuso);
}

export function resumirSemana<T extends ItemDeAgenda>(
  hoje: Dia,
  entradas: T[],
  aulas: (dia: Dia) => Aula[],
  limite = 3,
  fuso: string = FUSO_PADRAO,
): DiaResumido<T>[] {
  const dias = diasDaSemana(hoje);
  const porDia = agruparPorDia(entradas, dias, fuso);
  return dias.map((dia) => {
    const daAgenda = (porDia.get(dia) ?? []).map(
      (entrada) => ({ tipo: 'agenda', entrada }) as const,
    );
    const daGrade = aulas(dia)
      .filter((a) => !a.cancelada)
      .map((aula) => ({ tipo: 'aula', aula }) as const);
    // Ordenação estável: no empate fica a ordem de `compararNoDia` e a aula vem depois.
    const itens: ItemDaSemana<T>[] = [...daAgenda, ...daGrade].sort(
      (a, b) => chave(a, fuso) - chave(b, fuso),
    );
    const { visiveis, excedentes } = recortarDia(itens, limite);
    return { dia, ehHoje: dia === hoje, itens: visiveis, excedentes };
  });
}
