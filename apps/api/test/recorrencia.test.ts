/**
 * F3 — recorrência: desvios de ocorrência no banco e no sync (#39), rotas de ocorrência (#40),
 * GET /agenda (#41), paridade da projeção client × API (#42) e divisão de série (#44).
 */
import { linhasVazias } from '@compasso/core';
import {
  entradaParaJson,
  instanteDeParede,
  intervaloDosDias,
  type EntradaAgendaJson,
} from '@compasso/core';
import type { DadosItem } from '@compasso/core/local';
import { describe, expect, it } from 'vitest';
import { comToken } from './ajuda';
import { novoEvento, usarClientes, type Cliente } from './clientes';

const { ctx, doisAparelhos } = usarClientes();
const sp = (m: number, d: number, h = 0, mi = 0, a = 2026) => instanteDeParede(a, m, d, h, mi);
const HORA = 3_600_000;

function serie(
  titulo: string,
  rrule: string,
  inicio: Date,
  duracaoMs = HORA,
  extra: Partial<DadosItem> = {},
): DadosItem {
  return {
    ...novoEvento(titulo),
    startAt: inicio,
    endAt: duracaoMs ? new Date(inicio.getTime() + duracaoMs) : null,
    rrule,
    ...extra,
  };
}

async function sincronizar(...cs: Cliente[]) {
  for (const c of cs) {
    c.online = true;
    await c.motor.sincronizar();
  }
}

async function agendaApi(token: string, de: Date, ate: Date) {
  const r = await ctx.env.app.request(
    `/agenda?from=${de.toISOString()}&to=${ate.toISOString()}`,
    comToken(token),
  );
  expect(r.status).toBe(200);
  return ((await r.json()) as { entradas: EntradaAgendaJson[] }).entradas;
}

async function rota(token: string, metodo: 'POST' | 'PATCH', caminho: string, corpo?: unknown) {
  const r = await ctx.env.app.request(
    caminho,
    comToken(token, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined }),
  );
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

describe('item_occurrences no banco (#39)', () => {
  it('duas linhas para a mesma data do mesmo item são recusadas', async () => {
    const { a, userId } = await doisAparelhos('Único');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a);
    const ins = (id: string) =>
      ctx.dono.query(
        `insert into item_occurrences (id, user_id, item_id, occurrence_date, type, created_at, updated_at)
         values ($1, $2, $3, '2026-09-08', 'cancelled', now(), now())`,
        [id, userId, s.id],
      );
    await ins('01900000-0000-7000-8000-000000000001');
    await expect(ins('01900000-0000-7000-8000-000000000002')).rejects.toThrow(
      /item_occurrences_item_data_idx/,
    );
  });

  it('desvio não pode apontar para item de outra conta (FK composta)', async () => {
    const a = await doisAparelhos('FK A');
    const b = await ctx.env.admin.criarConta('FK B');
    const s = a.a.repo.criar(serie('x', 'FREQ=DAILY', sp(9, 1, 8)));
    await sincronizar(a.a);
    await expect(
      ctx.dono.query(
        `insert into item_occurrences (id, user_id, item_id, occurrence_date, type, created_at, updated_at)
         values ('01900000-0000-7000-8000-00000000000a', $1, $2, '2026-09-02', 'cancelled', now(), now())`,
        [b.userId, s.id],
      ),
    ).rejects.toThrow(/item_occurrences_item_fk/);
  });

  it('desvio criado offline sincroniza e aparece no outro aparelho', async () => {
    const { a, b } = await doisAparelhos('Desvio offline');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a, b);
    a.online = false;
    a.tempo(1000);
    a.repo.cancelarOcorrencia(s.id, '2026-09-08');
    await sincronizar(a, b);
    const semana = intervaloDosDias('2026-09-06', '2026-09-12');
    expect(b.repo.agenda(semana.de, semana.ate)).toEqual([]);
    expect(b.repo.obterDesvio(s.id, '2026-09-08')?.type).toBe('cancelled');
  });

  it('dois aparelhos desviam a mesma data offline: convergem pela identidade, vence o mais novo', async () => {
    const { a, b } = await doisAparelhos('Mesma data');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a, b);
    a.online = b.online = false;
    a.tempo(1000);
    a.repo.alterarOcorrencia(s.id, '2026-09-08', { titleOverride: 'de A' });
    b.tempo(5000);
    b.repo.alterarOcorrencia(s.id, '2026-09-08', { titleOverride: 'de B' });
    expect(a.repo.obterDesvio(s.id, '2026-09-08')!.id).not.toBe(
      b.repo.obterDesvio(s.id, '2026-09-08')!.id,
    );

    await sincronizar(a, b, a);
    const r = await ctx.dono.query(
      `select title_override from item_occurrences where item_id = $1`,
      [s.id],
    );
    expect(r.rows).toEqual([{ title_override: 'de B' }]);
    expect(a.repo.obterDesvio(s.id, '2026-09-08')!.titleOverride).toBe('de B');
    expect(b.repo.obterDesvio(s.id, '2026-09-08')!.titleOverride).toBe('de B');
    expect(a.repo.obterDesvio(s.id, '2026-09-08')!.id).toBe(
      b.repo.obterDesvio(s.id, '2026-09-08')!.id,
    );
    expect(a.repo.sujos()).toEqual(linhasVazias());
  });

  it('série não aceita status done nem data fora da regra', async () => {
    const { a } = await doisAparelhos('Série inválida');
    expect(() =>
      a.repo.criar({
        ...serie('x', 'FREQ=DAILY', sp(9, 1, 8)),
        status: 'done',
        completedAt: new Date(),
      }),
    ).toThrow(/série não usa status/);
    const s = a.repo.criar(serie('x', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 8)));
    expect(() => a.repo.cancelarOcorrencia(s.id, '2026-09-09')).toThrow(/não é uma ocorrência/);
  });
});

describe('rotas de ocorrência (#40)', () => {
  it('cancelar a terça de um treino semanal não afeta as outras terças', async () => {
    const { a, token } = await doisAparelhos('Cancelar terça');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a);
    const r = await rota(token, 'POST', `/items/${s.id}/occurrences/2026-09-08/cancel`);
    expect(r.status).toBe(200);
    const mes = intervaloDosDias('2026-09-01', '2026-09-30');
    const entradas = await agendaApi(token, mes.de, mes.ate);
    expect(entradas.map((e) => e.ocorrencia)).toEqual([
      '2026-09-01',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ]);
  });

  it('data que não é ocorrência → 422; item inexistente → 404; compromisso não conclui → 409', async () => {
    const { a, token } = await doisAparelhos('Erros de rota');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a);
    expect((await rota(token, 'POST', `/items/${s.id}/occurrences/2026-09-09/cancel`)).status).toBe(
      422,
    );
    expect(
      (
        await rota(
          token,
          'POST',
          `/items/01900000-0000-7000-8000-0000000000ff/occurrences/2026-09-08/cancel`,
        )
      ).status,
    ).toBe(404);
    expect(
      (await rota(token, 'POST', `/items/${s.id}/occurrences/2026-09-08/complete`)).status,
    ).toBe(409);
    expect((await rota(token, 'POST', `/items/${s.id}/occurrences/2026-13-01/cancel`)).status).toBe(
      400,
    );
  });

  it('concluir é idempotente: repetir não cria linha nem credita de novo', async () => {
    const { a, token } = await doisAparelhos('Concluir 2x');
    const s = a.repo.criar(
      serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19), HORA, {
        effort: 3,
        primaryAttribute: 'corpo',
      }),
    );
    await sincronizar(a);
    const r1 = await rota(token, 'POST', `/items/${s.id}/occurrences/2026-09-08/complete`);
    const r2 = await rota(token, 'POST', `/items/${s.id}/occurrences/2026-09-08/complete`);
    expect(r1.corpo).toMatchObject({ efeito: 'creditar' });
    expect(r2.corpo).toMatchObject({ efeito: 'nada: já concluído', lancamentos: [] });
    const n = await ctx.dono.query(
      'select count(*)::int as n from item_occurrences where item_id = $1',
      [s.id],
    );
    expect(n.rows[0].n).toBe(1);
    const xp = await ctx.dono.query(
      'select sum(points)::int as t from xp_entries where item_id = $1',
      [s.id],
    );
    expect(xp.rows[0].t).toBe(30);
  });

  it('PATCH move e edita só aquele dia', async () => {
    const { a, token } = await doisAparelhos('Mover');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    await sincronizar(a);
    const r = await rota(token, 'PATCH', `/items/${s.id}/occurrences/2026-09-08`, {
      startAt: sp(9, 9, 7).toISOString(),
      endAt: sp(9, 9, 8).toISOString(),
      titleOverride: 'treino (quarta)',
    });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ type: 'moved', occurrenceDate: '2026-09-08' });
    const semana = intervaloDosDias('2026-09-06', '2026-09-19');
    const e = await agendaApi(token, semana.de, semana.ate);
    expect(e.map((x) => [x.ocorrencia, x.title, x.startAt])).toEqual([
      ['2026-09-08', 'treino (quarta)', sp(9, 9, 7).toISOString()],
      ['2026-09-15', 'treino', sp(9, 15, 19).toISOString()],
    ]);
  });
});

describe('GET /agenda (#41)', () => {
  it('ocorrência movida para fora do intervalo some; movida para dentro aparece', async () => {
    const { a, token } = await doisAparelhos('Movida');
    const s = a.repo.criar(serie('reunião', 'FREQ=WEEKLY;BYDAY=MO', sp(9, 7, 10)));
    a.repo.alterarOcorrencia(s.id, '2026-09-14', { startAt: sp(9, 25, 10), endAt: sp(9, 25, 11) });
    a.repo.alterarOcorrencia(s.id, '2026-10-05', { startAt: sp(9, 23, 15), endAt: sp(9, 23, 16) });
    await sincronizar(a);
    const semana = intervaloDosDias('2026-09-13', '2026-09-26');
    const e = await agendaApi(token, semana.de, semana.ate);
    expect(e.map((x) => [x.ocorrencia, x.startAt])).toEqual([
      ['2026-09-21', sp(9, 21, 10).toISOString()],
      ['2026-10-05', sp(9, 23, 15).toISOString()],
      ['2026-09-14', sp(9, 25, 10).toISOString()],
    ]);
  });

  it('um mês com uma série diária e uma semanal tem a contagem esperada', async () => {
    const { a, token } = await doisAparelhos('Contagem');
    a.repo.criar(serie('remédio', 'FREQ=DAILY', sp(9, 1, 8), 0));
    a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU,TH', sp(9, 1, 19)));
    a.repo.criar(novoEvento('avulso'));
    await sincronizar(a);
    const set = intervaloDosDias('2026-09-01', '2026-09-30');
    const e = await agendaApi(token, set.de, set.ate);
    expect(e.filter((x) => x.title === 'remédio')).toHaveLength(30);
    expect(e.filter((x) => x.title === 'treino')).toHaveLength(9);
  });

  it('série encerrada por COUNT tem recurrenceEndsAt calculado no servidor', async () => {
    const { a, userId } = await doisAparelhos('COUNT');
    a.repo.criar(serie('curso', 'FREQ=WEEKLY;COUNT=3', sp(9, 1, 19)));
    await sincronizar(a);
    const r = await ctx.dono.query('select recurrence_ends_at from items where user_id = $1', [
      userId,
    ]);
    expect(r.rows[0].recurrence_ends_at.toISOString()).toBe(sp(9, 15, 20).toISOString());
  });
});

describe('paridade da projeção client × API (#42)', () => {
  it('mesma janela, mesmo conjunto de entradas', async () => {
    const { a, b, token } = await doisAparelhos('Paridade');
    a.repo.criar(serie('diária', 'FREQ=DAILY', sp(1, 1, 7), 30 * 60_000));
    const semanal = a.repo.criar(serie('semanal', 'FREQ=WEEKLY;BYDAY=TU,TH', sp(1, 6, 19)));
    a.repo.criar(serie('mensal 31', 'FREQ=MONTHLY;BYMONTHDAY=31', sp(1, 31, 9), 0));
    a.repo.criar(serie('bissexto', 'FREQ=YEARLY', sp(2, 29, 12, 0, 2024), HORA));
    a.repo.criar(serie('até', 'FREQ=DAILY;COUNT=10', sp(2, 20, 18)));
    a.repo.criar(novoEvento('avulso'));
    a.repo.cancelarOcorrencia(semanal.id, '2026-02-03');
    a.repo.alterarOcorrencia(semanal.id, '2026-02-05', {
      startAt: sp(2, 7, 9),
      endAt: sp(2, 7, 10),
    });
    a.repo.alterarOcorrencia(semanal.id, '2026-02-10', {
      titleOverride: 'semanal editada',
      notesOverride: 'sala 2',
    });
    await sincronizar(a, b);

    for (const [de, ate] of [
      ['2026-02-01', '2026-03-31'],
      ['2028-02-01', '2028-03-05'],
      ['2026-01-01', '2026-12-31'],
    ] as const) {
      const janela = intervaloDosDias(de, ate);
      const api = await agendaApi(token, janela.de, janela.ate);
      const local = a.repo.agenda(janela.de, janela.ate).map(entradaParaJson);
      const outro = b.repo.agenda(janela.de, janela.ate).map(entradaParaJson);
      expect(local).toEqual(api);
      expect(outro).toEqual(api);
      expect(api.length).toBeGreaterThan(0);
    }
    const fev = intervaloDosDias('2026-02-01', '2026-02-28');
    const e = a.repo.agenda(fev.de, fev.ate);
    const daSemanal = e.filter((x) => x.itemId === semanal.id);
    expect(daSemanal.find((x) => x.ocorrencia === '2026-02-03')).toBeUndefined();
    expect(daSemanal.find((x) => x.ocorrencia === '2026-02-10')?.title).toBe('semanal editada');
    expect(daSemanal.find((x) => x.ocorrencia === '2026-02-05')?.startAt).toEqual(sp(2, 7, 9));
    expect(e.filter((x) => x.title === 'mensal 31')).toEqual([]); // fevereiro não tem dia 31
  });
});

describe('editar série: alcance (#44)', () => {
  it('"esta e as futuras" não altera nenhuma ocorrência passada', async () => {
    const { a, b } = await doisAparelhos('Dividir');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    a.repo.cancelarOcorrencia(s.id, '2026-09-22');
    const mes = intervaloDosDias('2026-09-01', '2026-10-31');
    const antes = a.repo.agenda(mes.de, mes.ate).filter((e) => e.startAt! < sp(9, 15));

    const nova = a.repo.alterarDaquiEmDiante(s.id, '2026-09-15', {
      title: 'treino novo',
      startAt: sp(9, 15, 20),
      endAt: sp(9, 15, 21),
    });
    const depois = a.repo.agenda(mes.de, mes.ate);
    expect(depois.filter((e) => e.startAt! < sp(9, 15)).map(entradaParaJson)).toEqual(
      antes.map(entradaParaJson),
    );
    const futuras = depois.filter((e) => e.startAt! >= sp(9, 15));
    expect(futuras.every((e) => e.title === 'treino novo' && e.itemId === nova.id)).toBe(true);
    // O cancelamento de 22/09 passou para a série nova.
    expect(futuras.map((e) => e.ocorrencia)).toEqual([
      '2026-09-15',
      '2026-09-29',
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
    ]);
    expect(futuras[0]!.startAt).toEqual(sp(9, 15, 20));

    await sincronizar(a, b);
    expect(b.repo.agenda(mes.de, mes.ate).map(entradaParaJson)).toEqual(
      depois.map(entradaParaJson),
    );
  });

  it('dividir uma série com COUNT: a antiga vira UNTIL e a nova recebe o que restava', async () => {
    const { a } = await doisAparelhos('Dividir COUNT');
    const s = a.repo.criar(serie('curso', 'FREQ=WEEKLY;COUNT=5', sp(9, 1, 19)));
    const nova = a.repo.alterarDaquiEmDiante(s.id, '2026-09-15', { title: 'curso (sala nova)' });
    expect(a.repo.obter(s.id)!.rrule).toBe('FREQ=WEEKLY;UNTIL=20260908T220000Z');
    expect(nova.rrule).toBe('FREQ=WEEKLY;COUNT=3');
    const tudo = intervaloDosDias('2026-09-01', '2026-12-31');
    expect(a.repo.agenda(tudo.de, tudo.ate).map((e) => [e.ocorrencia, e.title])).toEqual([
      ['2026-09-01', 'curso'],
      ['2026-09-08', 'curso'],
      ['2026-09-15', 'curso (sala nova)'],
      ['2026-09-22', 'curso (sala nova)'],
      ['2026-09-29', 'curso (sala nova)'],
    ]);
  });

  it('dividir a série a partir de uma ocorrência concluída exige desfazer antes', async () => {
    const { a } = await doisAparelhos('Dividir concluída');
    const s = a.repo.criar(
      serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19), HORA, {
        effort: 3,
        primaryAttribute: 'corpo',
        secondaryAttribute: null,
      }),
    );
    a.repo.concluir(s.id, '2026-09-22');
    expect(() => a.repo.alterarDaquiEmDiante(s.id, '2026-09-15', { title: 'x' })).toThrow(
      /desfaça a conclusão de 2026-09-22/,
    );
    a.repo.desfazerConclusao(s.id, '2026-09-22');
    expect(a.repo.alterarDaquiEmDiante(s.id, '2026-09-15', { title: 'x' }).title).toBe('x');
  });

  it('"só esta" não altera nenhuma outra ocorrência', async () => {
    const { a } = await doisAparelhos('Só esta');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    const mes = intervaloDosDias('2026-09-01', '2026-09-30');
    const antes = a.repo.agenda(mes.de, mes.ate).map(entradaParaJson);
    a.repo.alterarOcorrencia(s.id, '2026-09-15', { titleOverride: 'treino leve' });
    const depois = a.repo.agenda(mes.de, mes.ate).map(entradaParaJson);
    const diferentes = depois.filter((d, i) => JSON.stringify(d) !== JSON.stringify(antes[i]));
    expect(diferentes.map((d) => d.ocorrencia)).toEqual(['2026-09-15']);
  });

  it('excluir "esta e as futuras" encerra a série; na primeira ocorrência, exclui tudo', async () => {
    const { a } = await doisAparelhos('Encerrar');
    const s = a.repo.criar(serie('treino', 'FREQ=WEEKLY;BYDAY=TU', sp(9, 1, 19)));
    a.repo.encerrarSerieAntes(s.id, '2026-09-15');
    const mes = intervaloDosDias('2026-09-01', '2026-10-31');
    expect(a.repo.agenda(mes.de, mes.ate).map((e) => e.ocorrencia)).toEqual([
      '2026-09-01',
      '2026-09-08',
    ]);
    a.repo.encerrarSerieAntes(s.id, '2026-09-01');
    expect(a.repo.obter(s.id)).toBeNull();
  });
});
