import { describe, expect, it } from 'vitest';
import {
  aplicarOrcamento,
  corpoDoLembreteDeAula,
  disparoDoResumo,
  instanteDeParede,
  instanteDoDisparo,
  listarDisparos,
  listarDisparosDeAulas,
  ORCAMENTO_NOTIFICACOES,
  planejarReagendamento,
  projetarAgenda,
  proximoResumo,
  resumirDia,
  textoDoResumo,
  type Aula,
  type Dia,
  type ItemParaProjecao,
} from '../src';

const sp = (d: number, h = 0, mi = 0) => instanteDeParede(2026, 10, d, h, mi);
const dia = (d: number): Dia => `2026-10-${String(d).padStart(2, '0')}`;
const agora = sp(5, 12);

let seq = 0;
function item(extra: Partial<ItemParaProjecao>): ItemParaProjecao {
  return {
    id: `i${++seq}`,
    title: `item ${seq}`,
    notes: null,
    kind: 'event',
    effort: null,
    allDay: false,
    dueAt: null,
    startAt: sp(6, 9),
    endAt: sp(6, 10),
    status: 'open',
    rrule: null,
    timezone: 'America/Sao_Paulo',
    recurrenceEndsAt: null,
    reminderMinutesBefore: null,
    remindersMinutesBefore: [15],
    courseId: null,
    postponeCount: 0,
    deletedAt: null,
    ...extra,
  };
}
function aula(d: number, inicio: string, extra: Partial<Aula> = {}): Aula {
  return {
    id: `s${inicio}@${dia(d)}`,
    slotId: `s${inicio}`,
    courseId: 'calc',
    dia: dia(d),
    disciplina: 'Cálculo II',
    codigo: null,
    professor: null,
    cor: '#2F4E7A',
    inicio,
    fim: '20:40',
    sala: 'B-204',
    salaTrocada: false,
    cancelada: false,
    extra: false,
    nota: null,
    ...extra,
  };
}

describe('ação Concluir', () => {
  it('só item pontuável é concluível pela notificação', () => {
    const entradas = projetarAgenda(
      [
        item({ id: 'consulta' }),
        item({ id: 'treino', effort: 3 }),
        item({
          id: 'tarefa',
          kind: 'task',
          startAt: null,
          endAt: null,
          dueAt: sp(6, 18),
          effort: 2,
        }),
      ],
      [],
      agora,
      sp(8),
    );
    const d = listarDisparos(entradas, agora);
    expect(Object.fromEntries(d.map((x) => [x.itemId, x.concluivel]))).toEqual({
      consulta: false,
      treino: true,
      tarefa: true,
    });
    expect(d.every((x) => x.tipo === 'item')).toBe(true);
  });

  it('ocorrência de série leva a data: é ela que a notificação conclui', () => {
    const serie = item({ id: 'remedio', rrule: 'FREQ=DAILY;COUNT=2', effort: 1 });
    const d = listarDisparos(projetarAgenda([serie], [], agora, sp(9)), agora);
    expect(d.map((x) => [x.itemId, x.ocorrencia, x.concluivel])).toEqual([
      ['remedio', dia(6), true],
      ['remedio', dia(7), true],
    ]);
  });
});

describe('lembrete de aula', () => {
  it('avisa X minutos antes, com a sala; cancelada, passada e silenciada não avisam', () => {
    const aulas = [
      aula(5, '08:00'), // já passou
      aula(5, '19:00'),
      aula(6, '19:00', { cancelada: true }),
      aula(7, '19:00', { courseId: 'fis', disciplina: 'Física', slotId: 'fis' }),
      aula(8, '19:00'),
    ];
    const d = listarDisparosDeAulas(aulas, agora, {
      minutosAntes: 15,
      silenciadas: new Set(['fis']),
    });
    expect(d.map((x) => [x.dia, x.instante])).toEqual([
      [dia(5), sp(5, 18, 45)],
      [dia(8), sp(8, 18, 45)],
    ]);
    expect(d[0]).toMatchObject({
      tipo: 'aula',
      itemId: null,
      slotId: 's19:00',
      titulo: 'Cálculo II',
      corpo: '19:00–20:40 · sala B-204',
      concluivel: false,
      minutosAntes: 15,
    });
    expect(instanteDoDisparo(d[0]!.id)).toBe(sp(5, 18, 45).getTime());
    expect(d[0]!.id.startsWith(`compasso:aula.s19:00@${dia(5)}@`)).toBe(true);
  });

  it.each([
    [{}, '19:00–20:40 · sala B-204'],
    [{ sala: null }, '19:00–20:40'],
    [{ sala: 'C-301', salaTrocada: true }, 'Sala trocada: C-301 · 19:00–20:40'],
  ])('corpo %o → %s', (extra, corpo) => {
    expect(corpoDoLembreteDeAula(aula(5, '19:00', extra))).toBe(corpo);
  });

  it('trocar a sala muda o id: o aviso antigo é cancelado e o novo agendado', () => {
    const antes = listarDisparosDeAulas([aula(6, '19:00')], agora, { minutosAntes: 10 });
    const depois = listarDisparosDeAulas(
      [aula(6, '19:00', { sala: 'C-301', salaTrocada: true })],
      agora,
      { minutosAntes: 10 },
    );
    expect(depois[0]!.id).not.toBe(antes[0]!.id);
    const plano = planejarReagendamento([antes[0]!.id], depois);
    expect(plano.cancelar).toEqual([antes[0]!.id]);
    expect(plano.agendar).toEqual(depois);
  });

  it('reposição avisa e diz que é reposição', () => {
    const [d] = listarDisparosDeAulas([aula(10, '14:00', { extra: true })], agora, {
      minutosAntes: 30,
    });
    expect(d!.titulo).toBe('Cálculo II (reposição)');
    expect(d!.instante).toEqual(sp(10, 13, 30));
  });
});

describe('resumo da manhã', () => {
  it.each([
    ['07:00', sp(5, 6), dia(5), sp(5, 7)],
    // Já passou hoje: o próximo é o de amanhã.
    ['07:00', sp(5, 7), dia(6), sp(6, 7)],
    ['07:00', sp(5, 23, 59), dia(6), sp(6, 7)],
    ['00:00', sp(5, 0), dia(6), sp(6, 0)],
  ])('proximoResumo(%s) às %s', (hora, quando, d, instante) => {
    expect(proximoResumo(quando, hora)).toEqual({ dia: d, instante });
  });

  it('hora inválida não agenda nada', () => {
    expect(proximoResumo(agora, '7h')).toBeNull();
    expect(disparoDoResumo(agora, '25:00', () => ({ entradas: [], aulas: [] }))).toBeNull();
  });

  it('conta aulas, compromissos e tarefas em aberto, com a carga do dia', () => {
    const entradas = projetarAgenda(
      [
        item({ startAt: sp(6, 9), endAt: sp(6, 11) }),
        item({ startAt: sp(6, 14), endAt: sp(6, 15), effort: 3 }),
        item({ kind: 'task', startAt: null, endAt: null, dueAt: sp(6, 18), effort: 5 }),
        item({
          kind: 'task',
          startAt: null,
          endAt: null,
          dueAt: sp(6, 20),
          effort: 8,
          status: 'done',
        }),
        item({ startAt: sp(7, 9), endAt: sp(7, 10) }),
      ],
      [],
      sp(6),
      sp(8),
    );
    const aulas = [aula(6, '19:00'), aula(6, '20:50', { cancelada: true, fim: '22:30' })];
    const r = resumirDia(dia(6), entradas, aulas);
    expect(r).toEqual({
      aulas: 1,
      compromissos: 2,
      tarefas: 1,
      carga: { esforco: 8, minutosOcupados: 280 },
    });
    expect(textoDoResumo(r)).toBe('1 aula, 2 compromissos, 1 tarefa · esforço 8 · 4 h 40 ocupadas');
  });

  it.each([
    [
      { aulas: 3, compromissos: 2, tarefas: 0, esforco: 8, min: 0 },
      '3 aulas, 2 compromissos · esforço 8',
    ],
    [{ aulas: 0, compromissos: 1, tarefas: 0, esforco: 0, min: 0 }, '1 compromisso'],
    [{ aulas: 0, compromissos: 0, tarefas: 0, esforco: 0, min: 0 }, null],
  ])('textoDoResumo(%o) = %s', (r, texto) => {
    expect(
      textoDoResumo({
        aulas: r.aulas,
        compromissos: r.compromissos,
        tarefas: r.tarefas,
        carga: { esforco: r.esforco, minutosOcupados: r.min },
      }),
    ).toBe(texto);
  });

  it('o disparo fala do dia em que toca; dia sem nada não gera resumo', () => {
    const doDia = (d: Dia) => ({ entradas: [], aulas: d === dia(6) ? [aula(6, '19:00')] : [] });
    // 12:00 do dia 5: o próximo 07:00 é o do dia 6.
    const r = disparoDoResumo(agora, '07:00', doDia)!;
    expect(r).toMatchObject({
      tipo: 'resumo',
      dia: dia(6),
      instante: sp(6, 7),
      titulo: 'Hoje',
      corpo: '1 aula · 1 h 40 ocupadas',
      concluivel: false,
    });
    expect(instanteDoDisparo(r.id)).toBe(sp(6, 7).getTime());
    // Antes das 07:00 do dia 5, o próximo resumo é o do próprio dia 5, que está vazio.
    expect(disparoDoResumo(sp(5, 6), '07:00', doDia)).toBeNull();
  });

  it('mudar o dia muda o texto e o id: o resumo agendado é refeito', () => {
    const com = (n: number) => (d: Dia) => ({
      entradas: [],
      aulas: Array.from({ length: n }, (_, i) => aula(6, `1${i}:00`, { dia: d })),
    });
    const um = disparoDoResumo(agora, '07:00', com(1))!;
    const dois = disparoDoResumo(agora, '07:00', com(2))!;
    expect(dois.id).not.toBe(um.id);
  });
});

describe('orçamento compartilhado', () => {
  const serie = item({
    id: 'remedio',
    rrule: 'FREQ=DAILY',
    startAt: sp(6, 8),
    endAt: null,
    remindersMinutesBefore: [10, 60],
  });
  const itens = listarDisparos(projetarAgenda([serie], [], agora, sp(31)), agora);
  const aulas = listarDisparosDeAulas(
    Array.from({ length: 20 }, (_, i) => aula(6 + i, '19:00')),
    agora,
    { minutosAntes: 15 },
  );
  const resumoDaManha = disparoDoResumo(agora, '07:00', () => ({
    entradas: [],
    aulas: [aula(6, '19:00')],
  }))!;

  it('sem estourar: tudo entra e nada é descartado', () => {
    const plano = aplicarOrcamento([...itens.slice(0, 5), ...aulas.slice(0, 5)], resumoDaManha);
    expect(plano.selecao).toHaveLength(11);
    expect(plano.descartados).toEqual([]);
    // Em ordem de disparo, com o resumo no lugar dele (07:00 do dia 6, junto do lembrete de 1 h).
    const instantes = plano.selecao.map((d) => d.instante.getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
  });

  it('item e aula disputam por proximidade, sem cota para nenhum dos dois', () => {
    expect(itens.length + aulas.length).toBeGreaterThan(ORCAMENTO_NOTIFICACOES);
    const plano = aplicarOrcamento([...itens, ...aulas]);
    expect(plano.selecao).toHaveLength(ORCAMENTO_NOTIFICACOES);
    expect(plano.selecao.length + plano.descartados.length).toBe(itens.length + aulas.length);
    // Tudo o que entrou dispara antes de tudo o que ficou de fora.
    const ultimo = plano.selecao.at(-1)!.instante.getTime();
    expect(plano.descartados.every((d) => d.instante.getTime() >= ultimo)).toBe(true);
    // 3 disparos por dia (2 do remédio, 1 da aula): 20 dias inteiros.
    expect(plano.selecao.filter((d) => d.tipo === 'aula')).toHaveLength(20);
    expect(plano.selecao.filter((d) => d.tipo === 'item')).toHaveLength(40);
    // O primeiro descartado é o que o diagnóstico mostra: o próximo a entrar.
    expect(plano.descartados[0]).toMatchObject({ itemId: 'remedio', instante: sp(26, 7) });
  });

  it('o resumo da manhã ocupa uma vaga fixa, mesmo sendo o mais distante', () => {
    const longe = { ...resumoDaManha, instante: sp(30, 7) };
    const plano = aplicarOrcamento([...itens, ...aulas], longe);
    expect(plano.selecao).toHaveLength(ORCAMENTO_NOTIFICACOES);
    expect(plano.selecao.filter((d) => d.tipo === 'resumo')).toHaveLength(1);
    expect(plano.selecao.filter((d) => d.tipo !== 'resumo')).toHaveLength(
      ORCAMENTO_NOTIFICACOES - 1,
    );
    // A vaga dele saiu do fim da fila: um descartado a mais que sem resumo.
    expect(plano.descartados).toHaveLength(
      aplicarOrcamento([...itens, ...aulas]).descartados.length + 1,
    );
    expect(plano.descartados.every((d) => d.tipo !== 'resumo')).toBe(true);
  });

  it('orçamento pequeno ou zero', () => {
    expect(aplicarOrcamento(itens, resumoDaManha, 1).selecao).toEqual([resumoDaManha]);
    expect(aplicarOrcamento(itens, resumoDaManha, 0)).toEqual({
      selecao: [],
      descartados: itens,
    });
    expect(aplicarOrcamento(itens, null, 2).selecao).toEqual(itens.slice(0, 2));
  });
});
