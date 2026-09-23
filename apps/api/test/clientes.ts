/**
 * Clients simulados para os testes de integração: o mesmo `RepositorioLocal` e o mesmo
 * `MotorDeSync` do app, sobre SQLite em memória (better-sqlite3) migrado com as migrações do
 * app, falando com a API de verdade (`app.request`) sobre um PostgreSQL real.
 */
import { MotorDeSync, type RespostaPull, type RespostaPush, type Transporte } from '@compasso/core';
import { RepositorioLocal, type DadosItem } from '@compasso/core/local';
import * as schemaLocal from '@compasso/core/local';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, inject } from 'vitest';
import { ambiente, comToken } from './ajuda';

const MIGRACOES_APP = fileURLToPath(new URL('../../mobile/drizzle', import.meta.url));
export const DIA = 86_400_000;

export class SemRede extends Error {}

export type Cliente = ReturnType<ReturnType<typeof usarClientes>['criarCliente']>;

/** Registra beforeAll/afterAll do arquivo de teste e devolve as fábricas de clients. */
export function usarClientes() {
  const ctx = {} as { env: Awaited<ReturnType<typeof ambiente>>; dono: pg.Client };
  beforeAll(async () => {
    ctx.env = await ambiente();
    ctx.dono = new pg.Client({ connectionString: inject('urlAdmin') });
    await ctx.dono.connect();
  });
  afterAll(async () => {
    await ctx.dono.end();
    await ctx.env.fechar();
  });

  function criarCliente(token: string, inicio = Date.now()) {
    const sqlite = new Database(':memory:');
    const db = drizzle({ client: sqlite, schema: schemaLocal, casing: 'snake_case' });
    migrate(db, { migrationsFolder: MIGRACOES_APP });

    const cliente = {
      token,
      /** Relógio do aparelho, controlado pelo teste. */
      relogio: inicio,
      online: false,
      /** Chamado com o push já enviado e antes de a resposta voltar. */
      duranteOPush: null as null | (() => void),
      /** Simula resposta do push perdida: o servidor grava, o client não fica sabendo. */
      perderRespostaDoPush: false,
      pushes: 0,
      sqlite,
      repo: null as unknown as RepositorioLocal,
      motor: null as unknown as MotorDeSync,
      tempo(ms: number) {
        cliente.relogio += ms;
      },
    };
    const agora = () => cliente.relogio;

    const transporte: Transporte = {
      async push(lote) {
        if (!cliente.online) throw new SemRede();
        cliente.pushes++;
        const r = await ctx.env.app.request(
          '/sync/push',
          comToken(token, { method: 'POST', body: JSON.stringify(lote) }),
        );
        if (!r.ok) throw new Error(`push ${r.status}: ${await r.text()}`);
        const corpo = (await r.json()) as RespostaPush;
        cliente.duranteOPush?.();
        if (cliente.perderRespostaDoPush) throw new SemRede();
        return corpo;
      },
      async pull(cursor) {
        if (!cliente.online) throw new SemRede();
        const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const r = await ctx.env.app.request(`/sync/pull${q}`, comToken(token));
        if (!r.ok) throw new Error(`pull ${r.status}`);
        return (await r.json()) as RespostaPull;
      },
    };
    cliente.repo = new RepositorioLocal(db, agora);
    cliente.motor = new MotorDeSync(cliente.repo, transporte, agora);
    return cliente;
  }

  /** Linhas fisicamente no SQLite do client, tombstones incluídos. */
  function fisicos(c: Cliente): string[] {
    return (c.sqlite.prepare('select id from items').all() as { id: string }[]).map((l) => l.id);
  }

  async function doisAparelhos(nome: string) {
    const { userId, token } = await ctx.env.admin.criarConta(nome);
    const token2 = await ctx.env.admin.emitirToken(userId, 'segundo aparelho');
    return { userId, token, a: criarCliente(token), b: criarCliente(token2) };
  }

  async function linhasNoServidor(userId: string) {
    const r = await ctx.dono.query(
      'select id, title, deleted_at from items where user_id = $1 order by id',
      [userId],
    );
    return r.rows as { id: string; title: string; deleted_at: Date | null }[];
  }

  return { ctx, criarCliente, fisicos, doisAparelhos, linhasNoServidor };
}

export const novoEvento = (titulo: string): DadosItem => ({
  title: titulo,
  notes: null,
  kind: 'event',
  effort: null,
  effortLockedAt: null,
  primaryAttribute: null,
  secondaryAttribute: null,
  dueAt: null,
  startAt: new Date('2026-10-05T13:00:00Z'),
  endAt: null,
  allDay: false,
  timezone: 'America/Sao_Paulo',
  rrule: null,
  sourceUid: null,
  completedAt: null,
  reminderMinutesBefore: 30,
});
