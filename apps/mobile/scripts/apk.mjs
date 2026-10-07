/**
 * Gera o APK de release, local, sem conta em serviço nenhum (F10, ADR-0008):
 *
 *   npm run apk -w @compasso/mobile                              → dist/compasso-<versão>.apk
 *   COMPASSO_PERMITIR_HTTP=1 npm run apk -w @compasso/mobile     → …-http.apk (só para teste local)
 *
 *   COMPASSO_ABI=arm64-v8a npm run apk -w @compasso/mobile          → só essa arquitetura (~4× mais rápido)
 *
 * COMPASSO_VERSION_NAME e COMPASSO_VERSION_CODE trocam a versão do app.json (app.config.js); é
 * assim que o publicar-apk.mjs passa a versão calculada.
 *
 * Precisa do mesmo ambiente do development build (docs/desenvolvimento.md): Android SDK e um
 * JDK 17–23 (24+ quebra o CMake). Sem JAVA_HOME nessa faixa, procura um nas pastas de instalação
 * comuns do Windows e usa esse.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';

/** Versão principal do Java de um JAVA_HOME (lida do arquivo `release` do JDK), ou null. */
function versaoDoJdk(home) {
  try {
    const release = readFileSync(join(home, 'release'), 'utf8');
    const v = /^JAVA_VERSION="(\d+)/m.exec(release)?.[1];
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

const jdkServe = (v) => v !== null && v >= 17 && v <= 23;

/**
 * Com JDK 24+ o configure do CMake falha ("A restricted method in java.lang.System has been
 * called", visto em 2026-09-29), minutos depois de começar. Melhor resolver aqui: usa o
 * JAVA_HOME se ele serve; senão, o JDK 17–23 mais novo das pastas comuns; senão, para já.
 */
function escolherJdk() {
  const atual = process.env.JAVA_HOME;
  if (atual && jdkServe(versaoDoJdk(atual))) return atual;
  const pastas = [
    'C:/Program Files/Java',
    'C:/Program Files/Eclipse Adoptium',
    'C:/Program Files/Microsoft',
    'C:/Program Files/Zulu',
  ];
  const candidatos = pastas
    .filter((p) => existsSync(p))
    .flatMap((p) => readdirSync(p).map((n) => join(p, n)))
    .map((home) => ({ home, v: versaoDoJdk(home) }))
    .filter(({ v }) => jdkServe(v))
    .sort((a, b) => b.v - a.v);
  if (candidatos[0]) {
    const motivo = atual
      ? `o JAVA_HOME atual é o JDK ${versaoDoJdk(atual) ?? '?'}`
      : 'sem JAVA_HOME';
    console.log(`JDK: ${motivo}; usando ${candidatos[0].home} (JDK ${candidatos[0].v}).`);
    return candidatos[0].home;
  }
  console.error(
    'ERRO: o build precisa de um JDK 17–23 (24+ quebra o CMake) e não achei nenhum. ' +
      'Instale um (ex.: Temurin 21) e aponte JAVA_HOME para ele.',
  );
  process.exit(1);
}

process.env.JAVA_HOME = escolherJdk();

function rodar(comando, args, cwd) {
  console.log(`\n> ${comando} ${args.join(' ')}`);
  // No Windows o spawn passa pelo cmd (shell), que corta caminho com espaço: vai entre aspas.
  const exe = windows && comando.includes(' ') ? `"${comando}"` : comando;
  const r = spawnSync(exe, args, { cwd, stdio: 'inherit', shell: windows });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rodar('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], raiz);
const android = join(raiz, 'android');
// Caminho absoluto: o cmd do Windows não acha o gradlew.bat da pasta atual pelo nome.
const abi = process.env.COMPASSO_ABI
  ? [`-PreactNativeArchitectures=${process.env.COMPASSO_ABI}`]
  : [];
const gradlew = join(android, windows ? 'gradlew.bat' : 'gradlew');
// Daemon de um build anterior pode ter outro JDK ou segurar arquivos abertos em node_modules (no
// Windows, "Unable to delete file"): começa sempre do zero. No runner (CI) nem sobe daemon: ele
// ficaria com 4 GB de heap parado no servidor entre um build e outro (ADR-0016).
rodar(gradlew, ['--stop'], android);
const semDaemon = process.env.CI ? ['--no-daemon'] : [];
rodar(gradlew, ['assembleRelease', ...abi, ...semDaemon], android);

// A versão pode vir do ambiente (publicar-apk.mjs, app.config.js); senão, a do app.json.
const { expo } = JSON.parse(readFileSync(join(raiz, 'app.json'), 'utf8'));
const versao = process.env.COMPASSO_VERSION_NAME || expo.version;
const http = process.env.COMPASSO_PERMITIR_HTTP === '1';
const destino = join(raiz, 'dist', `compasso-${versao}${http ? '-http' : ''}.apk`);
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(join(raiz, 'android/app/build/outputs/apk/release/app-release.apk'), destino);

let propriedades = '';
try {
  propriedades = readFileSync(join(homedir(), '.gradle', 'gradle.properties'), 'utf8');
} catch {
  // sem arquivo: sem chave própria
}
console.log(`\nAPK: ${destino}`);
if (!/^COMPASSO_RELEASE_STORE_FILE=/m.test(propriedades)) {
  console.log('AVISO: assinado com a chave de DEBUG. Serve para testar; não distribua.');
}
if (http) console.log('AVISO: aceita HTTP sem TLS. Só para testar contra a API local.');
