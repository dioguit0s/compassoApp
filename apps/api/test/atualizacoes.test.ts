/** ADR-0013 — APK publicado no servidor e OTA própria (protocolo expo-updates v1). */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rotasDeAtualizacao } from '../src/atualizacoes';
import type { Config } from '../src/config';
import { config as base } from './ajuda';

const raiz = join(base.releasesDir, 'atualizacoes');
const config: Config = { ...base, releasesDir: raiz, urlPublica: 'https://compasso.exemplo' };
const app = new Hono().route('/', rotasDeAtualizacao(config));

const RUNTIME = 'a437fdc5da01471c5ed86a285d46ffb41146d84a';
const ANTIGA = '20260928120000-aaaaaaa';
const NOVA = '20260929153000-bbbbbbb';
const apk = Buffer.alloc(300_000, 7);

function escrever(caminho: string, dados: string | Buffer) {
  const p = join(raiz, caminho);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, dados);
}

/** Uma publicação como o `expo export` deixa: metadata.json, bundle e assets sem extensão. */
function publicar(nome: string, bundle: string) {
  const pasta = `ota/${RUNTIME}/${nome}`;
  escrever(`${pasta}/_expo/static/js/android/entry-1.hbc`, bundle);
  escrever(`${pasta}/assets/abc123`, Buffer.from('png falso'));
  escrever(
    `${pasta}/metadata.json`,
    JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          bundle: '_expo/static/js/android/entry-1.hbc',
          assets: [{ path: 'assets/abc123', ext: 'png' }],
        },
      },
    }),
  );
  escrever(`${pasta}/expoConfig.json`, JSON.stringify({ name: 'Compasso', slug: 'compasso' }));
}

beforeAll(() => {
  rmSync(raiz, { recursive: true, force: true });
  escrever('android/compasso-0.3.0-3.apk', apk);
  escrever(
    'android/android.json',
    JSON.stringify({
      versionCode: 3,
      versionName: '0.3.0',
      runtimeVersion: RUNTIME,
      arquivo: 'compasso-0.3.0-3.apk',
      md5: createHash('md5').update(apk).digest('hex'),
      tamanho: apk.length,
      notas: 'Atualizações automáticas.',
      minimoVersionCode: 1,
      publicadoEm: '2026-09-29T15:00:00.000Z',
    }),
  );
  publicar(ANTIGA, 'bundle antigo');
  publicar(NOVA, 'bundle novo');
  // Cópia em andamento do runner: nunca é servida.
  escrever(`ota/${RUNTIME}/.tmp-99/metadata.json`, '{');
});

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

const PEDIDO = {
  'expo-platform': 'android',
  'expo-runtime-version': RUNTIME,
  'expo-protocol-version': '1',
};

/** Extrai a única parte do multipart/mixed. */
async function parte(r: Response): Promise<{ nome: string; corpo: Record<string, unknown> }> {
  const fronteira = /boundary=(.+)$/.exec(r.headers.get('content-type') ?? '')?.[1];
  expect(fronteira).toBeTruthy();
  const texto = await r.text();
  const [, bloco] = texto.split(`--${fronteira}`);
  const [cabecalhos, json] = bloco!.split('\r\n\r\n');
  return {
    nome: /name="(\w+)"/.exec(cabecalhos!)![1]!,
    corpo: JSON.parse(json!.trim()) as Record<string, unknown>,
  };
}

describe('APK (fase A)', () => {
  it('GET /app/android devolve o manifesto com URL absoluta, sem cache', async () => {
    const r = await app.request('/app/android');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toMatchObject({
      versionCode: 3,
      minimoVersionCode: 1,
      tamanho: apk.length,
      url: 'https://compasso.exemplo/app/android/compasso-0.3.0-3.apk',
    });
  });

  it('baixa o APK inteiro, com tipo e tamanho', async () => {
    const r = await app.request('/app/android/compasso-0.3.0-3.apk');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(r.headers.get('content-length')).toBe(String(apk.length));
    expect(Buffer.from(await r.arrayBuffer()).equals(apk)).toBe(true);
  });

  it('nome fora do padrão, APK inexistente ou traversal dão 404', async () => {
    for (const caminho of [
      '/app/android/android.json',
      '/app/android/compasso-9.9.9-99.apk',
      '/app/android/..%2Fandroid.json',
      '/app/android/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
    ]) {
      expect((await app.request(caminho)).status, caminho).toBe(404);
    }
  });

  it('sem APK publicado, 404', async () => {
    const vazio = new Hono().route(
      '/',
      rotasDeAtualizacao({ ...config, releasesDir: join(raiz, 'nao-existe') }),
    );
    expect((await vazio.request('/app/android')).status).toBe(404);
  });
});

describe('OTA (fase B, protocolo expo-updates v1)', () => {
  it('manifesto da publicação mais recente, com hashes do conteúdo', async () => {
    const r = await app.request('/updates/manifest', { headers: PEDIDO });
    expect(r.status).toBe(200);
    expect(r.headers.get('expo-protocol-version')).toBe('1');
    expect(r.headers.get('expo-sfv-version')).toBe('0');
    const { nome, corpo } = await parte(r);
    expect(nome).toBe('manifest');
    const raizAssets = `https://compasso.exemplo/updates/assets/${RUNTIME}/${NOVA}`;
    expect(corpo).toMatchObject({
      runtimeVersion: RUNTIME,
      createdAt: '2026-09-29T15:30:00.000Z',
      launchAsset: {
        hash: createHash('sha256').update('bundle novo').digest('base64url'),
        key: createHash('md5').update('bundle novo').digest('hex'),
        contentType: 'application/javascript',
        fileExtension: '.bundle',
        url: `${raizAssets}/_expo/static/js/android/entry-1.hbc`,
      },
      assets: [
        {
          contentType: 'image/png',
          fileExtension: '.png',
          url: `${raizAssets}/assets/abc123`,
        },
      ],
      extra: { expoClient: { name: 'Compasso' } },
    });
    expect(corpo.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // O asset anunciado é servido, e o conteúdo bate com o hash.
    const bundle = await app.request(
      `/updates/assets/${RUNTIME}/${NOVA}/_expo/static/js/android/entry-1.hbc`,
    );
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toBe('bundle novo');
  });

  it('quem já está na publicação mais recente recebe noUpdateAvailable', async () => {
    const { corpo } = await parte(await app.request('/updates/manifest', { headers: PEDIDO }));
    const r = await app.request('/updates/manifest', {
      headers: { ...PEDIDO, 'expo-current-update-id': corpo.id as string },
    });
    expect(await parte(r)).toEqual({ nome: 'directive', corpo: { type: 'noUpdateAvailable' } });
  });

  it('runtime sem publicação (APK de outra versão nativa) recebe noUpdateAvailable', async () => {
    const r = await app.request('/updates/manifest', {
      headers: { ...PEDIDO, 'expo-runtime-version': 'outro-runtime' },
    });
    expect(await parte(r)).toEqual({ nome: 'directive', corpo: { type: 'noUpdateAvailable' } });
    const v0 = await app.request('/updates/manifest', {
      headers: { ...PEDIDO, 'expo-runtime-version': 'outro-runtime', 'expo-protocol-version': '0' },
    });
    expect(v0.status).toBe(204);
  });

  it('sem OTA no ar, quem roda um baixado volta ao bundle do APK', async () => {
    const r = await app.request('/updates/manifest', {
      headers: {
        ...PEDIDO,
        'expo-runtime-version': 'outro-runtime',
        'expo-current-update-id': 'aaaaaaaa-0000-0000-0000-000000000000',
        'expo-embedded-update-id': 'bbbbbbbb-0000-0000-0000-000000000000',
      },
    });
    const { nome, corpo } = await parte(r);
    expect(nome).toBe('directive');
    expect(corpo).toMatchObject({ type: 'rollBackToEmbedded' });
    // Já no bundle do APK: nada a fazer.
    const noApk = await app.request('/updates/manifest', {
      headers: {
        ...PEDIDO,
        'expo-runtime-version': 'outro-runtime',
        'expo-current-update-id': 'bbbbbbbb-0000-0000-0000-000000000000',
        'expo-embedded-update-id': 'bbbbbbbb-0000-0000-0000-000000000000',
      },
    });
    expect((await parte(noApk)).corpo).toEqual({ type: 'noUpdateAvailable' });
  });

  it('republicar o mesmo bundle em pasta nova (reverter) gera id novo', async () => {
    const antes = await parte(await app.request('/updates/manifest', { headers: PEDIDO }));
    publicar('20260929180000-aaaaaaa', 'bundle antigo');
    const depois = await parte(await app.request('/updates/manifest', { headers: PEDIDO }));
    expect(depois.corpo.id).not.toBe(antes.corpo.id);
    expect(depois.corpo.createdAt).toBe('2026-09-29T18:00:00.000Z');
    expect((depois.corpo.launchAsset as { hash: string }).hash).toBe(
      createHash('sha256').update('bundle antigo').digest('base64url'),
    );
  });

  it('sem plataforma android ou com runtime inválido, 400', async () => {
    for (const headers of [
      { 'expo-runtime-version': RUNTIME },
      { ...PEDIDO, 'expo-platform': 'ios' },
      { ...PEDIDO, 'expo-runtime-version': '../android' },
    ]) {
      expect((await app.request('/updates/manifest', { headers })).status).toBe(400);
    }
  });

  it('assets fora do padrão ou fora da publicação dão 404', async () => {
    for (const caminho of [
      `/updates/assets/${RUNTIME}/${NOVA}/metadata.json.nao`,
      `/updates/assets/${RUNTIME}/.tmp-99/metadata.json`,
      `/updates/assets/${RUNTIME}/${NOVA}/..%2F${ANTIGA}%2Fmetadata.json`,
      `/updates/assets/${RUNTIME}/${NOVA}/assets%2F..%2F..%2F..%2F..%2Fandroid%2Fandroid.json`,
      `/updates/assets/..%2F..%2Fandroid/${NOVA}/compasso-0.3.0-3.apk`,
    ]) {
      expect((await app.request(caminho)).status, caminho).toBe(404);
    }
  });
});
