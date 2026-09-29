import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Hono, type Context } from 'hono';
import type { Config } from './config';

/**
 * Atualizações do app pelo próprio servidor (ADR-0013), sem loja e sem EAS. Tudo vem de arquivos
 * em `releasesDir`, que a API só lê:
 *
 *   android/android.json        APK atual, escrito pelo `apk:publicar` (máquina do autor)
 *   android/compasso-*.apk
 *   ota/<runtime>/<AAAAMMDDHHMMSS-commit>/   saída do `expo export`, escrita pelo runner
 *
 * Rotas públicas: quem está deslogado também precisa atualizar, e nada aqui é dado pessoal.
 */

export const ARQUIVO_APK = /^compasso-\d+\.\d+\.\d+-\d+\.apk$/;
const RUNTIME = /^[\w.-]{1,128}$/;
const PUBLICACAO = /^(\d{14})-[0-9a-f]{7,40}$/;
const CAMINHO_ASSET = /^(?!.*\.\.)[\w.\-/]{1,300}$/;

/** O que o `apk:publicar` grava em android/android.json. */
interface ApkPublicado {
  versionCode: number;
  versionName: string;
  runtimeVersion: string;
  arquivo: string;
  md5: string;
  tamanho: number;
  notas: string;
  minimoVersionCode: number;
  publicadoEm: string;
}

/** Saída do `expo export` (dist/metadata.json). */
interface MetadataDoExport {
  fileMetadata: {
    android?: { bundle: string; assets: { path: string; ext: string }[] };
  };
}

interface AssetDoManifesto {
  hash: string;
  key: string;
  contentType: string;
  fileExtension: string;
  /** Relativo à publicação; a URL absoluta é montada em cada pedido. */
  caminho: string;
}

interface Publicacao {
  id: string;
  createdAt: string;
  launchAsset: AssetDoManifesto;
  assets: AssetDoManifesto[];
  expoClient: unknown;
}

const TIPOS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  json: 'application/json',
  xml: 'application/xml',
  js: 'application/javascript',
  hbc: 'application/javascript',
  bundle: 'application/javascript',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

function tipoDe(extensao: string): string {
  return TIPOS[extensao.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';
}

/** URL pública da API: em produção vem do ambiente (o túnel entrega HTTP à API). */
function base(c: Context, config: Config): string {
  return config.urlPublica ?? new URL(c.req.url).origin;
}

/** Caminho dentro de `raiz`, ou null se escapar dela (defesa extra além das regex). */
function dentro(raiz: string, ...partes: string[]): string | null {
  const r = resolve(raiz);
  const p = resolve(r, ...partes);
  return p.startsWith(r + sep) ? p : null;
}

async function lerApkPublicado(config: Config): Promise<ApkPublicado | null> {
  try {
    const bruto = await readFile(join(config.releasesDir, 'android', 'android.json'), 'utf8');
    return JSON.parse(bruto) as ApkPublicado;
  } catch {
    return null;
  }
}

/** Publicação mais recente de um runtime (o nome começa pelo instante, então ordena). */
async function ultimaPublicacao(config: Config, runtime: string): Promise<string | null> {
  const pasta = dentro(config.releasesDir, 'ota', runtime);
  if (!pasta) return null;
  try {
    const nomes = (await readdir(pasta)).filter((n) => PUBLICACAO.test(n)).sort();
    return nomes.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * UUID estável por publicação (conteúdo + nome da pasta). Reverter republica o bundle anterior
 * numa pasta nova: id e createdAt novos, e o app adota, porque o expo-updates roda a
 * atualização mais recente que tem.
 */
function uuidDe(dados: Buffer, nome: string): string {
  const h = createHash('sha256').update(dados).update(nome).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function instanteDe(nome: string): string {
  const d = PUBLICACAO.exec(nome)![1]!;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}.000Z`;
}

async function descreverAsset(
  pasta: string,
  caminho: string,
  extensao: string,
  contentType?: string,
): Promise<AssetDoManifesto> {
  const dados = await readFile(join(pasta, caminho));
  return {
    hash: createHash('sha256').update(dados).digest('base64url'),
    key: createHash('md5').update(dados).digest('hex'),
    contentType: contentType ?? tipoDe(extensao),
    fileExtension: `.${extensao.replace(/^\./, '')}`,
    caminho,
  };
}

/**
 * Lê uma publicação e calcula os hashes. Uma publicação nunca muda depois do rename atômico do
 * runner, então o resultado fica em cache pelo caminho.
 */
function carregador() {
  const cache = new Map<string, Promise<Publicacao>>();
  return (config: Config, runtime: string, nome: string): Promise<Publicacao> => {
    const pasta = join(config.releasesDir, 'ota', runtime, nome);
    let p = cache.get(pasta);
    if (!p) {
      p = (async () => {
        const bruto = await readFile(join(pasta, 'metadata.json'));
        const meta = JSON.parse(bruto.toString('utf8')) as MetadataDoExport;
        const android = meta.fileMetadata.android;
        if (!android) throw new Error(`publicação sem android: ${pasta}`);
        let expoClient: unknown = {};
        try {
          expoClient = JSON.parse(await readFile(join(pasta, 'expoConfig.json'), 'utf8'));
        } catch {
          // sem config pública: o expo-updates vive sem ela
        }
        return {
          id: uuidDe(bruto, nome),
          createdAt: instanteDe(nome),
          launchAsset: await descreverAsset(
            pasta,
            android.bundle,
            'bundle',
            'application/javascript',
          ),
          assets: await Promise.all(
            android.assets.map((a) => descreverAsset(pasta, a.path, a.ext)),
          ),
          expoClient,
        };
      })();
      // Falha não fica em cache: a próxima tentativa lê de novo.
      p.catch(() => cache.delete(pasta));
      cache.set(pasta, p);
    }
    return p;
  };
}

/** Corpo multipart/mixed do protocolo expo-updates v1, com uma única parte. */
function multipart(nome: 'manifest' | 'directive', corpo: unknown) {
  const fronteira = `compasso-${randomUUID()}`;
  const texto =
    `--${fronteira}\r\n` +
    `content-type: application/json; charset=utf-8\r\n` +
    `content-disposition: form-data; name="${nome}"\r\n\r\n` +
    `${JSON.stringify(corpo)}\r\n` +
    `--${fronteira}--\r\n`;
  return { texto, tipo: `multipart/mixed; boundary=${fronteira}` };
}

export function rotasDeAtualizacao(config: Config) {
  const app = new Hono();
  const carregar = carregador();

  // --- APK (fase A) ---

  app.get('/app/android', async (c) => {
    const apk = await lerApkPublicado(config);
    if (!apk || !ARQUIVO_APK.test(apk.arquivo))
      return c.json({ erro: 'nenhum APK publicado' }, 404);
    return c.json({ ...apk, url: `${base(c, config)}/app/android/${apk.arquivo}` }, 200, {
      'cache-control': 'no-store',
    });
  });

  app.get('/app/android/:arquivo', async (c) => {
    const arquivo = c.req.param('arquivo');
    if (!ARQUIVO_APK.test(arquivo)) return c.notFound();
    const caminho = join(config.releasesDir, 'android', arquivo);
    let tamanho: number;
    try {
      tamanho = (await stat(caminho)).size;
    } catch {
      return c.notFound();
    }
    // Stream: um APK tem dezenas de MB, não cabe ler inteiro na memória a cada download.
    const corpo = Readable.toWeb(createReadStream(caminho)) as ReadableStream;
    return c.body(corpo, 200, {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': String(tamanho),
      'content-disposition': `attachment; filename="${arquivo}"`,
      // O nome traz versão e versionCode: nunca muda de conteúdo.
      'cache-control': 'public, max-age=31536000, immutable',
    });
  });

  // --- OTA (fase B), protocolo expo-updates v1 ---

  app.get('/updates/manifest', async (c) => {
    const plataforma = c.req.header('expo-platform');
    const runtime = c.req.header('expo-runtime-version');
    if (plataforma !== 'android') return c.json({ erro: 'expo-platform precisa ser android' }, 400);
    if (!runtime || !RUNTIME.test(runtime)) {
      return c.json({ erro: 'expo-runtime-version ausente ou inválido' }, 400);
    }
    const protocolo = Number(c.req.header('expo-protocol-version') ?? '0');
    const cabecalhos = {
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
    };
    const semAtualizacao = () => {
      // O protocolo 0 não tem diretivas: sem atualização, só não há manifesto.
      if (protocolo < 1) return c.body(null, 204, cabecalhos);
      const m = multipart('directive', { type: 'noUpdateAvailable' });
      return c.body(m.texto, 200, { ...cabecalhos, 'content-type': m.tipo });
    };

    const nome = await ultimaPublicacao(config, runtime);
    if (!nome) {
      // Nenhum OTA no ar para este runtime (todos revertidos): quem roda um baixado volta ao
      // bundle que veio no APK.
      const atual = c.req.header('expo-current-update-id');
      const embutido = c.req.header('expo-embedded-update-id');
      if (protocolo >= 1 && atual && embutido && atual !== embutido) {
        const m = multipart('directive', {
          type: 'rollBackToEmbedded',
          parameters: { commitTime: new Date().toISOString() },
        });
        return c.body(m.texto, 200, { ...cabecalhos, 'content-type': m.tipo });
      }
      return semAtualizacao();
    }
    const pub = await carregar(config, runtime, nome);
    if (c.req.header('expo-current-update-id') === pub.id) return semAtualizacao();

    const raiz = `${base(c, config)}/updates/assets/${runtime}/${nome}`;
    const comUrl = ({ caminho, ...a }: AssetDoManifesto) => ({ ...a, url: `${raiz}/${caminho}` });
    const m = multipart('manifest', {
      id: pub.id,
      createdAt: pub.createdAt,
      runtimeVersion: runtime,
      launchAsset: comUrl(pub.launchAsset),
      assets: pub.assets.map(comUrl),
      metadata: {},
      extra: { expoClient: pub.expoClient },
    });
    return c.body(m.texto, 200, { ...cabecalhos, 'content-type': m.tipo });
  });

  app.get('/updates/assets/:runtime/:publicacao/:caminho{.+}', async (c) => {
    const { runtime, publicacao, caminho } = c.req.param();
    if (!RUNTIME.test(runtime) || !PUBLICACAO.test(publicacao) || !CAMINHO_ASSET.test(caminho)) {
      return c.notFound();
    }
    const arquivo = dentro(config.releasesDir, 'ota', runtime, publicacao, caminho);
    if (!arquivo) return c.notFound();
    try {
      const dados = await readFile(arquivo);
      // Assets do export não trazem extensão no nome; o bundle traz .hbc/.js.
      const ext = extname(caminho);
      return c.body(dados, 200, {
        'content-type': ext ? tipoDe(ext) : 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      });
    } catch {
      return c.notFound();
    }
  });

  return app;
}
