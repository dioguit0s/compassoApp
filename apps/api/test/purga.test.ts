import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ambiente, comToken } from './ajuda';
import { evento } from './fixtures';

let env: Awaited<ReturnType<typeof ambiente>>;
let dono: pg.Client;
beforeAll(async () => {
  env = await ambiente();
  dono = new pg.Client({ connectionString: inject('urlAdmin') });
  await dono.connect();
});
afterAll(async () => {
  await dono.end();
  await env.fechar();
});

const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe('purga de tombstones no servidor', () => {
  it('apaga o excluído há 31 dias, mantém o de 29 e o não excluído', async () => {
    const { token } = await env.admin.criarConta('Purga');
    const velho = evento({ deletedAt: diasAtras(31), updatedAt: diasAtras(31) });
    const recente = evento({ deletedAt: diasAtras(29), updatedAt: diasAtras(29) });
    const vivo = evento();
    await env.app.request(
      '/sync/push',
      comToken(token, { method: 'POST', body: JSON.stringify({ itens: [velho, recente, vivo] }) }),
    );

    const n = await env.admin.purgarTombstones(30);
    expect(n).toBeGreaterThanOrEqual(1);

    const r = await dono.query('select id from items where id = any($1)', [
      [velho.id, recente.id, vivo.id],
    ]);
    expect(r.rows.map((l) => l.id).sort()).toEqual([recente.id, vivo.id].sort());
  });
});
