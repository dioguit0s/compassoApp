/** Leitura dos trailers `Novidade:` (ADR-0014). Roda com `node --test`. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  ARQUIVO_NOVIDADE,
  extrairNovidades,
  instanteDe,
  isoDoInstante,
  juntarNovidades,
  novidadesDosCommits,
} from './novidades.mjs';

describe('extrairNovidades', () => {
  it('lê os trailers na ordem e ignora o "-"', () => {
    const msg = [
      'feat: captura com data livre',
      '',
      'Corpo explicando o porquê.',
      '',
      'Novidade: Captura rápida aceita qualquer data',
      'novidade:   Tela de novidades em Configurações  ',
      'Novidade: -',
      'Co-Authored-By: Alguém <a@b.c>',
    ].join('\n');
    assert.deepEqual(extrairNovidades(msg), [
      'Captura rápida aceita qualquer data',
      'Tela de novidades em Configurações',
    ]);
  });

  it('só conta a linha que começa com o trailer', () => {
    assert.deepEqual(extrairNovidades('fix: x\n\nVer a Novidade: y no corpo'), []);
    assert.deepEqual(extrairNovidades('Novidade:'), []);
  });
});

describe('juntarNovidades', () => {
  it('tira repetições sem diferenciar maiúsculas', () => {
    assert.deepEqual(juntarNovidades(['Novidade: A\nNovidade: B', 'Novidade: a\nNovidade: C']), [
      'A',
      'B',
      'C',
    ]);
  });
});

describe('instantes', () => {
  it('ida e volta no formato das publicações', () => {
    const i = instanteDe(new Date('2026-10-06T14:05:09.123Z'));
    assert.equal(i, '20261006140509');
    assert.equal(isoDoInstante(i), '2026-10-06T14:05:09.000Z');
    assert.ok(ARQUIVO_NOVIDADE.test(`${i}-ota-5aeda41abcde.json`));
    assert.ok(ARQUIVO_NOVIDADE.test(`${i}-apk-4.json`));
    assert.ok(!ARQUIVO_NOVIDADE.test(`${i}-ota-../x.json`));
  });
});

describe('novidadesDosCommits', () => {
  const repo = mkdtempSync(join(tmpdir(), 'compasso-novidades-'));
  after(() => rmSync(repo, { recursive: true, force: true }));
  const g = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  const commit = (arquivo, mensagem) => {
    mkdirSync(join(repo, arquivo, '..'), { recursive: true });
    writeFileSync(join(repo, arquivo), mensagem);
    g('add', '-A');
    g('commit', '-q', '-m', mensagem);
    return g('rev-parse', 'HEAD');
  };

  const base = commit('apps/mobile/a.ts', 'feat: base\n\nNovidade: Antiga');
  commit('apps/mobile/b.ts', 'feat: um\n\nNovidade: Primeira');
  commit('apps/api/c.ts', 'feat: só na API\n\nNovidade: Não entra');
  commit('docs/d.md', 'docs: nada');
  commit('packages/core/e.ts', 'fix: core\n\nNovidade: Segunda\nNovidade: -');

  it('junta só os commits do app depois da publicação anterior', () => {
    assert.deepEqual(novidadesDosCommits(repo, base), ['Primeira', 'Segunda']);
  });

  it('sem publicação anterior conhecida, só o último commit', () => {
    assert.deepEqual(novidadesDosCommits(repo, undefined), ['Segunda']);
    assert.deepEqual(novidadesDosCommits(repo, 'f'.repeat(40)), ['Segunda']);
  });
});
