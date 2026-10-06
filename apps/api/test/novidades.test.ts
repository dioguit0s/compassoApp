/** ADR-0014 — novidades das publicações: JSON para o app, feed Atom e seção da página. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { LIMITE_DE_NOVIDADES, rotasDeNovidades } from '../src/novidades';
import { rotasDoSite } from '../src/site';
import { config as base } from './ajuda';

const raiz = join(base.releasesDir, 'novidades');
const config: Config = { ...base, releasesDir: raiz, urlPublica: 'https://compasso.exemplo' };
const app = new Hono().route('/', rotasDeNovidades(config)).route('/', rotasDoSite(config));

function novidade(nome: string, dados: unknown) {
  mkdirSync(join(raiz, 'novidades'), { recursive: true });
  writeFileSync(
    join(raiz, 'novidades', nome),
    typeof dados === 'string' ? dados : JSON.stringify(dados),
  );
}

function ota(instante: string, itens: unknown[], publicadoEm?: string) {
  const iso = `${instante.slice(0, 4)}-${instante.slice(4, 6)}-${instante.slice(6, 8)}T${instante.slice(8, 10)}:${instante.slice(10, 12)}:${instante.slice(12, 14)}.000Z`;
  novidade(`${instante}-ota-abc1234.json`, {
    tipo: 'ota',
    publicadoEm: publicadoEm ?? iso,
    versao: '0.3.0',
    versionCode: 3,
    runtime: 'r1',
    commit: 'abc1234',
    itens,
  });
}

function apk(instante: string, versao: string, versionCode: number, itens: string[]) {
  novidade(`${instante}-apk-${versionCode}.json`, {
    tipo: 'apk',
    publicadoEm: '2026-09-29T15:00:00.000Z',
    versao,
    versionCode,
    runtime: 'r1',
    commit: 'def5678',
    itens,
  });
}

beforeEach(() => rmSync(raiz, { recursive: true, force: true }));
afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe('GET /novidades.json', () => {
  it('sem pasta, lista vazia', async () => {
    const r = await app.request('/novidades.json');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ novidades: [] });
  });

  it('mais recentes primeiro, pulando as sem itens, as ilegíveis e as fora do formato', async () => {
    apk('20260929150000', '0.3.0', 3, ['Atualizações automáticas']);
    ota('20261001100000', ['  Captura com data livre ', '', 42]);
    ota('20261002100000', []);
    novidade('20261003100000-ota-quebrada.json', '{ não é json');
    novidade('.tmp-20261004100000-ota-abc.json', JSON.stringify({ tipo: 'ota', itens: ['x'] }));
    novidade('20261005100000-ota-xyz.json', { tipo: 'outro', publicadoEm: 'x', itens: ['y'] });

    const { novidades } = (await (await app.request('/novidades.json')).json()) as {
      novidades: { id: string; tipo: string; itens: string[]; versao: string }[];
    };
    expect(novidades.map((n) => n.id)).toEqual([
      '20261001100000-ota-abc1234',
      '20260929150000-apk-3',
    ]);
    expect(novidades[0]!.itens).toEqual(['Captura com data livre']);
    expect(novidades[1]).toMatchObject({ tipo: 'apk', versao: '0.3.0', versionCode: 3 });
  });

  it(`devolve no máximo ${LIMITE_DE_NOVIDADES}`, async () => {
    for (let i = 0; i < LIMITE_DE_NOVIDADES + 5; i++) {
      ota(`202610011000${String(i).padStart(2, '0')}`, [`item ${i}`]);
    }
    const { novidades } = (await (await app.request('/novidades.json')).json()) as {
      novidades: { itens: string[] }[];
    };
    expect(novidades).toHaveLength(LIMITE_DE_NOVIDADES);
    expect(novidades[0]!.itens).toEqual([`item ${LIMITE_DE_NOVIDADES + 4}`]);
  });
});

describe('GET /novidades.xml', () => {
  it('feed Atom com uma entrada por publicação e o texto escapado', async () => {
    ota('20261001100000', ['Data <livre> & mais']);
    apk('20260929150000', '0.3.0', 3, ['Atualizações automáticas']);
    const r = await app.request('/novidades.xml');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8');
    const xml = await r.text();
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<updated>2026-10-01T10:00:00.000Z</updated>');
    expect(xml).toContain('<title>Atualização automática</title>');
    expect(xml).toContain('<title>Versão 0.3.0</title>');
    expect(xml).toContain('https://compasso.exemplo/#20261001100000-ota-abc1234');
    expect(xml).not.toContain('<livre>');
    expect(xml).toContain('Data &amp;lt;livre&amp;gt; &amp;amp; mais');
  });
});

describe('seção de novidades na página', () => {
  it('lista as publicações com etiqueta e data, e aponta o feed', async () => {
    ota('20261001100000', ['Captura com data livre', '<b>sem html</b>']);
    apk('20260929150000', '0.3.0', 3, ['Atualizações automáticas']);
    const html = await (await app.request('/')).text();
    expect(html).toContain('<h2>Novidades</h2>');
    expect(html).toContain('id="20261001100000-ota-abc1234"');
    expect(html).toContain('1 de outubro de 2026');
    expect(html).toContain('Chega sozinha');
    expect(html).toContain('Versão 0.3.0 · instale pelo app');
    expect(html).toContain('<li>Captura com data livre</li>');
    expect(html).toContain('&lt;b&gt;sem html&lt;/b&gt;');
    expect(html).toContain('href="/novidades.xml"');
    expect(html).toContain('rel="alternate" type="application/atom+xml"');
  });

  it('sem novidades, a página fica sem a seção', async () => {
    const html = await (await app.request('/')).text();
    expect(html).not.toContain('<h2>Novidades</h2>');
  });

  it('o cartão diz quando houve atualização automática depois do APK', async () => {
    mkdirSync(join(raiz, 'android'), { recursive: true });
    writeFileSync(
      join(raiz, 'android', 'android.json'),
      JSON.stringify({
        versionCode: 3,
        versionName: '0.3.0',
        runtimeVersion: 'r1',
        arquivo: 'compasso-0.3.0-3.apk',
        md5: '0'.repeat(32),
        tamanho: 45_000_000,
        notas: 'x',
        minimoVersionCode: 1,
        publicadoEm: '2026-09-29T15:00:00.000Z',
      }),
    );
    ota('20261006120000', ['Novidades no site']);
    const html = await (await app.request('/')).text();
    expect(html).toContain(
      'publicada em 29 de setembro de 2026 · atualizada em 6 de outubro de 2026',
    );
  });
});
