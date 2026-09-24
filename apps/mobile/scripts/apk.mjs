/**
 * Gera o APK de release, local, sem conta em serviço nenhum (F10, ADR-0008):
 *
 *   npm run apk -w @compasso/mobile                              → dist/compasso-<versão>.apk
 *   COMPASSO_PERMITIR_HTTP=1 npm run apk -w @compasso/mobile     → …-http.apk (só para teste local)
 *
 * Precisa do mesmo ambiente do development build (docs/desenvolvimento.md): Android SDK e
 * JAVA_HOME num JDK 17–23 (o 25 quebra o CMake).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';

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
rodar(join(android, windows ? 'gradlew.bat' : 'gradlew'), ['assembleRelease'], android);

const { expo } = JSON.parse(readFileSync(join(raiz, 'app.json'), 'utf8'));
const http = process.env.COMPASSO_PERMITIR_HTTP === '1';
const destino = join(raiz, 'dist', `compasso-${expo.version}${http ? '-http' : ''}.apk`);
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
