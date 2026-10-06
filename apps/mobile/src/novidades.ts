import { diaDe, nomeDoMes, partesDoDia } from '@compasso/core';
import * as Updates from 'expo-updates';
import { versaoInstalada } from './atualizacao';
import { gravarPreferencia, lerPreferencia } from './preferencias';
import { lerUrl } from './servidor';

/**
 * Novidades das atualizações (ADR-0014): o texto público de cada publicação, que a API serve em
 * GET /novidades.json (o mesmo da página de download). Depois que uma atualização entra, o app
 * mostra o que ela trouxe uma vez; a lista inteira fica em Configurações → Novidades.
 */

export interface Novidade {
  id: string;
  /** `ota` chega sozinha; `apk` é versão nova, instalada pelo aviso do app. */
  tipo: 'ota' | 'apk';
  publicadoEm: string;
  versao: string;
  versionCode: number;
  runtime: string;
  itens: string[];
}

/** Instante da novidade mais recente já mostrada (ou considerada) neste aparelho. */
const CHAVE_VISTAS = 'novidades.vistasAte';

/**
 * Lista da API, mais recentes primeiro. Null sem servidor configurado. Sem rede ou com erro do
 * servidor, rejeita: o aviso na abertura ignora, a tela mostra o erro.
 */
export async function buscarNovidades(): Promise<Novidade[] | null> {
  const url = await lerUrl();
  if (!url) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 10_000);
  try {
    const r = await fetch(`${url}/novidades.json`, { signal: controle.signal });
    // API anterior às novidades: nada a mostrar.
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`o servidor respondeu HTTP ${r.status}`);
    const { novidades } = (await r.json()) as { novidades: Novidade[] };
    return Array.isArray(novidades) ? novidades : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Se o que a novidade anuncia já roda neste aparelho: o APK instalado é dessa versão ou mais
 * novo; o OTA em uso é do mesmo runtime e foi publicado nela ou depois. Um OTA baixado e ainda
 * não aplicado não conta: a novidade aparece quando ele entrar.
 */
export function jaEmUso(n: Novidade): boolean {
  if (n.tipo === 'apk') {
    const { codigo } = versaoInstalada();
    return n.versionCode > 0 && n.versionCode <= codigo;
  }
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return false;
  return (
    n.runtime === Updates.runtimeVersion && Date.parse(n.publicadoEm) <= Updates.createdAt.getTime()
  );
}

/**
 * Se a novidade ainda vai chegar a este aparelho: APK mais novo que o instalado, ou OTA do runtime
 * em uso ainda não aplicado. OTA de outro runtime foi superado por um APK e nunca chega.
 */
export function aindaVaiChegar(n: Novidade): boolean {
  if (jaEmUso(n)) return false;
  if (n.tipo === 'apk') return true;
  return Updates.isEnabled && n.runtime === Updates.runtimeVersion;
}

/**
 * As que ainda não foram mostradas aqui, mais recentes primeiro. Na primeira vez (aparelho novo
 * ou app de antes das novidades), só a mais recente em uso: o histórico inteiro fica na tela.
 */
export function novidadesNaoVistas(lista: Novidade[]): Novidade[] {
  const emUso = lista.filter(jaEmUso);
  const vistasAte = lerPreferencia(CHAVE_VISTAS);
  if (!vistasAte) return emUso.slice(0, 1);
  return emUso.filter((n) => Date.parse(n.publicadoEm) > Date.parse(vistasAte));
}

/** Marca como vistas todas as que já estão em uso (as mais velhas que a mostrada também). */
export function marcarVistas(lista: Novidade[]): void {
  const vistasAte = lerPreferencia(CHAVE_VISTAS);
  let maior = vistasAte ? Date.parse(vistasAte) : -Infinity;
  for (const n of lista.filter(jaEmUso)) maior = Math.max(maior, Date.parse(n.publicadoEm));
  if (Number.isFinite(maior)) gravarPreferencia(CHAVE_VISTAS, new Date(maior).toISOString());
}

/** "6 de outubro de 2026", em São Paulo. */
export function dataDaNovidade(n: Novidade): string {
  const { ano, mes, dia } = partesDoDia(diaDe(new Date(n.publicadoEm)));
  return `${dia} de ${nomeDoMes(mes)} de ${ano}`;
}

export function tituloDaNovidade(n: Novidade): string {
  return n.tipo === 'apk' ? `Versão ${n.versao}` : 'Atualização automática';
}

/** Texto do aviso: cada publicação com data e itens. */
export function textoDoAviso(lista: Novidade[]): string {
  return lista
    .map((n) => [`${dataDaNovidade(n)}`, ...n.itens.map((i) => `• ${i}`)].join('\n'))
    .join('\n\n');
}
