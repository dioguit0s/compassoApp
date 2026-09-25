import {
  diaDaSemana,
  inicioDoDia,
  instanteDeParede,
  partesDoDia,
  somarDias,
  type Dia,
} from '@compasso/core';
import type { Repositorios } from '../db/repositorios';
import { itemNovo } from './rotas';

/**
 * Dados de exemplo da integração com a Luna (ADR-0012), relativos a `hoje`: um evento
 * recorrente, um com horário, um de dia inteiro, uma aula da grade, uma prova e tarefas com e sem
 * prazo. Usado pelo script `luna:exemplo` e pelos testes da /api/v1.
 */
export async function semearExemplo(r: Repositorios, hoje: Dia) {
  const amanha = somarDias(hoje, 1);
  const as = (dia: Dia, hora: number, minuto = 0) => {
    const p = partesDoDia(dia);
    return instanteDeParede(p.ano, p.mes, p.dia, hora, minuto).toISOString();
  };
  const agora = new Date();
  const criar = async (campos: Parameters<typeof itemNovo>[2]) =>
    (await r.itens.criarPelaApi(itemNovo(agora, null, campos))).linha;

  const semestre = (await r.grade.criar('semestres', {
    label: 'Exemplo',
    startDate: somarDias(hoje, -30),
    endDate: somarDias(hoje, 90),
    active: true,
  })) as { id: string };
  const calculo = (await r.grade.criar('disciplinas', {
    semesterId: semestre.id,
    name: 'Cálculo II',
    code: 'MAT0122',
    professor: 'Marcos Lima',
    color: '#8A5A2B',
    defaultRoom: 'B-204',
    notes: null,
  })) as { id: string };
  const horario = (await r.grade.criar('horarios', {
    courseId: calculo.id,
    weekday: diaDaSemana(amanha),
    startTime: '08:00',
    endTime: '10:00',
    room: null,
  })) as { id: string };

  const treino = await criar({
    title: 'Treino na academia',
    kind: 'event',
    startAt: as(somarDias(hoje, -7), 7),
    endAt: as(somarDias(hoje, -7), 8),
    rrule: 'FREQ=DAILY',
  });
  const dentista = await criar({
    title: 'Dentista',
    kind: 'event',
    startAt: as(amanha, 14),
    endAt: as(amanha, 15),
  });
  const aniversario = await criar({
    title: 'Aniversário da Ana',
    kind: 'event',
    allDay: true,
    startAt: inicioDoDia(amanha).toISOString(),
    endAt: inicioDoDia(somarDias(amanha, 1)).toISOString(),
  });
  const prova = await criar({
    title: 'Prova de Cálculo II',
    kind: 'event',
    startAt: as(somarDias(hoje, 14), 8),
    endAt: as(somarDias(hoje, 14), 10),
    courseId: calculo.id,
  });
  const relatorio = await criar({
    title: 'Entregar relatório de física',
    kind: 'task',
    effort: 3,
    primaryAttribute: 'mente',
    dueAt: as(amanha, 23, 59),
  });
  const lista = await criar({
    title: 'Lista 3 de cálculo',
    kind: 'task',
    effort: 5,
    primaryAttribute: 'mente',
    allDay: true,
    dueAt: inicioDoDia(somarDias(hoje, 2)).toISOString(),
  });
  const racao = await criar({
    title: 'Comprar ração do gato',
    kind: 'task',
    effort: 1,
    primaryAttribute: 'casa',
  });

  return {
    horario: horario.id,
    treino: treino.id,
    dentista: dentista.id,
    aniversario: aniversario.id,
    prova: prova.id,
    relatorio: relatorio.id,
    lista: lista.id,
    racao: racao.id,
  };
}
