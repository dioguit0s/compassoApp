/**
 * Gera o APK de release e publica no servidor (ADR-0013): o app dos amigos vê a versão nova na
 * próxima abertura e instala com um toque.
 *
 *   npm run apk:publicar -w @compasso/mobile -- --notas "O que mudou"
 *   npm run apk:publicar -w @compasso/mobile -- --notas "..." --minimo 5
 *
 * --minimo N: versionCode mínimo para continuar usando o app (atualização obrigatória). Sem ele,
 * mantém o do APK publicado antes.
 *
 * Roda na máquina do autor (onde está a chave de assinatura) e envia por SSH para o homeserver
 * (COMPASSO_SSH, padrão luna-dash; ver docs/deploy.md). Sempre só arm64-v8a.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const ssh = process.env.COMPASSO_SSH || 'luna-dash';
const REMOTO = '~/compasso/releases/android';

function falhar(msg) {
  console.error(`\nERRO: ${msg}`);
  process.exit(1);
}

/** Roda e devolve a saída; `herdar` mostra a saída ao vivo (build). */
function rodar(comando, args, { cwd = raiz, env, herdar = false, permitirFalha = false } = {}) {
  const r = spawnSync(comando, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: herdar ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    // Só o npx precisa do cmd no Windows (é um .cmd). O resto vai sem shell: o comando remoto
    // do ssh tem && e aspas, que o cmd interpretaria aqui.
    shell: windows && comando === 'npx',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0 && !permitirFalha) {
    falhar(`${comando} ${args.join(' ')} saiu com ${r.status}\n${r.stderr ?? ''}`);
  }
  return r.status === 0 ? (r.stdout ?? '') : null;
}

// --- argumentos ---
const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const notas = valor('--notas')?.trim();
if (!notas) falhar('diga o que mudou: --notas "texto" (aparece no aviso do app)');
const minimoArg = valor('--minimo');
if (minimoArg !== undefined && !/^\d+$/.test(minimoArg)) falhar('--minimo precisa ser inteiro');

// --- pré-condições ---
if (process.env.COMPASSO_PERMITIR_HTTP === '1') {
  falhar('COMPASSO_PERMITIR_HTTP=1 gera APK de teste; não se publica esse');
}
let propriedades = '';
try {
  propriedades = readFileSync(join(homedir(), '.gradle', 'gradle.properties'), 'utf8');
} catch {
  // sem arquivo: sem chave própria
}
if (!/^COMPASSO_RELEASE_STORE_FILE=/m.test(propriedades)) {
  falhar('sem a chave de release no ~/.gradle/gradle.properties (docs/desenvolvimento.md)');
}
// O runtime do APK é o fingerprint do código: tem que corresponder a um commit, o mesmo que o
// runner vai usar para publicar OTA.
if (rodar('git', ['status', '--porcelain'])?.trim()) {
  falhar('há mudanças não commitadas; o APK precisa sair de um commit');
}

const { expo } = JSON.parse(readFileSync(join(raiz, 'app.json'), 'utf8'));
const versionName = expo.version;
const versionCode = expo.android.versionCode;
const arquivo = `compasso-${versionName}-${versionCode}.apk`;

// Saída vazia = nenhum APK publicado ainda. Falha do ssh aborta: tomá-la por "primeira
// publicação" pularia a checagem de versionCode e zeraria o mínimo obrigatório.
const anteriorBruto = rodar('ssh', [
  ssh,
  `if [ -f ${REMOTO}/android.json ]; then cat ${REMOTO}/android.json; fi`,
]).trim();
const anterior = anteriorBruto ? JSON.parse(anteriorBruto) : null;
if (anterior && versionCode <= anterior.versionCode) {
  falhar(
    `versionCode ${versionCode} não é maior que o publicado (${anterior.versionCode}); ` +
      'suba android.versionCode (e version) no app.json',
  );
}
const minimoVersionCode = minimoArg ? Number(minimoArg) : (anterior?.minimoVersionCode ?? 1);
if (minimoVersionCode > versionCode) falhar('--minimo maior que o próprio versionCode');

// --- build ---
rodar('node', [join(raiz, 'scripts', 'apk.mjs')], {
  env: { COMPASSO_ABI: 'arm64-v8a' },
  herdar: true,
});
const apk = join(raiz, 'dist', `compasso-${versionName}.apk`);
const dados = readFileSync(apk);
const md5 = createHash('md5').update(dados).digest('hex');
const tamanho = statSync(apk).size;

// O runtime que o APK leva (assets/fingerprint) tem que ser o que o runner vai calcular. No
// Windows o tar do sistema (bsdtar) lê zip; o do Git Bash não.
const tar = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const embutido = rodar(tar, ['-xOf', apk, 'assets/fingerprint'], { permitirFalha: true })?.trim();
const calculado = JSON.parse(
  rodar('npx', ['expo-updates', 'fingerprint:generate', '--platform', 'android']),
).hash;
if (!embutido) falhar('não achei assets/fingerprint no APK: o expo-updates está no build?');
if (embutido !== calculado) {
  falhar(
    `o APK leva o runtime ${embutido}, mas o fingerprint do commit é ${calculado}. ` +
      'O OTA do runner nunca casaria com este APK; confira o fingerprint.config.js (ADR-0013).',
  );
}

// --- envio ---
const manifesto = {
  versionCode,
  versionName,
  runtimeVersion: embutido,
  arquivo,
  md5,
  tamanho,
  notas,
  minimoVersionCode,
  publicadoEm: new Date().toISOString(),
};
const temp = mkdtempSync(join(tmpdir(), 'compasso-apk-'));
try {
  const json = join(temp, 'android.json');
  writeFileSync(json, `${JSON.stringify(manifesto, null, 2)}\n`);
  // a+rx: se o deploy.sh ainda não criou as pastas, elas nasceriam com o umask da sessão, e o
  // container da API (outro usuário) não conseguiria ler.
  rodar('ssh', [ssh, `mkdir -p ${REMOTO} && chmod a+rx ~/compasso/releases ${REMOTO}`]);
  // Nomes temporários e mv no fim: a API nunca vê um APK pela metade nem um manifesto sem APK.
  rodar('scp', ['-q', apk, `${ssh}:${REMOTO}/.${arquivo}.tmp`]);
  rodar('scp', ['-q', json, `${ssh}:${REMOTO}/.android.json.tmp`]);
  rodar('ssh', [
    ssh,
    [
      `cd ${REMOTO}`,
      `chmod a+r .${arquivo}.tmp .android.json.tmp`,
      `mv .${arquivo}.tmp ${arquivo}`,
      'mv .android.json.tmp android.json',
      // Guarda os 3 mais recentes (pelo versionCode) para reverter à mão, se preciso.
      'ls -1 compasso-*.apk | sort -t- -k3 -n | head -n -3 | xargs -r rm -f',
    ].join(' && '),
  ]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`\nPublicado: ${arquivo} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
console.log(`runtime ${embutido} · mínimo ${minimoVersionCode}`);
console.log('Os apps veem a versão nova na próxima abertura.');
