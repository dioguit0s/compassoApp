/**
 * Publica o bundle JS como atualização OTA (ADR-0013). Roda no runner do homeserver a cada push
 * na main que mexa no app (.github/workflows/app.yml), mas funciona igual à mão:
 *
 *   RELEASES_DIR=./releases node apps/mobile/scripts/ota.mjs
 *
 * Só publica para o runtime (fingerprint nativo) do APK publicado. Se o commit mudou algo nativo,
 * o bundle não roda no APK que os amigos têm: pula e avisa para gerar o APK (apk:publicar).
 *
 * Cada publicação grava também a novidade dela em releases/novidades/ (ADR-0014): os trailers
 * `Novidade:` dos commits do app desde a publicação anterior. Precisa do histórico (no workflow,
 * checkout com fetch-depth 0).
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDoInstante, novidadesDosCommits, ultimaDaLista } from './novidades.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const releases = resolve(process.env.RELEASES_DIR || join(homedir(), 'compasso', 'releases'));
const MANTER_POR_RUNTIME = 5;

/** Resumo do job no GitHub (e no console). */
function resumo(texto) {
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);
}

function rodar(comando, args) {
  const r = spawnSync(comando, args, {
    cwd: raiz,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`${comando} ${args.join(' ')} saiu com ${r.status}`);
  return r.stdout;
}

/** Leitura para todos (a API roda com outro usuário no container): arquivos a+r, pastas a+rx. */
function liberarLeitura(caminho) {
  const st = statSync(caminho);
  chmodSync(caminho, st.mode | (st.isDirectory() ? 0o555 : 0o444));
  if (st.isDirectory()) for (const n of readdirSync(caminho)) liberarLeitura(join(caminho, n));
}

const PUBLICACAO = /^\d{14}-[0-9a-f]{7,40}$/;

function publicacoes(pasta) {
  return existsSync(pasta)
    ? readdirSync(pasta)
        .filter((n) => PUBLICACAO.test(n))
        .sort()
    : [];
}

// --- runtime ---
const runtime = JSON.parse(
  rodar('npx', ['expo-updates', 'fingerprint:generate', '--platform', 'android']),
).hash;

let apk = null;
try {
  apk = JSON.parse(readFileSync(join(releases, 'android', 'android.json'), 'utf8'));
} catch {
  // nenhum APK publicado ainda
}
if (!apk) {
  resumo(
    '### OTA não publicado\nNenhum APK publicado ainda: rode `npm run apk:publicar` primeiro.',
  );
  process.exit(0);
}
if (apk.runtimeVersion !== runtime) {
  resumo(
    [
      '### OTA não publicado: mudança nativa',
      `O runtime deste commit é \`${runtime}\`, e o do APK publicado (${apk.versionName}) é ` +
        `\`${apk.runtimeVersion}\`. O bundle não rodaria no app dos amigos.`,
      'Gere e publique o APK: `npm run apk:publicar -w @compasso/mobile -- --notas "..."`.',
    ].join('\n\n'),
  );
  process.exit(0);
}

// --- export ---
/** Exporta e publica; devolve a linha de resumo. */
function publicar(temp) {
  const saida = join(temp, 'export');
  rodar('npx', ['expo', 'export', '--platform', 'android', '--output-dir', saida]);
  writeFileSync(
    join(saida, 'expoConfig.json'),
    rodar('npx', ['expo', 'config', '--type', 'public', '--json']),
  );

  const pastaRuntime = join(releases, 'ota', runtime);
  const ultima = publicacoes(pastaRuntime).at(-1);
  // Mesmo bundle da última publicação (push que não mudou o que vai no app): nada a fazer. A API
  // daria o mesmo id de qualquer jeito, mas não vale uma pasta nova.
  if (
    ultima &&
    readFileSync(join(pastaRuntime, ultima, 'metadata.json'), 'utf8') ===
      readFileSync(join(saida, 'metadata.json'), 'utf8')
  ) {
    return `### OTA sem mudança\n\nO bundle é o mesmo de \`${ultima}\`.`;
  }

  const instante = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const sha = process.env.GITHUB_SHA || rodar('git', ['rev-parse', 'HEAD']).trim();
  const commit = sha.slice(0, 12);
  const nome = `${instante}-${commit}`;

  // Novidades antes de copiar: se o git falhar, nada vai ao ar pela metade.
  const pastaNovidades = join(releases, 'novidades');
  const nomesNovidades = existsSync(pastaNovidades) ? readdirSync(pastaNovidades) : [];
  const desde = ultimaDaLista(nomesNovidades, (n) => readFileSync(join(pastaNovidades, n), 'utf8'));
  const itens = novidadesDosCommits(raiz, desde, sha);
  mkdirSync(pastaRuntime, { recursive: true });
  // Copia com nome que a API ignora e renomeia no fim: nunca serve uma publicação pela metade.
  const provisoria = join(pastaRuntime, `.tmp-${nome}`);
  cpSync(saida, provisoria, { recursive: true });
  // A pasta raiz também: se o runner a criou antes do deploy.sh, nasceu com o umask dele.
  chmodSync(releases, statSync(releases).mode | 0o555);
  liberarLeitura(join(releases, 'ota'));
  renameSync(provisoria, join(pastaRuntime, nome));

  // A novidade entra depois do bundle: o site nunca anuncia o que o app ainda não pode baixar.
  // Grava mesmo sem itens, para a próxima publicação saber de que commit partir.
  mkdirSync(pastaNovidades, { recursive: true });
  for (const n of readdirSync(pastaNovidades).filter((n) => n.startsWith('.tmp-'))) {
    rmSync(join(pastaNovidades, n), { force: true });
  }
  const arquivoNovidade = `${instante}-ota-${commit}.json`;
  const novidadeProvisoria = join(pastaNovidades, `.tmp-${arquivoNovidade}`);
  writeFileSync(
    novidadeProvisoria,
    `${JSON.stringify(
      {
        tipo: 'ota',
        publicadoEm: isoDoInstante(instante),
        versao: apk.versionName,
        versionCode: apk.versionCode,
        runtime,
        commit: sha,
        itens,
      },
      null,
      2,
    )}\n`,
  );
  chmodSync(pastaNovidades, statSync(pastaNovidades).mode | 0o555);
  chmodSync(novidadeProvisoria, 0o644);
  renameSync(novidadeProvisoria, join(pastaNovidades, arquivoNovidade));

  // --- limpeza ---
  for (const outro of readdirSync(join(releases, 'ota'))) {
    const pasta = join(releases, 'ota', outro);
    if (!statSync(pasta).isDirectory()) continue;
    // Cópias provisórias de um job que morreu antes do rename (os jobs não rodam em paralelo,
    // então nenhuma está em uso agora).
    for (const n of readdirSync(pasta).filter((n) => n.startsWith('.tmp-'))) {
      rmSync(join(pasta, n), { recursive: true, force: true });
    }
    // Runtime atual: as 5 mais recentes, para o ota:reverter. Runtimes de APKs antigos não
    // recebem mais nada, mas a última publicação fica: sem ela, a API mandaria quem ainda não
    // instalou o APK novo de volta ao bundle original (rollBackToEmbedded).
    const manter = outro === runtime ? MANTER_POR_RUNTIME : 1;
    for (const velha of publicacoes(pasta).slice(0, -manter)) {
      rmSync(join(pasta, velha), { recursive: true, force: true });
    }
  }

  const novidades = itens.length
    ? `\n\nNovidades:\n${itens.map((i) => `- ${i}`).join('\n')}`
    : '\n\nSem novidade para o público (nenhum trailer `Novidade:` nos commits).';
  return (
    `### OTA publicado\n\n\`${nome}\` para o APK ${apk.versionName} (runtime \`${runtime.slice(0, 12)}\`). ` +
    'Os apps baixam na próxima abertura e aplicam na seguinte.' +
    novidades
  );
}

const temp = mkdtempSync(join(tmpdir(), 'compasso-ota-'));
try {
  resumo(publicar(temp));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
