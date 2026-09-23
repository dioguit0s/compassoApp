import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ambiente } from './ajuda';

let env: Awaited<ReturnType<typeof ambiente>>;
let cliente: pg.Client;
beforeAll(async () => {
  env = await ambiente();
  cliente = new pg.Client({ connectionString: inject('urlApp') });
  await cliente.connect();
});
afterAll(async () => {
  await cliente.end();
  await env.fechar();
});

describe('Row-Level Security', () => {
  it('o papel da API não é superusuário, não é dono e não ignora RLS', async () => {
    const r = await cliente.query(
      `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const donos = await cliente.query(
      `select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(donos.rows).toEqual([]);
  });

  it('toda tabela do schema public tem RLS ativo e ao menos uma política', async () => {
    const r = await cliente.query(`
      select c.relname, c.relrowsecurity,
             (select count(*) from pg_policy p where p.polrelid = c.oid)::int as politicas
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const linha of r.rows) {
      expect(linha, linha.relname).toMatchObject({ relrowsecurity: true });
      expect(linha.politicas, linha.relname).toBeGreaterThan(0);
    }
  });

  it('sem app.user_id, a consulta devolve zero linhas', async () => {
    await env.admin.criarConta('Existe');
    const r = await cliente.query('select * from users');
    expect(r.rows).toEqual([]);
  });

  it('com app.user_id da conta A, não enxerga a conta B', async () => {
    const a = await env.admin.criarConta('RLS A');
    const b = await env.admin.criarConta('RLS B');
    await cliente.query('begin');
    await cliente.query(`select set_config('app.user_id', $1, true)`, [a.userId]);
    const r = await cliente.query('select id from users');
    const upd = await cliente.query(`update users set display_name = 'x' where id = $1`, [
      b.userId,
    ]);
    await cliente.query('commit');
    expect(r.rows).toEqual([{ id: a.userId }]);
    expect(upd.rowCount).toBe(0);
  });

  it('depois do fim da transação, app.user_id deixa de valer (SET LOCAL)', async () => {
    const a = await env.admin.criarConta('RLS C');
    await cliente.query('begin');
    await cliente.query(`select set_config('app.user_id', $1, true)`, [a.userId]);
    await cliente.query('commit');
    const r = await cliente.query('select id from users');
    expect(r.rows).toEqual([]);
  });

  it('o papel da API não lê a tabela de tokens nem apaga linhas', async () => {
    await expect(cliente.query('select * from api_tokens')).rejects.toThrow(/permission denied/);
    await expect(cliente.query('delete from users')).rejects.toThrow(/permission denied/);
  });
});
