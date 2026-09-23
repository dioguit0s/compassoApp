/** F4 — importação de ICS: conversão (#50), idempotência por UID (#51), regras exóticas (#52). */
import {
  entradaParaJson,
  instanteDeParede,
  intervaloDosDias,
  type EntradaAgendaJson,
} from '@compasso/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planejarImportacao } from '../src/ics';
import { comToken } from './ajuda';
import { usarClientes } from './clientes';

const { ctx, doisAparelhos } = usarClientes();
const ICS = readFileSync(new URL('./dados/google.ics', import.meta.url), 'utf8');
const sp = (m: number, d: number, h = 0, mi = 0, a = 2026) => instanteDeParede(a, m, d, h, mi);

async function importar(token: string, texto: string) {
  const form = new FormData();
  form.append('arquivo', new File([texto], 'google.ics', { type: 'text/calendar' }));
  const r = await ctx.env.app.request(
    '/import/ics',
    comToken(token, { method: 'POST', body: form }),
  );
  return {
    status: r.status,
    corpo: (await r.json()) as Record<string, unknown> & {
      criados: number;
      atualizados: number;
      inalterados: number;
      desvios: number;
      expandidos: { titulo: string; ocorrencias: number }[];
      ignorados: { titulo: string | null; motivo: string }[];
    },
  };
}

async function agenda(token: string, de: string, ate: string) {
  const j = intervaloDosDias(de, ate);
  const r = await ctx.env.app.request(
    `/agenda?from=${j.de.toISOString()}&to=${j.ate.toISOString()}`,
    comToken(token),
  );
  return ((await r.json()) as { entradas: EntradaAgendaJson[] }).entradas;
}

describe('POST /import/ics (#50)', () => {
  it('converte simples, dia inteiro, UTC, série com EXDATE e ocorrência modificada', async () => {
    const { token, userId } = await doisAparelhos('Importar');
    const { status, corpo } = await importar(token, ICS);
    expect(status).toBe(200);
    const plano = planejarImportacao(ICS);
    const expandidos = plano.expandidos[0]!.ocorrencias;
    expect(corpo.criados).toBe(6 + expandidos); // dentista, viagem, utc, treino, standup, aniversário
    expect(corpo.desvios).toBe(3); // EXDATE 15/09, movida 22/09, cancelada 29/09
    expect(corpo.ignorados.map((i) => i.titulo)).toEqual(['Evento cancelado']);

    const r = await ctx.dono.query(
      `select count(*) filter (where effort is not null or primary_attribute is not null)::int as pontuam,
              count(*) filter (where kind <> 'event')::int as tarefas
       from items where user_id = $1`,
      [userId],
    );
    expect(r.rows[0]).toEqual({ pontuam: 0, tarefas: 0 });

    const set = await agenda(token, '2026-09-01', '2026-09-30');
    const titulos = (t: string) => set.filter((e) => e.title.startsWith(t));
    expect(titulos('Dentista')[0]).toMatchObject({
      startAt: sp(9, 10, 14).toISOString(),
      endAt: sp(9, 10, 15).toISOString(),
      notes: 'Levar exames\nRua X, 123',
    });
    expect(titulos('Viagem')[0]).toMatchObject({
      allDay: true,
      startAt: sp(9, 25).toISOString(),
      endAt: sp(9, 28).toISOString(),
    });
    expect(titulos('Reunião em UTC')[0]!.startAt).toBe('2026-09-11T13:00:00.000Z');
    expect(titulos('Treino').map((e) => [e.ocorrencia, e.title, e.startAt])).toEqual([
      ['2026-09-01', 'Treino', sp(9, 1, 19).toISOString()],
      ['2026-09-08', 'Treino', sp(9, 8, 19).toISOString()],
      ['2026-09-22', 'Treino (quarta cedo)', sp(9, 23, 7).toISOString()],
    ]);
  });

  it('série com TZID de outro fuso expande na hora de parede de lá', async () => {
    const { token } = await doisAparelhos('TZID');
    await importar(token, ICS);
    const e = (await agenda(token, '2026-03-01', '2026-03-31')).filter((x) =>
      x.title.startsWith('Standup'),
    );
    // Nova York muda para horário de verão em 08/03: 09:00 NY = 11:00 SP antes, 10:00 SP depois.
    expect(e.map((x) => x.startAt)).toEqual([
      sp(3, 2, 11).toISOString(),
      sp(3, 9, 10).toISOString(),
      sp(3, 16, 10).toISOString(),
      sp(3, 23, 10).toISOString(),
      sp(3, 30, 10).toISOString(),
    ]);
  });

  it('29 de fevereiro anual de dia inteiro só aparece em ano bissexto', async () => {
    const { token } = await doisAparelhos('Bissexto');
    await importar(token, ICS);
    const anos = await agenda(token, '2026-01-01', '2026-12-31');
    expect(anos.filter((x) => x.title.startsWith('Aniversário'))).toEqual([]);
    const bi = await agenda(token, '2028-02-01', '2028-03-31');
    expect(bi.filter((x) => x.title.startsWith('Aniversário')).map((x) => x.ocorrencia)).toEqual([
      '2028-02-29',
    ]);
  });

  it('arquivo inválido → 400, nada gravado; sem arquivo → 400', async () => {
    const { token, userId } = await doisAparelhos('Inválido');
    expect((await importar(token, 'isto não é ics')).status).toBe(400);
    const r = await ctx.env.app.request(
      '/import/ics',
      comToken(token, { method: 'POST', body: new FormData() }),
    );
    expect(r.status).toBe(400);
    const n = await ctx.dono.query('select count(*)::int as n from items where user_id = $1', [
      userId,
    ]);
    expect(n.rows[0].n).toBe(0);
  });
});

describe('idempotência por UID (#51)', () => {
  it('reimportar não duplica; alterar um evento e reimportar atualiza só ele', async () => {
    const { token, userId } = await doisAparelhos('Reimportar');
    const primeira = await importar(token, ICS);
    const contar = async () =>
      (await ctx.dono.query('select count(*)::int as n from items where user_id = $1', [userId]))
        .rows[0].n;
    const contarDesvios = async () =>
      (
        await ctx.dono.query('select count(*)::int as n from item_occurrences where user_id = $1', [
          userId,
        ])
      ).rows[0].n;
    const antes = await contar();
    const desviosAntes = await contarDesvios();

    const segunda = await importar(token, ICS);
    expect(segunda.corpo).toMatchObject({ criados: 0, atualizados: 0, desvios: 0 });
    expect(segunda.corpo.inalterados).toBe(primeira.corpo.criados);
    expect(await contar()).toBe(antes);
    expect(await contarDesvios()).toBe(desviosAntes);

    const alterado = ICS.replace('SUMMARY:Dentista', 'SUMMARY:Dentista (remarcado)');
    const terceira = await importar(token, alterado);
    expect(terceira.corpo).toMatchObject({ criados: 0, atualizados: 1 });
    expect(await contar()).toBe(antes);
    const r = await ctx.dono.query(
      `select title from items where user_id = $1 and source_uid = 'dentista@google.com'`,
      [userId],
    );
    expect(r.rows[0].title).toBe('Dentista (remarcado)');
  });

  it('item excluído no Compasso não volta na reimportação', async () => {
    const { a, token } = await doisAparelhos('Excluído');
    await importar(token, ICS);
    a.online = true;
    await a.motor.sincronizar();
    const dentista = a.repo.listar().find((i) => i.sourceUid === 'dentista@google.com')!;
    a.repo.excluir(dentista.id);
    await a.motor.sincronizar();
    const r = await importar(token, ICS);
    expect(r.corpo.ignorados.map((i) => i.motivo)).toContain('excluído no Compasso');
    await a.motor.sincronizar();
    expect(a.repo.obter(dentista.id)).toBeNull();
  });

  it('o que foi importado chega ao aparelho pelo sync, com o sourceUid preservado', async () => {
    const { a, token } = await doisAparelhos('Sync da importação');
    await importar(token, ICS);
    a.online = true;
    await a.motor.sincronizar();
    const set = intervaloDosDias('2026-09-01', '2026-09-30');
    expect(a.repo.agenda(set.de, set.ate).map(entradaParaJson)).toEqual(
      await agenda(token, '2026-09-01', '2026-09-30'),
    );
    // Um push de volta (edição local) não apaga o sourceUid: a reimportação continua idempotente.
    const treino = a.repo.listar().find((i) => i.sourceUid === 'treino@google.com')!;
    a.tempo(1000);
    a.repo.editar(treino.id, { notes: 'academia nova' });
    await a.motor.sincronizar();
    const r = await importar(token, ICS);
    expect(r.corpo.criados).toBe(0);
  });
});

describe('regras fora do subconjunto (#52)', () => {
  it('BYSETPOS vira itens isolados na janela, com aviso, e não duplica na reimportação', async () => {
    const { token, userId } = await doisAparelhos('Exótica');
    const r = await importar(token, ICS);
    expect(r.corpo.expandidos).toEqual([
      expect.objectContaining({ titulo: 'Fechamento do mês', motivo: 'BYSETPOS não é suportado' }),
    ]);
    const n = r.corpo.expandidos[0]!.ocorrencias;
    expect(n).toBeGreaterThan(20); // ~2 anos de últimos dias úteis
    const itens = await ctx.dono.query(
      `select source_uid, start_at, rrule from items where user_id = $1 and source_uid like 'fechamento@google.com#%' order by start_at`,
      [userId],
    );
    expect(itens.rows).toHaveLength(n);
    expect(itens.rows.every((l) => l.rrule === null)).toBe(true);
    expect(itens.rows[0].source_uid).toBe('fechamento@google.com#20260930T180000');
    // Último dia útil de outubro/2026 é sexta, 30; de janeiro/2027, sexta 29.
    const inicios = itens.rows.map((l) => (l.start_at as Date).toISOString());
    expect(inicios).toContain(sp(10, 30, 18).toISOString());
    expect(inicios).toContain(sp(1, 29, 18, 0, 2027).toISOString());

    const de_novo = await importar(token, ICS);
    expect(de_novo.corpo.criados).toBe(0);
    const total = await ctx.dono.query(
      `select count(*)::int as n from items where user_id = $1 and source_uid like 'fechamento@google.com#%'`,
      [userId],
    );
    expect(total.rows[0].n).toBe(n);
  });

  it('janela: 1 ano para trás e 2 para frente de agora', () => {
    const plano = planejarImportacao(ICS, new Date('2026-09-23T12:00:00Z'));
    const fech = plano.itens.filter((i) => i.sourceUid.startsWith('fechamento'));
    expect(fech[0]!.startAt).toEqual(sp(9, 30, 18));
    expect(fech.at(-1)!.startAt < new Date('2028-09-23T12:00:00Z')).toBe(true);
    expect(fech.length).toBe(24);
  });
});
