/** Página de download na raiz da API (lê o android.json do ADR-0013). */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { rotasDoSite } from '../src/site';
import { config as base } from './ajuda';

const raiz = join(base.releasesDir, 'site');
const config: Config = { ...base, releasesDir: raiz, urlPublica: 'https://compasso.exemplo' };
const app = new Hono().route('/', rotasDoSite(config));

function publicarApk(notas: string) {
  mkdirSync(join(raiz, 'android'), { recursive: true });
  writeFileSync(
    join(raiz, 'android', 'android.json'),
    JSON.stringify({
      versionCode: 3,
      versionName: '0.3.0',
      runtimeVersion: 'abc',
      arquivo: 'compasso-0.3.0-3.apk',
      md5: '0'.repeat(32),
      tamanho: 45_000_000,
      notas,
      minimoVersionCode: 1,
      publicadoEm: '2026-09-29T15:00:00.000Z',
    }),
  );
}

beforeEach(() => rmSync(raiz, { recursive: true, force: true }));
afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe('GET /', () => {
  it('mostra a versão publicada com o link do APK e o servidor para o cadastro', async () => {
    publicarApk('Atualizações automáticas.');
    const r = await app.request('/');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/^text\/html/);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).toContain('0.3.0');
    expect(html).toContain('href="/app/android/compasso-0.3.0-3.apk"');
    expect(html).toContain('29 de setembro de 2026');
    expect(html).toContain('42,9\u00a0MB');
    expect(html).toContain('Atualizações automáticas.');
    expect(html).toContain('<code>https://compasso.exemplo</code>');
  });

  it('escapa as notas do android.json', async () => {
    publicarApk('<script>alert(1)</script> & mais');
    const html = await (await app.request('/')).text();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; mais');
  });

  it('android.json incompleto conta como sem APK, sem derrubar a página', async () => {
    mkdirSync(join(raiz, 'android'), { recursive: true });
    writeFileSync(join(raiz, 'android', 'android.json'), '{"arquivo":"compasso-0.3.0-3.apk"}');
    const r = await app.request('/');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Ainda não há versão publicada');
  });

  it('sem APK publicado, avisa e não oferece download', async () => {
    const r = await app.request('/');
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Ainda não há versão publicada');
    expect(html).not.toContain('/app/android/');
  });
});

describe('GET /baixar', () => {
  it('redireciona para o APK mais recente', async () => {
    publicarApk('');
    const r = await app.request('/baixar');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(
      'https://compasso.exemplo/app/android/compasso-0.3.0-3.apk',
    );
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('sem APK publicado, 404', async () => {
    expect((await app.request('/baixar')).status).toBe(404);
  });
});
