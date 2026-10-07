/**
 * Novidades das atualizações (ADR-0014): o texto público de cada publicação, escrito à mão em
 * cada commit que muda o app, na linha de trailer
 *
 *   Novidade: Captura rápida aceita qualquer data pelo seletor do Android
 *
 * (`Novidade: -` diz, de propósito, que o commit não tem nada a contar). O ota.mjs e o
 * publicar-apk.mjs juntam as novidades dos commits desde a publicação anterior e gravam um
 * arquivo por publicação em releases/novidades/, que a API mostra no site, no feed e no app.
 */
import { spawnSync } from 'node:child_process';

/** Pastas cujo conteúdo vai no app; commits só fora delas não entram nas novidades. */
export const CAMINHOS_DO_APP = ['apps/mobile', 'packages/core'];

/** Nome do arquivo em releases/novidades/: o instante na frente, para ordenar. */
export const ARQUIVO_NOVIDADE = /^(\d{14})-(ota|apk)-([0-9a-z]{1,40})\.json$/;

/** Trailers `Novidade:` de uma mensagem de commit, na ordem; `-` não conta. */
export function extrairNovidades(mensagem) {
  const itens = [];
  for (const linha of mensagem.split(/\r?\n/)) {
    const m = /^Novidade:[ \t]*(.*?)\s*$/i.exec(linha);
    if (m && m[1] && m[1] !== '-') itens.push(m[1]);
  }
  return itens;
}

/**
 * Junta as mensagens (da mais antiga para a mais nova) numa lista sem repetição: o mesmo texto
 * em dois commits (um ajuste e a correção dele) aparece uma vez.
 */
export function juntarNovidades(mensagens) {
  const vistos = new Set();
  const itens = [];
  for (const mensagem of mensagens) {
    for (const item of extrairNovidades(mensagem)) {
      const chave = item.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push(item);
    }
  }
  return itens;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/**
 * Mensagens dos commits que mudaram o app depois de `desde` até `ate`, da mais antiga para a mais
 * nova. Sem `desde`, ou se ele não é ancestral de `ate` (primeira publicação, histórico reescrito,
 * checkout raso), conta só o próprio `ate`: melhor perder texto antigo que repetir o histórico
 * inteiro.
 */
export function mensagensDosCommits(cwd, desde, ate = 'HEAD') {
  const ancestral =
    desde && spawnSync('git', ['merge-base', '--is-ancestor', desde, ate], { cwd }).status === 0;
  const intervalo = ancestral ? [`${desde}..${ate}`] : ['-1', ate];
  const saida = git(cwd, [
    'log',
    '--reverse',
    '--no-merges',
    '--format=%B%x1e',
    ...intervalo,
    '--',
    // Relativos à raiz do repositório, qualquer que seja a pasta de onde o script roda.
    ...CAMINHOS_DO_APP.map((c) => `:(top)${c}`),
  ]);
  if (saida === null) throw new Error('git log falhou ao ler as novidades');
  return saida.split('\x1e').filter((m) => m.trim());
}

/** Novidades dos commits do app desde `desde` (ver `mensagensDosCommits`). */
export function novidadesDosCommits(cwd, desde, ate = 'HEAD') {
  return juntarNovidades(mensagensDosCommits(cwd, desde, ate));
}

/**
 * Texto do APK gerado pelo runner quando nenhum commit do intervalo trouxe `Novidade:` (ADR-0016):
 * a publicação não fica parada esperando um trailer.
 */
export const NOVIDADE_PADRAO = 'Melhorias e correções';

/**
 * Algum commit pede atualização obrigatória (ADR-0016)? Trailer `Atualizacao-obrigatoria: sim`
 * (com ou sem acento, qualquer caixa). O APK que levar esse commit vira o mínimo para usar o app.
 */
export function pedeAtualizacaoObrigatoria(mensagens) {
  return mensagens.some((mensagem) =>
    mensagem
      .split(/\r?\n/)
      .some((linha) => /^Atualiza(c|ç)(a|ã)o-obrigat(o|ó)ria:[ \t]*sim\s*$/i.test(linha)),
  );
}

/** Instante AAAAMMDDHHMMSS (UTC) em ISO, o mesmo formato do createdAt do OTA. */
export function isoDoInstante(instante) {
  const d = instante;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}.000Z`;
}

export function instanteDe(data) {
  return data.toISOString().replace(/\D/g, '').slice(0, 14);
}

/** Commit da publicação mais recente, entre os nomes de releases/novidades/ e o conteúdo dela. */
export function ultimaDaLista(nomes, ler) {
  const ultima = nomes
    .filter((n) => ARQUIVO_NOVIDADE.test(n))
    .sort()
    .at(-1);
  if (!ultima) return null;
  try {
    const commit = JSON.parse(ler(ultima)).commit;
    return typeof commit === 'string' && /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}
