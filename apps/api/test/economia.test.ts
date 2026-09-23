/** F7 — economia: moedas (#77), carência (#78), resgate (#79), histórico e saldo (#81). */
import { diaDe, novoId, proximaSegunda, somarDias } from '@compasso/core';
import { describe, expect, it } from 'vitest';
import { comToken } from './ajuda';
import { usarClientes, type Cliente } from './clientes';

const { ctx, doisAparelhos } = usarClientes();
const hoje = () => diaDe(new Date());

async function sincronizar(...cs: Cliente[]) {
  for (const c of cs) {
    c.online = true;
    await c.motor.sincronizar();
  }
}

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
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> & { id: string } };
}

async function darMoedas(userId: string, n: number) {
  await ctx.dono.query(
    `insert into coin_entries (id, user_id, amount, source, ref_id, created_at) values ($1, $2, $3, 'task', $4, now())`,
    [novoId(), userId, n, novoId()],
  );
}

/** Recompensa já fora da carência (vigente desde a semana passada), direto no banco. */
async function recompensaVigente(userId: string, preco: number, cooldown: number) {
  const id = novoId();
  await ctx.dono.query(
    `insert into rewards (id, user_id, name, price, cooldown_days, price_effective_from, created_at, updated_at)
     values ($1, $2, 'Pizza', $3, $4, $5, now(), now())`,
    [id, userId, preco, cooldown, somarDias(hoje(), -7)],
  );
  return id;
}

describe('carência (#78)', () => {
  it('recompensa criada hoje não resgata: vale a partir da próxima segunda', async () => {
    const { token, userId } = await doisAparelhos('Carência');
    await darMoedas(userId, 1000);
    const r = await api(token, 'POST', '/rewards', { name: 'Cinema', price: 30, cooldownDays: 7 });
    expect(r.status).toBe(201);
    expect(r.corpo.priceEffectiveFrom).toBe(proximaSegunda(hoje()));
    const resgate = await api(token, 'POST', `/rewards/${r.corpo.id}/redeem`);
    expect(resgate.status).toBe(409);
    expect(resgate.corpo.erro).toMatch(/carência/);
  });

  it('baixar o preço não tem efeito até a segunda: o resgate cobra o preço antigo', async () => {
    const { token, userId } = await doisAparelhos('Baixar preço');
    await darMoedas(userId, 1000);
    const id = await recompensaVigente(userId, 100, 0);
    const p = await api(token, 'PATCH', `/rewards/${id}`, { price: 10 });
    expect(p.corpo).toMatchObject({
      price: 100,
      pendingPrice: 10,
      pendingFrom: proximaSegunda(hoje()),
    });
    const resgate = await api(token, 'POST', `/rewards/${id}/redeem`);
    expect(resgate.corpo.pricePaid).toBe(100);
  });

  it('o sync não antecipa a carência: vigência no passado é empurrada para a próxima segunda', async () => {
    const { a, userId } = await doisAparelhos('Sync carência');
    const r = a.repo.criarRecompensa({ name: 'Jogo', price: 50, cooldownDays: 0 });
    // Trapaça: edita a vigência direto no SQLite para ontem.
    a.sqlite
      .prepare(`update rewards set price_effective_from = ? where id = ?`)
      .run(somarDias(hoje(), -1), r.id);
    await sincronizar(a);
    const linha = await ctx.dono.query(
      'select price_effective_from::text as price_effective_from from rewards where id = $1 and user_id = $2',
      [r.id, userId],
    );
    expect(linha.rows[0].price_effective_from).toBe(proximaSegunda(hoje()));
    expect(a.repo.consultasDaEconomia().recompensas.all()[0]!.priceEffectiveFrom).toBe(
      proximaSegunda(hoje()),
    );
  });
});

describe('resgate (#79)', () => {
  it('dentro do cooldown falha mesmo com saldo sobrando', async () => {
    const { token, userId } = await doisAparelhos('Cooldown');
    await darMoedas(userId, 1000);
    const id = await recompensaVigente(userId, 50, 7);
    expect((await api(token, 'POST', `/rewards/${id}/redeem`)).status).toBe(201);
    const segundo = await api(token, 'POST', `/rewards/${id}/redeem`);
    expect(segundo.status).toBe(409);
    expect(segundo.corpo.erro).toMatch(/cooldown/);
  });

  it('saldo insuficiente → 409; resgate idempotente pela chave', async () => {
    const { token, userId } = await doisAparelhos('Saldo');
    await darMoedas(userId, 40);
    const id = await recompensaVigente(userId, 50, 0);
    const r = await api(token, 'POST', `/rewards/${id}/redeem`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toMatch(/faltam 10/);
    await darMoedas(userId, 100);
    const chave = novoId();
    const a1 = await api(token, 'POST', `/rewards/${id}/redeem`, undefined, {
      'idempotency-key': chave,
    });
    const a2 = await api(token, 'POST', `/rewards/${id}/redeem`, undefined, {
      'idempotency-key': chave,
    });
    expect(a2.corpo).toEqual(a1.corpo);
    expect((await api(token, 'GET', '/wallet')).corpo.saldo).toBe(90);
  });

  it('pricePaid não muda quando o preço muda depois; o histórico mostra o preço da época', async () => {
    const { a, token, userId } = await doisAparelhos('Histórico');
    await darMoedas(userId, 1000);
    const id = await recompensaVigente(userId, 70, 0);
    await api(token, 'POST', `/rewards/${id}/redeem`);
    await ctx.dono.query('update rewards set price = 5 where id = $1', [id]);
    const h = await ctx.env.app.request('/redemptions', comToken(token));
    const lista = (await h.json()) as { pricePaid: number; rewardName: string }[];
    expect(lista).toEqual([expect.objectContaining({ pricePaid: 70, rewardName: 'Pizza' })]);
    // O resgate e o débito chegam ao aparelho; o saldo local bate com o da API.
    await sincronizar(a);
    expect(a.repo.consultasDaEconomia().resgates.all()).toEqual([
      expect.objectContaining({ pricePaid: 70 }),
    ]);
    expect(a.repo.saldo()).toBe((await api(token, 'GET', '/wallet')).corpo.saldo);
  });
});

describe('moedas na conclusão (#77)', () => {
  it('concluir 3× → 1 lançamento de moeda; desfazer → estorno; saldo = soma dos lançamentos', async () => {
    const { a, token, userId } = await doisAparelhos('Moedas');
    const t = a.repo.criar({
      title: 'relatório',
      notes: null,
      kind: 'task',
      effort: 8,
      effortLockedAt: null,
      primaryAttribute: 'oficio',
      secondaryAttribute: null,
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      startAt: null,
      endAt: null,
      allDay: false,
      timezone: 'America/Sao_Paulo',
      rrule: null,
      sourceUid: null,
      courseId: null,
      completedAt: null,
      reminderMinutesBefore: null,
    });
    await sincronizar(a);
    const chave = novoId();
    for (let i = 0; i < 3; i++)
      await api(token, 'POST', `/items/${t.id}/complete`, undefined, { 'idempotency-key': chave });
    const m = await ctx.dono.query(`select amount from coin_entries where user_id = $1`, [userId]);
    expect(m.rows).toEqual([{ amount: 8 }]);
    await api(token, 'POST', `/items/${t.id}/uncomplete`);
    const soma = await ctx.dono.query(
      `select sum(amount)::int as s, count(*)::int as n from coin_entries where user_id = $1`,
      [userId],
    );
    expect(soma.rows[0]).toEqual({ s: 0, n: 2 });
    expect((await api(token, 'GET', '/wallet')).corpo.saldo).toBe(0);
  });
});
