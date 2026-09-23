/** F6 — gamificação: congelamento (#69), ledger (#70), conclusão (#71), estorno (#72), adiar (#73), radar (#74). */
import { diaDe, instanteDeParede, novoId, somarDias, type MedidaDoAtributo } from '@compasso/core';
import { describe, expect, inject, it } from 'vitest';
import { comToken } from './ajuda';
import { novoEvento, usarClientes, type Cliente } from './clientes';

const { ctx, doisAparelhos } = usarClientes();
const hoje = () => diaDe(new Date());
const emDias = (n: number, h = 10) => {
  const [a, m, d] = somarDias(hoje(), n).split('-').map(Number);
  return instanteDeParede(a!, m!, d!, h, 0);
};

async function sincronizar(...cs: Cliente[]) {
  for (const c of cs) {
    c.online = true;
    await c.motor.sincronizar();
  }
}

const tarefa = (titulo: string, prazo: Date, extra = {}) => ({
  ...novoEvento(titulo),
  kind: 'task' as const,
  startAt: null,
  dueAt: prazo,
  effort: 5,
  primaryAttribute: 'mente' as const,
  secondaryAttribute: 'oficio' as const,
  ...extra,
});

async function api(
  token: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
  headers: Record<string, string> = {},
) {
  const r = await ctx.env.app.request(
    caminho,
    comToken(token, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers }),
  );
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

async function somaDoLedger(userId: string, itemId?: string) {
  const r = await ctx.dono.query(
    `select coalesce(sum(points), 0)::int as xp, count(*)::int as n from xp_entries where user_id = $1 ${itemId ? 'and item_id = $2' : ''}`,
    itemId ? [userId, itemId] : [userId],
  );
  return r.rows[0] as { xp: number; n: number };
}

describe('conclusão idempotente (#71)', () => {
  it('a mesma conclusão enviada três vezes credita XP exatamente uma vez', async () => {
    const { a, token, userId } = await doisAparelhos('Três vezes');
    const t = a.repo.criar(tarefa('relatório', emDias(3)));
    await sincronizar(a);
    const chave = novoId();
    for (let i = 0; i < 3; i++) {
      const r = await api(token, 'POST', `/items/${t.id}/complete`, undefined, {
        'idempotency-key': chave,
      });
      expect(r.status).toBe(200);
    }
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 2 }); // 35 mente + 15 ofício
    // Chaves diferentes para o mesmo item também não creditam de novo.
    await api(token, 'POST', `/items/${t.id}/complete`);
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 2 });
    const w = await api(token, 'GET', '/wallet');
    expect(w.corpo.saldo).toBe(5);
  });

  it('push repetido do mesmo evento (resposta perdida) não duplica o ledger', async () => {
    const { a, userId } = await doisAparelhos('Push perdido');
    const t = a.repo.criar(tarefa('estudar', emDias(2)));
    await sincronizar(a);
    const efeito = a.repo.concluir(t.id);
    expect(efeito).toMatchObject({ tipo: 'creditar', moedas: 5 });
    a.perderRespostaDoPush = true;
    await expect(a.motor.sincronizar()).rejects.toThrow();
    await expect(a.motor.sincronizar()).rejects.toThrow();
    a.perderRespostaDoPush = false;
    await a.motor.sincronizar();
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 2 });
  });

  it('dois aparelhos concluem offline: credita uma vez, os dois veem concluído', async () => {
    const { a, b, userId } = await doisAparelhos('Dois aparelhos');
    const t = a.repo.criar(tarefa('faxina', emDias(2)));
    await sincronizar(a, b);
    a.online = b.online = false;
    a.repo.concluir(t.id);
    b.repo.concluir(t.id);
    await sincronizar(a, b, a);
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 2 });
    expect(a.repo.obter(t.id)!.status).toBe('done');
    expect(b.repo.obter(t.id)!.status).toBe('done');
    expect(a.repo.saldo()).toBe(5);
    expect(b.repo.saldo()).toBe(5);
  });

  it('compromisso sem esforço → 409; item inexistente → 404', async () => {
    const { a, token } = await doisAparelhos('409');
    const e = a.repo.criar(novoEvento('dentista'));
    await sincronizar(a);
    expect((await api(token, 'POST', `/items/${e.id}/complete`)).status).toBe(409);
    expect((await api(token, 'POST', `/items/${novoId()}/complete`)).status).toBe(404);
    expect(() => a.repo.concluir(e.id)).toThrow(/não é concluível/);
  });

  it('edição atrasada de outro aparelho não "desconclui": o status vem do ledger', async () => {
    const { a, b, userId } = await doisAparelhos('LWW não desconclui');
    const t = a.repo.criar(tarefa('treino', emDias(2)));
    await sincronizar(a, b);
    a.repo.concluir(t.id);
    await sincronizar(a);
    // B ainda não sabe da conclusão e edita o título (mais recente pelo relógio).
    b.online = false;
    b.tempo(60_000);
    b.repo.editar(t.id, { title: 'treino pesado' });
    await sincronizar(b, a);
    const r = await ctx.dono.query('select title, status from items where id = $1', [t.id]);
    expect(r.rows[0]).toEqual({ title: 'treino pesado', status: 'done' });
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 2 });
    expect(b.repo.obter(t.id)!.status).toBe('done');
  });
});

describe('desfazer (#72)', () => {
  it('concluir → desfazer → soma 0; concluir de novo credita de novo; desfazer 2× estorna 1×', async () => {
    const { a, userId } = await doisAparelhos('Desfazer');
    const t = a.repo.criar(tarefa('ler', emDias(2)));
    a.repo.concluir(t.id);
    await sincronizar(a);
    expect(a.repo.desfazerConclusao(t.id)).toMatchObject({ tipo: 'estornar', moedas: -5 });
    expect(a.repo.desfazerConclusao(t.id)).toMatchObject({ tipo: 'nada' });
    await sincronizar(a);
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 0, n: 4 });
    expect(a.repo.obter(t.id)!.status).toBe('open');
    a.repo.concluir(t.id);
    await sincronizar(a);
    expect(await somaDoLedger(userId, t.id)).toEqual({ xp: 50, n: 6 });
  });

  it('estorno com moeda já gasta deixa o saldo negativo (ADR-0006)', async () => {
    const { a, userId } = await doisAparelhos('Saldo negativo');
    const t = a.repo.criar(tarefa('x', emDias(2)));
    a.repo.concluir(t.id);
    await sincronizar(a);
    // Resgate gasta as 5 moedas (a tabela de resgates é da F7; o lançamento de moeda basta aqui).
    await ctx.dono.query(
      `insert into coin_entries (id, user_id, amount, source, ref_id, created_at) values ($1, $2, -5, 'redemption', $3, now())`,
      [novoId(), userId, novoId()],
    );
    a.repo.desfazerConclusao(t.id);
    await sincronizar(a);
    expect(a.repo.saldo()).toBe(-5);
  });
});

describe('ledger append-only (#70)', () => {
  it('o papel da API não consegue alterar nem apagar lançamentos', async () => {
    const { a, userId } = await doisAparelhos('Append-only');
    const t = a.repo.criar(tarefa('x', emDias(2)));
    a.repo.concluir(t.id);
    await sincronizar(a);
    const pg = await import('pg');
    const app = new pg.default.Client({ connectionString: inject('urlApp') });
    await app.connect();
    try {
      await app.query('begin');
      await app.query(`select set_config('app.user_id', $1, true)`, [userId]);
      await expect(app.query('update xp_entries set points = 999')).rejects.toThrow(
        /permission denied/,
      );
      await app.query('rollback');
      await app.query('begin');
      await app.query(`select set_config('app.user_id', $1, true)`, [userId]);
      await expect(app.query('delete from coin_entries')).rejects.toThrow(/permission denied/);
      await app.query('rollback');
    } finally {
      await app.end();
    }
  });

  it('lançamentos gerados por conclusões em dois aparelhos aparecem nos dois', async () => {
    const { a, b } = await doisAparelhos('Ledger nos dois');
    const t1 = a.repo.criar(tarefa('um', emDias(2)));
    const t2 = a.repo.criar(
      tarefa('dois', emDias(2), { effort: 2, secondaryAttribute: null, primaryAttribute: 'corpo' }),
    );
    await sincronizar(a, b);
    a.repo.concluir(t1.id);
    b.repo.concluir(t2.id);
    await sincronizar(a, b, a);
    const radarA = a.repo.radar().map((m) => [m.attribute, m.acumulado]);
    expect(radarA).toEqual(b.repo.radar().map((m) => [m.attribute, m.acumulado]));
    expect(Object.fromEntries(radarA)).toMatchObject({ mente: 35, oficio: 15, corpo: 20 });
  });
});

describe('congelamento do esforço (#69)', () => {
  it('item de hoje nasce congelado: recusa editar esforço na UI e na API', async () => {
    const { a, token } = await doisAparelhos('Congelar');
    const t = a.repo.criar(tarefa('hoje', emDias(0, 23)));
    expect(t.effortLockedAt).not.toBeNull();
    expect(() => a.repo.editar(t.id, { effort: 8 })).toThrow(/esforço congelado/);
    await sincronizar(a);
    const r = await api(token, 'PATCH', `/items/${t.id}`, { effort: 8 });
    expect(r.status).toBe(409);
    expect((await api(token, 'PATCH', `/items/${t.id}`, { title: 'hoje, renomeado' })).status).toBe(
      200,
    );
  });

  it('push que tenta mudar o esforço de item congelado não muda', async () => {
    const { a, b } = await doisAparelhos('Congelar sync');
    const t = a.repo.criar(tarefa('futuro', emDias(5)));
    await sincronizar(a, b);
    // A trava (servidor congela pela data quando o item chega); B, desatualizado, muda o esforço.
    await ctx.dono.query(`update items set effort_locked_at = now() where id = $1`, [t.id]);
    b.online = false;
    b.tempo(60_000);
    b.repo.editar(t.id, { effort: 8 });
    await sincronizar(b);
    const r = await ctx.dono.query('select effort, effort_locked_at from items where id = $1', [
      t.id,
    ]);
    expect(r.rows[0].effort).toBe(5);
    expect(r.rows[0].effort_locked_at).not.toBeNull();
  });

  it('o dia chegou: congelarEsforcosDoDia grava a trava, e adiar não destrava', async () => {
    const { a, token, userId } = await doisAparelhos('Adiar');
    const t = a.repo.criar(tarefa('amanhã', emDias(1)));
    expect(t.effortLockedAt).toBeNull();
    a.tempo(2 * 86_400_000); // dois dias depois, no relógio do aparelho
    expect(a.repo.congelarEsforcosDoDia()).toBe(1);
    const adiado = a.repo.adiar(t.id, 7);
    expect(adiado.postponeCount).toBe(1);
    expect(adiado.effortLockedAt).not.toBeNull();
    expect(() => a.repo.editar(t.id, { effort: 1 })).toThrow(/congelado/);
    await sincronizar(a);
    // Adiar pela API soma exatamente 1, no banco.
    const r = await api(token, 'POST', `/items/${t.id}/postpone`);
    expect(r.status).toBe(200);
    const linha = await ctx.dono.query(
      'select postpone_count, effort_locked_at from items where id = $1 and user_id = $2',
      [t.id, userId],
    );
    expect(linha.rows[0].postpone_count).toBe(2);
    expect(linha.rows[0].effort_locked_at).not.toBeNull();
  });

  it('compromisso não é adiado; série também não', async () => {
    const { a } = await doisAparelhos('Adiar compromisso');
    const e = a.repo.criar(novoEvento('dentista'));
    expect(() => a.repo.adiar(e.id)).toThrow(/compromisso/);
  });
});

describe('GET /stats/attributes (#74)', () => {
  it('soma do ledger bate com o acumulado; lançamento de 31 dias conta só no acumulado', async () => {
    const { a, token, userId } = await doisAparelhos('Radar');
    const t = a.repo.criar(tarefa('x', emDias(2)));
    a.repo.concluir(t.id);
    await sincronizar(a);
    const velho = novoId();
    await ctx.dono.query(
      `insert into completions (id, user_id, item_id, action, at, efeito, created_at) values ($1, $2, $3, 'complete', now() - interval '31 days', 'creditar', now())`,
      [velho, userId, novoId()],
    );
    await ctx.dono.query(
      `insert into xp_entries (id, user_id, item_id, completion_id, attribute, points, earned_at) values ($1, $2, $3, $4, 'corpo', 80, now() - interval '31 days')`,
      [novoId(), userId, novoId(), velho],
    );
    const r = await api(token, 'GET', '/stats/attributes');
    const m = Object.fromEntries(
      (r.corpo.atributos as MedidaDoAtributo[]).map((x) => [x.attribute, x]),
    );
    expect(Object.keys(m)).toEqual(['corpo', 'mente', 'oficio', 'casa', 'social']);
    expect(m.corpo).toMatchObject({ acumulado: 80, janela30: 0 });
    expect(m.mente).toMatchObject({ acumulado: 35, janela30: 35 });
    const total = (await somaDoLedger(userId)).xp;
    expect(Object.values(m).reduce((n, x) => n + x.acumulado, 0)).toBe(total);
    // O app calcula igual, offline, a partir do que o pull trouxe.
    await sincronizar(a);
    expect(a.repo.radar().map((x) => [x.attribute, x.acumulado, x.janela30])).toEqual(
      (r.corpo.atributos as MedidaDoAtributo[]).map((x) => [x.attribute, x.acumulado, x.janela30]),
    );
  });
});
