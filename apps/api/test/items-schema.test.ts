import { novoId } from '@compasso/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ambiente } from './ajuda';

/**
 * Cada invariante "garantido pelo banco" da especificação §5 tem um teste que prova a rejeição.
 * Inserção direta com o papel dono — sem API, sem validação do core — para provar que o banco
 * sozinho recusa, como numa edição manual no psql.
 */
let env: Awaited<ReturnType<typeof ambiente>>;
let dono: pg.Client;
let userId: string;

beforeAll(async () => {
  env = await ambiente();
  dono = new pg.Client({ connectionString: inject('urlAdmin') });
  await dono.connect();
  userId = (await env.admin.criarConta('Invariantes')).userId;
});
afterAll(async () => {
  await dono.end();
  await env.fechar();
});

type Linha = Record<string, unknown>;
const base = (): Linha => ({
  id: novoId(),
  user_id: userId,
  title: 'x',
  kind: 'event',
  start_at: '2026-10-01T12:00:00Z',
  timezone: 'America/Sao_Paulo',
  created_at: new Date(),
  updated_at: new Date(),
});

async function inserir(linha: Linha) {
  const cols = Object.keys(linha);
  const vals = Object.values(linha);
  await dono.query(
    `insert into items (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    vals,
  );
}

describe('CHECKs de items', () => {
  it('evento puro e tarefa pontuável válidos são aceitos', async () => {
    await inserir(base());
    await inserir({
      ...base(),
      kind: 'task',
      start_at: null,
      due_at: '2026-10-01T12:00:00Z',
      effort: 5,
      primary_attribute: 'corpo',
      secondary_attribute: 'mente',
    });
  });

  it.each<[string, Linha, RegExp]>([
    ['kind desconhecido', { kind: 'nota' }, /items_kind_check/],
    ['status desconhecido', { status: 'cancelado' }, /items_status_check/],
    ['esforço fora da escala', { effort: 4, primary_attribute: 'corpo' }, /items_effort_check/],
    ['atributo desconhecido', { effort: 1, primary_attribute: 'saude' }, /primary_attribute_check/],
    [
      'tarefa com início/fim',
      { kind: 'task', effort: 1, primary_attribute: 'casa' },
      /items_task_campos_check/,
    ],
    [
      'tarefa sem esforço',
      { kind: 'task', start_at: null, due_at: '2026-10-01T12:00:00Z' },
      /items_task_campos_check/,
    ],
    ['evento com prazo', { due_at: '2026-10-01T12:00:00Z' }, /items_event_campos_check/],
    ['evento sem início', { start_at: null }, /items_event_campos_check/],
    ['fim antes do início', { end_at: '2026-09-01T00:00:00Z' }, /items_intervalo_check/],
    ['esforço sem atributo', { effort: 2 }, /items_pontua_check/],
    ['atributo sem esforço', { primary_attribute: 'corpo' }, /items_pontua_check/],
    [
      'secundário igual ao principal',
      { effort: 2, primary_attribute: 'corpo', secondary_attribute: 'corpo' },
      /items_secundario_check/,
    ],
    ['secundário sem principal', { secondary_attribute: 'corpo' }, /items_secundario_check/],
    ['fuso vazio', { timezone: '' }, /items_timezone_check/],
    ['adiamentos negativos', { postpone_count: -1 }, /items_postpone_count_check/],
    ['dono inexistente', { user_id: novoId() }, /items_user_id_users_id_fk/],
  ])('%s é recusado pelo banco', async (_nome, extra, restricao) => {
    await expect(inserir({ ...base(), ...extra })).rejects.toThrow(restricao);
  });

  it('server_updated_at é sempre o relógio do servidor, mesmo se enviado', async () => {
    const linha: Linha = { ...base(), server_updated_at: '2000-01-01T00:00:00Z' };
    await inserir(linha);
    const r = await dono.query('select server_updated_at from items where id = $1', [linha.id]);
    expect(r.rows[0].server_updated_at.getFullYear()).toBeGreaterThan(2000);
  });
});
