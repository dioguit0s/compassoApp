/**
 * Gera o APK de release e publica (ADR-0013, ADR-0016): o app dos amigos vê a versão nova na
 * próxima abertura e instala com um toque. Três modos:
 *
 *   node scripts/publicar-apk.mjs --gerar <pasta> [--forcar]
 *       No runner (app.yml, job gerar-apk). Se o runtime nativo do commit é o do APK publicado,
 *       não faz nada (sem --forcar). Senão, gera e confere o APK e o deixa em <pasta>, pendente.
 *   node scripts/publicar-apk.mjs --publicar <pasta>
 *       No runner, depois da aprovação no environment `apk` (job publicar-apk): põe no ar.
 *   npm run apk:publicar -w @compasso/mobile [-- --notas "..." --minimo 5]
 *       À mão, na máquina do autor: gera e envia por SSH para o homeserver (COMPASSO_SSH, padrão
 *       luna-dash; ver docs/deploy.md). O caminho de antes do ADR-0016, que segue de reserva.
 *
 * Os dois do runner leem e escrevem em RELEASES_DIR (padrão ~/compasso/releases), local.
 *
 * A versão sai de versao-apk.mjs: a do app.json, ou o patch seguinte ao publicado, com
 * versionCode = publicado + 1. Vai para o build pelo ambiente (app.config.js), sem editar o
 * app.json.
 *
 * O texto do aviso no app e da novidade no site (ADR-0014) sai dos trailers `Novidade:` dos
 * commits do app desde a publicação anterior (OTA ou APK); sem nenhum, "Melhorias e correções".
 * --notas substitui esse texto. Atualização obrigatória: --minimo N, ou o trailer
 * `Atualizacao-obrigatoria: sim` em algum commit do intervalo. Sempre só arm64-v8a.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
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
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  instanteDe,
  juntarNovidades,
  mensagensDosCommits,
  NOVIDADE_PADRAO,
  pedeAtualizacaoObrigatoria,
  ultimaDaLista,
} from './novidades.mjs';
import { proximaVersao } from './versao-apk.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
/** APKs guardados no servidor (pelo versionCode), para reverter à mão se preciso. */
const MANTER_APKS = 3;
/** Gerações pendentes guardadas no runner; as mais velhas já foram superadas. */
const MANTER_PENDENTES = 3;

function falhar(msg) {
  console.error(`\nERRO: ${msg}`);
  process.exit(1);
}

/** Resumo do job no GitHub (e no console). */
function resumo(texto) {
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);
}

/** Saída do passo, lida pelos jobs seguintes do workflow. */
function saida(nome, valor) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${nome}=${valor}\n`);
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

// --- destinos: a pasta de releases local (runner) ou o homeserver por SSH (máquina do autor) ---

const ARQUIVO_APK = /^compasso-.+-(\d+)\.apk$/;

/** Escreve e torna legível pelo container da API (outro usuário): a+r. */
function legivel(caminho) {
  chmodSync(caminho, statSync(caminho).mode | 0o444);
}

function destinoLocal(releases) {
  const android = join(releases, 'android');
  const novidades = join(releases, 'novidades');
  return {
    lerManifesto() {
      try {
        return JSON.parse(readFileSync(join(android, 'android.json'), 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    commitDaUltimaNovidade() {
      const nomes = existsSync(novidades) ? readdirSync(novidades) : [];
      return ultimaDaLista(nomes, (n) => readFileSync(join(novidades, n), 'utf8'));
    },
    enviar({ apk, arquivo, manifesto, novidade, arquivoNovidade }) {
      // a+rx: se o runner criou as pastas antes do deploy.sh, nasceram com o umask dele.
      for (const pasta of [releases, android, novidades]) {
        mkdirSync(pasta, { recursive: true });
        chmodSync(pasta, statSync(pasta).mode | 0o555);
      }
      // Nomes temporários e rename no fim: a API nunca vê um APK pela metade nem um manifesto
      // sem APK. A novidade por último: o site só anuncia o APK que já dá para baixar.
      const tmpApk = join(android, `.${arquivo}.tmp`);
      const tmpManifesto = join(android, '.android.json.tmp');
      const tmpNovidade = join(novidades, `.tmp-${arquivoNovidade}`);
      copyFileSync(apk, tmpApk);
      writeFileSync(tmpManifesto, manifesto);
      writeFileSync(tmpNovidade, novidade);
      for (const f of [tmpApk, tmpManifesto, tmpNovidade]) legivel(f);
      renameSync(tmpApk, join(android, arquivo));
      renameSync(tmpManifesto, join(android, 'android.json'));
      renameSync(tmpNovidade, join(novidades, arquivoNovidade));
      const velhos = readdirSync(android)
        .filter((n) => ARQUIVO_APK.test(n))
        .sort((a, b) => Number(ARQUIVO_APK.exec(a)[1]) - Number(ARQUIVO_APK.exec(b)[1]))
        .slice(0, -MANTER_APKS);
      for (const n of velhos) rmSync(join(android, n), { force: true });
    },
  };
}

function destinoSsh(ssh) {
  const REMOTO = '~/compasso/releases/android';
  const NOVIDADES = '~/compasso/releases/novidades';
  return {
    lerManifesto() {
      // Saída vazia = nenhum APK publicado ainda. Falha do ssh aborta: tomá-la por "primeira
      // publicação" pularia a checagem de versionCode e zeraria o mínimo obrigatório.
      const bruto = rodar('ssh', [
        ssh,
        `if [ -f ${REMOTO}/android.json ]; then cat ${REMOTO}/android.json; fi`,
      ]).trim();
      return bruto ? JSON.parse(bruto) : null;
    },
    commitDaUltimaNovidade() {
      const bruto = rodar('ssh', [
        ssh,
        `u=$(ls -1 ${NOVIDADES} 2>/dev/null | grep -E '^[0-9]{14}-(ota|apk)-[0-9a-z]+[.]json$' | sort | tail -n 1); ` +
          `if [ -n "$u" ]; then cat ${NOVIDADES}/$u; fi`,
      ]).trim();
      try {
        return bruto ? (JSON.parse(bruto).commit ?? null) : null;
      } catch {
        return null; // novidade ilegível: parte do APK anterior
      }
    },
    enviar({ apk, arquivo, manifesto, novidade, arquivoNovidade }) {
      const temp = mkdtempSync(join(tmpdir(), 'compasso-apk-'));
      try {
        const json = join(temp, 'android.json');
        writeFileSync(json, manifesto);
        const jsonNovidade = join(temp, arquivoNovidade);
        writeFileSync(jsonNovidade, novidade);
        rodar('ssh', [
          ssh,
          `mkdir -p ${REMOTO} ${NOVIDADES} && chmod a+rx ~/compasso/releases ${REMOTO} ${NOVIDADES}`,
        ]);
        rodar('scp', ['-q', apk, `${ssh}:${REMOTO}/.${arquivo}.tmp`]);
        rodar('scp', ['-q', json, `${ssh}:${REMOTO}/.android.json.tmp`]);
        rodar('scp', ['-q', jsonNovidade, `${ssh}:${NOVIDADES}/.tmp-${arquivoNovidade}`]);
        rodar('ssh', [
          ssh,
          [
            `cd ${REMOTO}`,
            `chmod a+r .${arquivo}.tmp .android.json.tmp`,
            `mv .${arquivo}.tmp ${arquivo}`,
            'mv .android.json.tmp android.json',
            `chmod a+r ${NOVIDADES}/.tmp-${arquivoNovidade}`,
            `mv ${NOVIDADES}/.tmp-${arquivoNovidade} ${NOVIDADES}/${arquivoNovidade}`,
            `ls -1 compasso-*.apk | sort -t- -k3 -n | head -n -${MANTER_APKS} | xargs -r rm -f`,
          ].join(' && '),
        ]);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  };
}

// --- gerar ---

function fingerprintDoCommit() {
  return JSON.parse(rodar('npx', ['expo-updates', 'fingerprint:generate', '--platform', 'android']))
    .hash;
}

/**
 * Gera e confere o APK e grava em `pasta` o APK e o `pendente.json` com tudo o que a publicação
 * precisa. Devolve o pendente, ou null se não há mudança nativa (só com `pularSemMudanca`).
 */
function gerar(destino, pasta, { notasArg, minimoArg, pularSemMudanca }) {
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

  const anterior = destino.lerManifesto();
  const runtime = fingerprintDoCommit();
  if (pularSemMudanca && anterior?.runtimeVersion === runtime) return null;

  const { expo } = JSON.parse(readFileSync(join(raiz, 'app.json'), 'utf8'));
  const { versionName, versionCode } = proximaVersao(
    { versionName: expo.version, versionCode: expo.android.versionCode },
    anterior,
  );
  const arquivo = `compasso-${versionName}-${versionCode}.apk`;

  // --- novidades (ADR-0014) e obrigatória ---
  // A publicação mais recente (OTA ou APK) diz de que commit partir. Sem nenhuma, usa o commit do
  // APK anterior, se ele tiver.
  const desde = destino.commitDaUltimaNovidade() ?? anterior?.commit;
  const commit = rodar('git', ['rev-parse', 'HEAD']).trim();
  const mensagens = mensagensDosCommits(raiz, desde, commit);
  const dosCommits = juntarNovidades(mensagens);
  const itens = notasArg ? [notasArg] : dosCommits.length ? dosCommits : [NOVIDADE_PADRAO];
  const semTrailer = !notasArg && !dosCommits.length;
  const minimoVersionCode =
    minimoArg !== undefined
      ? Number(minimoArg)
      : pedeAtualizacaoObrigatoria(mensagens)
        ? versionCode
        : (anterior?.minimoVersionCode ?? 1);
  if (minimoVersionCode > versionCode) falhar('--minimo maior que o próprio versionCode');

  console.log(
    `Versão ${versionName} (${versionCode}), mínimo ${minimoVersionCode}\n` +
      `Novidades:\n${itens.map((i) => `  - ${i}`).join('\n')}\n`,
  );

  // --- build ---
  rodar('node', [join(raiz, 'scripts', 'apk.mjs')], {
    env: {
      COMPASSO_ABI: 'arm64-v8a',
      COMPASSO_VERSION_NAME: versionName,
      COMPASSO_VERSION_CODE: String(versionCode),
    },
    herdar: true,
  });
  const gerado = join(raiz, 'dist', `compasso-${versionName}.apk`);

  // O runtime que o APK leva (assets/fingerprint) tem que ser o que o runner vai calcular. No
  // Windows o tar do sistema (bsdtar) lê zip; o do Git Bash não.
  const tar = windows
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const embutido = rodar(tar, ['-xOf', gerado, 'assets/fingerprint'], {
    permitirFalha: true,
  })?.trim();
  if (!embutido) falhar('não achei assets/fingerprint no APK: o expo-updates está no build?');
  if (embutido !== runtime) {
    falhar(
      `o APK leva o runtime ${embutido}, mas o fingerprint do commit é ${runtime}. ` +
        'O OTA do runner nunca casaria com este APK; confira o fingerprint.config.js (ADR-0013).',
    );
  }

  mkdirSync(pasta, { recursive: true });
  copyFileSync(gerado, join(pasta, arquivo));
  const dados = readFileSync(join(pasta, arquivo));
  const pendente = {
    versionCode,
    versionName,
    runtimeVersion: runtime,
    arquivo,
    md5: createHash('md5').update(dados).digest('hex'),
    tamanho: dados.length,
    itens,
    minimoVersionCode,
    commit,
    // A publicação confere que ninguém publicou outro APK entre a geração e a aprovação.
    anteriorVersionCode: anterior?.versionCode ?? null,
    semTrailer,
  };
  writeFileSync(join(pasta, 'pendente.json'), `${JSON.stringify(pendente, null, 2)}\n`);
  return pendente;
}

// --- publicar ---

function publicar(destino, pasta) {
  let pendente;
  try {
    pendente = JSON.parse(readFileSync(join(pasta, 'pendente.json'), 'utf8'));
  } catch {
    falhar(`não há APK pendente em ${pasta} (o job gerar-apk rodou neste runner?)`);
  }
  const apk = join(pasta, pendente.arquivo);
  const md5 = createHash('md5').update(readFileSync(apk)).digest('hex');
  if (md5 !== pendente.md5) falhar(`o APK em ${pasta} mudou desde a geração (md5)`);

  const atual = destino.lerManifesto();
  if ((atual?.versionCode ?? null) !== pendente.anteriorVersionCode) {
    falhar(
      `outro APK (${atual?.versionName} / ${atual?.versionCode}) foi publicado depois desta ` +
        'geração. Rode o workflow App de novo (Run workflow) para gerar a partir dele.',
    );
  }

  const publicadoEm = new Date().toISOString();
  const { itens } = pendente;
  const manifesto = {
    versionCode: pendente.versionCode,
    versionName: pendente.versionName,
    runtimeVersion: pendente.runtimeVersion,
    arquivo: pendente.arquivo,
    md5: pendente.md5,
    tamanho: pendente.tamanho,
    notas: itens.length === 1 ? itens[0] : itens.map((i) => `• ${i}`).join('\n'),
    minimoVersionCode: pendente.minimoVersionCode,
    publicadoEm,
    commit: pendente.commit,
  };
  const novidade = {
    tipo: 'apk',
    publicadoEm,
    versao: pendente.versionName,
    versionCode: pendente.versionCode,
    runtime: pendente.runtimeVersion,
    commit: pendente.commit,
    itens,
  };
  destino.enviar({
    apk,
    arquivo: pendente.arquivo,
    manifesto: `${JSON.stringify(manifesto, null, 2)}\n`,
    novidade: `${JSON.stringify(novidade, null, 2)}\n`,
    arquivoNovidade: `${instanteDe(new Date(publicadoEm))}-apk-${pendente.versionCode}.json`,
  });
  return pendente;
}

// --- argumentos ---

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const notasArg = valor('--notas')?.trim();
const minimoArg = valor('--minimo');
if (minimoArg !== undefined && !/^\d+$/.test(minimoArg)) falhar('--minimo precisa ser inteiro');
const releases = resolve(process.env.RELEASES_DIR || join(homedir(), 'compasso', 'releases'));

/** Linha de resumo do APK. */
const descrever = (p) =>
  `${p.arquivo} (${(p.tamanho / 1024 / 1024).toFixed(1)} MB), runtime \`${p.runtimeVersion.slice(0, 12)}\`, mínimo ${p.minimoVersionCode}`;

if (args.includes('--gerar')) {
  const pasta = resolve(valor('--gerar') ?? falhar('--gerar precisa da pasta de saída'));
  const pendente = gerar(destinoLocal(releases), pasta, {
    notasArg,
    minimoArg,
    pularSemMudanca: !args.includes('--forcar'),
  });
  if (!pendente) {
    saida('nativo', 'false');
    resumo('### APK: sem mudança nativa\n\nO runtime deste commit é o do APK publicado.');
    process.exit(0);
  }
  // Pendentes mais velhos (de commits já superados) saem; os últimos ficam para conferência.
  const irmas = readdirSync(dirname(pasta))
    .map((n) => join(dirname(pasta), n))
    .filter((p) => p !== pasta && statSync(p).isDirectory())
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  for (const p of irmas.slice(0, Math.max(0, irmas.length - (MANTER_PENDENTES - 1)))) {
    rmSync(p, { recursive: true, force: true });
  }
  saida('nativo', 'true');
  saida('pasta', pasta);
  resumo(
    [
      `### APK ${pendente.versionName} gerado, aguardando aprovação`,
      descrever(pendente),
      `Novidades:\n${pendente.itens.map((i) => `- ${i}`).join('\n')}`,
      ...(pendente.semTrailer ? ['Nenhum commit trouxe `Novidade:`; vai o texto padrão.'] : []),
      'Baixe o artefato deste run para testar e aprove o job **publicar-apk** para pôr no ar.',
    ].join('\n\n'),
  );
} else if (args.includes('--publicar')) {
  const pasta = resolve(valor('--publicar') ?? falhar('--publicar precisa da pasta'));
  const p = publicar(destinoLocal(releases), pasta);
  resumo(
    `### APK ${p.versionName} publicado\n\n${descrever(p)}\n\n` +
      'Os apps veem a versão nova na próxima abertura.',
  );
  rmSync(pasta, { recursive: true, force: true });
} else {
  const destino = destinoSsh(process.env.COMPASSO_SSH || 'luna-dash');
  const pasta = mkdtempSync(join(tmpdir(), `compasso-${basename(raiz)}-`));
  try {
    gerar(destino, pasta, { notasArg, minimoArg, pularSemMudanca: false });
    const p = publicar(destino, pasta);
    console.log(`\nPublicado: ${descrever(p)}`);
    console.log('Os apps veem a versão nova na próxima abertura.');
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
