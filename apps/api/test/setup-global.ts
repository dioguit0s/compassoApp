import EmbeddedPostgres from 'embedded-postgres';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { migrar } from '../src/db/migrar';

/**
 * Sobe um PostgreSQL descartável para a suíte inteira, reproduz o bootstrap dos papéis e aplica
 * as migrações. Nenhum passo manual. Para usar um servidor existente, defina
 * TEST_POSTGRES_URL apontando para um superusuário (o banco `compasso_teste` é recriado).
 */
const SENHA_DONO = 'dono-teste';
const SENHA_APP = 'app-teste';

export default async function setup(project: TestProject) {
  let urlSuper = process.env.TEST_POSTGRES_URL;
  let parar = async () => {};

  if (!urlSuper) {
    // O embedded-postgres cria o diretório (e, rodando como root, entrega ao usuário postgres).
    const dir = join(tmpdir(), `compasso-pg-${randomUUID()}`);
    const porta = 55000 + Math.floor(Math.random() * 1000);
    const servidor = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: porta,
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await servidor.initialise();
    await servidor.start();
    urlSuper = `postgres://postgres:postgres@localhost:${porta}/postgres`;
    parar = async () => {
      await servidor.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const base = new URL(urlSuper);
  const sup = new pg.Client({ connectionString: urlSuper });
  await sup.connect();
  await sup.query('drop database if exists compasso_teste');
  for (const [papel, senha] of [
    ['compasso_owner', SENHA_DONO],
    ['compasso_app', SENHA_APP],
  ] as const) {
    await sup.query(
      `do $$ begin
         if not exists (select from pg_roles where rolname = '${papel}') then
           create role ${papel} login;
         end if;
       end $$`,
    );
    await sup.query(`alter role ${papel} login password '${senha}' nosuperuser nobypassrls`);
  }
  await sup.query('create database compasso_teste owner compasso_owner');
  await sup.end();

  const urlDb = (usuario: string, senha: string) => {
    const u = new URL(base);
    u.username = usuario;
    u.password = senha;
    u.pathname = '/compasso_teste';
    return u.toString();
  };

  const sup2 = new pg.Client({ connectionString: urlDb(base.username, base.password) });
  await sup2.connect();
  await sup2.query('revoke all on schema public from public');
  await sup2.query('grant all on schema public to compasso_owner');
  await sup2.query('grant usage on schema public to compasso_app');
  await sup2.end();

  const urlAdmin = urlDb('compasso_owner', SENHA_DONO);
  await migrar(urlAdmin);

  project.provide('urlAdmin', urlAdmin);
  project.provide('urlApp', urlDb('compasso_app', SENHA_APP));

  return parar;
}

declare module 'vitest' {
  export interface ProvidedContext {
    urlAdmin: string;
    urlApp: string;
  }
}
