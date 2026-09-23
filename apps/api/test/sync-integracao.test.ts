/**
 * Os quatro cenários de sincronização do roadmap (F1) com dois clients de verdade: o mesmo
 * `RepositorioLocal` e o mesmo `MotorDeSync` do app, sobre SQLite em memória (better-sqlite3)
 * migrado com as migrações do app, contra a API e um PostgreSQL reais.
 */
import { MotorDeSync, type RespostaPull, type RespostaPush, type Transporte } from '@compasso/core';
import { RepositorioLocal } from '@compasso/core/local';
import * as schemaLocal from '@compasso/core/local';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ambiente, comToken } from './ajuda';

const MIGRACOES_APP = fileURLToPath(new URL('../../mobile/drizzle', import.meta.url));
const DIA = 86_400_000;

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

class SemRede extends Error {}

function criarCliente(token: string, inicio = Date.now()) {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, schema: schemaLocal, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRACOES_APP });

  const cliente = {
    /** Relógio do aparelho, controlado pelo teste. */
    relogio: inicio,
    online: false,
    /** Chamado com o push já enviado e antes de a resposta voltar. */
    duranteOPush: null as null | (() => void),
    /** Simula resposta do push perdida: o servidor grava, o client não fica sabendo. */
    perderRespostaDoPush: false,
    pushes: 0,
    repo: null as unknown as RepositorioLocal,
    motor: null as unknown as MotorDeSync,
    tempo(ms: number) {
      cliente.relogio += ms;
    },
  };
  const agora = () => cliente.relogio;

  const transporte: Transporte = {
    async push(itens) {
      if (!cliente.online) throw new SemRede();
      cliente.pushes++;
      const r = await env.app.request(
        '/sync/push',
        comToken(token, { method: 'POST', body: JSON.stringify({ itens }) }),
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
      const r = await env.app.request(`/sync/pull${q}`, comToken(token));
      if (!r.ok) throw new Error(`pull ${r.status}`);
      return (await r.json()) as RespostaPull;
    },
  };
  cliente.repo = new RepositorioLocal(db, agora);
  cliente.motor = new MotorDeSync(cliente.repo, transporte, agora);
  return cliente;
}

function sqliteDe(c: ReturnType<typeof criarCliente>): Database.Database {
  return (c.repo as unknown as { db: { $client: Database.Database } }).db.$client;
}

/** Linhas fisicamente no SQLite do client, tombstones incluídos. */
function fisicos(c: ReturnType<typeof criarCliente>): string[] {
  return (sqliteDe(c).prepare('select id from items').all() as { id: string }[]).map((l) => l.id);
}

async function doisAparelhos(nome: string) {
  const { userId, token } = await env.admin.criarConta(nome);
  const token2 = await env.admin.emitirToken(userId, 'segundo aparelho');
  return { userId, a: criarCliente(token), b: criarCliente(token2) };
}

async function linhasNoServidor(userId: string) {
  const r = await dono.query(
    'select id, title, deleted_at from items where user_id = $1 order by id',
    [userId],
  );
  return r.rows as { id: string; title: string; deleted_at: Date | null }[];
}

const novoEvento = (titulo: string) => ({
  title: titulo,
  notes: null,
  kind: 'event' as const,
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
  recurrenceEndsAt: null,
  completedAt: null,
  reminderMinutesBefore: 30,
});

describe('cenário 1 — criar offline → sincronizar', () => {
  it('o item chega ao servidor e ao outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 1');
    const item = a.repo.criar(novoEvento('Consulta'));
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    expect(a.repo.sujos().map((s) => s.id)).toEqual([item.id]);

    a.online = true;
    await a.motor.sincronizar();
    expect(a.repo.sujos()).toEqual([]);
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([item.id]);

    b.online = true;
    await b.motor.sincronizar();
    expect(b.repo.listar().map((i) => [i.id, i.title])).toEqual([[item.id, 'Consulta']]);
  });

  it('roteiro do critério de saída: 3 criados, 1 editado, 1 excluído offline', async () => {
    const { userId, a } = await doisAparelhos('Roteiro F1');
    const [x, y, z] = ['X', 'Y', 'Z'].map((t) => a.repo.criar(novoEvento(t)));
    a.tempo(1000);
    a.repo.editar(y!.id, { title: 'Y editado' });
    a.repo.excluir(z!.id);
    a.online = true;
    await a.motor.sincronizar();

    const servidor = await linhasNoServidor(userId);
    expect(servidor).toHaveLength(3);
    const porId = new Map(servidor.map((l) => [l.id, l]));
    expect(porId.get(x!.id)).toMatchObject({ title: 'X', deleted_at: null });
    expect(porId.get(y!.id)).toMatchObject({ title: 'Y editado', deleted_at: null });
    expect(porId.get(z!.id)!.deleted_at).not.toBeNull();
  });
});

describe('cenário 2 — mesmo item editado nos dois clients offline', () => {
  it.each([
    ['A mais recente, A sincroniza primeiro', 'a', ['a', 'b']],
    ['A mais recente, B sincroniza primeiro', 'a', ['b', 'a']],
    ['B mais recente, A sincroniza primeiro', 'b', ['a', 'b']],
    ['B mais recente, B sincroniza primeiro', 'b', ['b', 'a']],
  ] as const)('%s → os dois convergem para a escrita mais recente', async (_n, vencedor, ordem) => {
    const { userId, a, b } = await doisAparelhos(`Cenário 2 ${vencedor} ${ordem.join('')}`);
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('original'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    a.online = b.online = false;

    const c = { a, b };
    const perdedor = vencedor === 'a' ? 'b' : 'a';
    c[perdedor].tempo(1_000);
    c[perdedor].repo.editar(item.id, { title: `edição de ${perdedor}` });
    c[vencedor].tempo(5_000);
    c[vencedor].repo.editar(item.id, { title: `edição de ${vencedor}` });

    a.online = b.online = true;
    for (const quem of ordem) await c[quem].motor.sincronizar();
    // Uma segunda rodada leva a versão final a quem sincronizou primeiro.
    for (const quem of ordem) await c[quem].motor.sincronizar();

    const esperado = `edição de ${vencedor}`;
    expect(a.repo.obter(item.id)!.title).toBe(esperado);
    expect(b.repo.obter(item.id)!.title).toBe(esperado);
    expect((await linhasNoServidor(userId))[0]!.title).toBe(esperado);
    expect(a.repo.sujos()).toEqual([]);
    expect(b.repo.sujos()).toEqual([]);
  });
});

describe('cenário 3 — excluir de um lado não ressuscita do outro', () => {
  it('cópia antiga e limpa no outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 3 limpo');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('vai sumir'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();

    a.tempo(1000);
    a.repo.excluir(item.id);
    await b.motor.sincronizar(); // B sincroniza antes de saber da exclusão
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    await a.motor.sincronizar();

    expect(a.repo.listar()).toEqual([]);
    expect(b.repo.listar()).toEqual([]);
    expect((await linhasNoServidor(userId))[0]!.deleted_at).not.toBeNull();
  });

  it('cópia antiga editada offline antes da exclusão no outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 3 sujo');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('vai sumir'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    a.online = b.online = false;

    b.tempo(1000);
    b.repo.editar(item.id, { title: 'edição antiga' });
    a.tempo(5000);
    a.repo.excluir(item.id);

    a.online = true;
    await a.motor.sincronizar();
    b.online = true;
    await b.motor.sincronizar();
    await a.motor.sincronizar();

    expect(a.repo.listar()).toEqual([]);
    expect(b.repo.listar()).toEqual([]);
    const [linha] = await linhasNoServidor(userId);
    expect(linha!.deleted_at).not.toBeNull();
    expect(linha!.title).toBe('vai sumir');
  });
});

describe('cenário 4 — push repetido não duplica', () => {
  it('resposta do push perdida: o retry não cria segunda linha', async () => {
    const { userId, a } = await doisAparelhos('Cenário 4');
    a.online = true;
    a.perderRespostaDoPush = true;
    const item = a.repo.criar(novoEvento('uma vez só'));
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    a.perderRespostaDoPush = false;
    await a.motor.sincronizar();

    expect(a.pushes).toBe(3);
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([item.id]);
    expect(a.repo.listar()).toHaveLength(1);
    expect(a.repo.sujos()).toEqual([]);
  });
});

describe('motor de sync', () => {
  it('edição feita com o push em voo não se perde', async () => {
    const { userId, a } = await doisAparelhos('Push em voo');
    a.online = true;
    const item = a.repo.criar(novoEvento('antes'));
    a.duranteOPush = () => {
      a.duranteOPush = null;
      a.tempo(10);
      a.repo.editar(item.id, { title: 'durante' });
    };
    await a.motor.sincronizar();
    expect(a.repo.sujos().map((s) => s.title)).toEqual(['durante']);
    expect(a.repo.obter(item.id)!.title).toBe('durante');

    await a.motor.sincronizar();
    expect(a.repo.sujos()).toEqual([]);
    expect((await linhasNoServidor(userId))[0]!.title).toBe('durante');
  });

  it('duas chamadas simultâneas rodam uma sincronização só', async () => {
    const { a } = await doisAparelhos('Concorrência');
    a.online = true;
    a.repo.criar(novoEvento('x'));
    const [r1, r2] = await Promise.all([a.motor.sincronizar(), a.motor.sincronizar()]);
    expect(r1).toBe(r2);
    expect(a.pushes).toBe(1);
  });

  it('purga local: tombstone confirmado de 31 dias sai, de 29 fica', async () => {
    const { a } = await doisAparelhos('Purga local');
    a.online = true;
    const t0 = a.relogio;
    const velho = a.repo.criar(novoEvento('velho'));
    const recente = a.repo.criar(novoEvento('recente'));
    a.repo.excluir(velho.id);
    a.tempo(2 * DIA);
    a.repo.excluir(recente.id);
    await a.motor.sincronizar();
    expect(fisicos(a).sort()).toEqual([velho.id, recente.id].sort());

    a.relogio = t0 + 31 * DIA; // velho excluído há 31 dias; recente, há 29
    await a.motor.sincronizar();
    expect(fisicos(a)).toEqual([recente.id]);
  });

  it('aparelho parado mais que a retenção remove o fantasma purgado no servidor', async () => {
    const { a, b } = await doisAparelhos('Fantasma');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('fantasma'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();

    // A exclui; o servidor purga antes de B voltar a sincronizar.
    a.repo.excluir(item.id);
    await a.motor.sincronizar();
    await dono.query(`update items set deleted_at = now() - interval '40 days' where id = $1`, [
      item.id,
    ]);
    await env.admin.purgarTombstones(30);

    b.tempo(40 * DIA);
    const r = await b.motor.sincronizar();
    expect(r.completo).toBe(true);
    expect(b.repo.listar()).toEqual([]);
  });

  it('linha suja inválida não trava a sincronização das outras', async () => {
    const { userId, a } = await doisAparelhos('Inválida');
    a.online = true;
    const boa = a.repo.criar(novoEvento('boa'));
    const ruim = a.repo.criar(novoEvento('ruim'));
    // Corrompe direto no SQLite, contornando o repositório (ex.: bug de versão antiga do app).
    sqliteDe(a).prepare(`update items set kind = 'task' where id = ?`).run(ruim.id);
    const r = await a.motor.sincronizar();
    expect(r.invalidos).toEqual([ruim.id]);
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([boa.id]);
  });
});

describe('repositório local (CRUD offline)', () => {
  it('criar, editar e excluir funcionam sem rede e marcam dirty', async () => {
    const { a } = await doisAparelhos('CRUD local');
    const item = a.repo.criar(novoEvento('novo'));
    expect(item.id).toMatch(/^[0-9a-f-]{8}-[0-9a-f]{4}-7/);
    expect(item.dirty).toBe(true);

    a.tempo(10);
    const editado = a.repo.editar(item.id, { title: 'editado', notes: 'levar exames' });
    expect(editado.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());

    a.repo.excluir(item.id);
    expect(a.repo.listar()).toEqual([]);
    expect(a.repo.obter(item.id)).toBeNull();
    const fisica = sqliteDe(a)
      .prepare('select deleted_at, dirty from items where id = ?')
      .get(item.id) as { deleted_at: number | null; dirty: number };
    expect(fisica.deleted_at).not.toBeNull();
    expect(fisica.dirty).toBe(1);
  });

  it('relógio do aparelho que volta no tempo não faz a edição perder para a anterior', async () => {
    const { a } = await doisAparelhos('Relógio volta');
    const item = a.repo.criar(novoEvento('x'));
    a.tempo(-60_000);
    const editado = a.repo.editar(item.id, { title: 'y' });
    expect(editado.updatedAt.getTime()).toBe(item.updatedAt.getTime() + 1);
  });

  it('recusa item que viola invariante, com motivo legível', async () => {
    const { a } = await doisAparelhos('Validação local');
    expect(() => a.repo.criar({ ...novoEvento('t'), kind: 'task' })).toThrow(
      /tarefa exige esforço/,
    );
    expect(() => a.repo.criar(novoEvento('   '))).toThrow(/título vazio/);
    const item = a.repo.criar(novoEvento('ok'));
    expect(() => a.repo.editar(item.id, { effort: 3 })).toThrow(/atributo principal/);
    expect(a.repo.obter(item.id)!.effort).toBeNull();
  });
});
