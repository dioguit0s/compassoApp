import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { base } from './atualizacoes';
import type { Config } from './config';

/**
 * Novidades das atualizações (ADR-0014). O ota.mjs e o publicar-apk.mjs gravam um arquivo por
 * publicação em `releasesDir/novidades/`, com o texto escrito à mão nos commits (trailer
 * `Novidade:`). A API só lê: a página de download, o feed Atom e o app mostram a mesma lista.
 * Públicas como as rotas de atualização.
 */

export const ARQUIVO_NOVIDADE = /^(\d{14})-(ota|apk)-([0-9a-z]{1,40})\.json$/;

/** Quantas a API devolve: o histórico cresce a cada push, a leitura não. */
export const LIMITE_DE_NOVIDADES = 20;

export interface Novidade {
  /** Nome do arquivo sem `.json`: estável, serve de id no feed e no app. */
  id: string;
  /** `ota` chega sozinha no app; `apk` é versão nova, instalada pelo aviso do app. */
  tipo: 'ota' | 'apk';
  publicadoEm: string;
  /** versionName do APK (o publicado, no caso de OTA). */
  versao: string;
  versionCode: number;
  runtime: string;
  itens: string[];
}

function valida(id: string, dados: unknown): Novidade | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (d.tipo !== 'ota' && d.tipo !== 'apk') return null;
  if (typeof d.publicadoEm !== 'string' || Number.isNaN(Date.parse(d.publicadoEm))) return null;
  if (!Array.isArray(d.itens)) return null;
  const itens = d.itens
    .filter((i): i is string => typeof i === 'string')
    .map((i) => i.trim())
    .filter(Boolean);
  // Publicação sem nada a contar: fica no disco (marca de onde a próxima parte), fora da lista.
  if (!itens.length) return null;
  return {
    id,
    tipo: d.tipo,
    publicadoEm: new Date(d.publicadoEm).toISOString(),
    versao: typeof d.versao === 'string' ? d.versao : '',
    versionCode: Number.isInteger(d.versionCode) ? (d.versionCode as number) : 0,
    runtime: typeof d.runtime === 'string' ? d.runtime : '',
    itens,
  };
}

/**
 * As mais recentes primeiro, até `limite`. Arquivo ilegível ou fora do formato é pulado: uma
 * novidade estragada não derruba a página de download.
 */
export async function lerNovidades(
  config: Config,
  limite = LIMITE_DE_NOVIDADES,
): Promise<Novidade[]> {
  const pasta = join(config.releasesDir, 'novidades');
  let nomes: string[];
  try {
    nomes = (await readdir(pasta))
      .filter((n) => ARQUIVO_NOVIDADE.test(n))
      .sort()
      .reverse();
  } catch {
    return [];
  }
  const lista: Novidade[] = [];
  for (const nome of nomes) {
    if (lista.length >= limite) break;
    try {
      const n = valida(
        nome.slice(0, -'.json'.length),
        JSON.parse(await readFile(join(pasta, nome), 'utf8')),
      );
      if (n) lista.push(n);
    } catch {
      // ilegível: pula
    }
  }
  return lista;
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function tituloDaNovidade(n: Novidade): string {
  return n.tipo === 'apk' ? `Versão ${n.versao}` : 'Atualização automática';
}

function feed(lista: Novidade[], raiz: string): string {
  const atualizado = lista[0]?.publicadoEm ?? new Date(0).toISOString();
  const entradas = lista.map((n) => {
    const html = `<ul>${n.itens.map((i) => `<li>${escaparXml(i)}</li>`).join('')}</ul>`;
    return `  <entry>
    <id>${escaparXml(`${raiz}/novidades#${n.id}`)}</id>
    <title>${escaparXml(tituloDaNovidade(n))}</title>
    <updated>${n.publicadoEm}</updated>
    <link rel="alternate" type="text/html" href="${escaparXml(`${raiz}/#${n.id}`)}"/>
    <content type="html">${escaparXml(html)}</content>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="pt-BR">
  <id>${escaparXml(`${raiz}/novidades.xml`)}</id>
  <title>Compasso — novidades</title>
  <subtitle>O que mudou em cada atualização do app.</subtitle>
  <updated>${atualizado}</updated>
  <author><name>Compasso</name></author>
  <link rel="self" type="application/atom+xml" href="${escaparXml(`${raiz}/novidades.xml`)}"/>
  <link rel="alternate" type="text/html" href="${escaparXml(`${raiz}/`)}"/>
${entradas.join('\n')}
</feed>
`;
}

export function rotasDeNovidades(config: Config) {
  const app = new Hono();

  // O app lê esta lista para o aviso "Novidades" e a tela em Configurações.
  app.get('/novidades.json', async (c) =>
    c.json({ novidades: await lerNovidades(config) }, 200, { 'cache-control': 'no-cache' }),
  );

  app.get('/novidades.xml', async (c) =>
    c.body(feed(await lerNovidades(config), base(c, config)), 200, {
      'content-type': 'application/atom+xml; charset=utf-8',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    }),
  );

  return app;
}
