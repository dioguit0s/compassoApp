import { FUSO_PADRAO, diaDe } from '@compasso/core';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { gravarPreferencia, lerPreferencia } from './preferencias';
import { lerUrl } from './servidor';

/**
 * Atualizações do app pelo próprio servidor (ADR-0013). O bundle JS chega sozinho pelo
 * expo-updates (OTA). Mudança nativa só vem com APK novo: a API anuncia o mais recente em
 * GET /app/android, e aqui o app baixa, confere e abre o instalador do Android.
 */

/** O que GET /app/android devolve (android/android.json no servidor + URL). */
export interface ApkPublicado {
  versionCode: number;
  versionName: string;
  runtimeVersion: string;
  url: string;
  md5: string;
  tamanho: number;
  notas: string;
  minimoVersionCode: number;
}

export interface ApkDisponivel {
  apk: ApkPublicado;
  /** A API mudou de um jeito que esta versão não acompanha: sem "Depois". */
  obrigatoria: boolean;
}

const CHAVE_ADIADA = 'atualizacao.apkAdiado';

export function versaoInstalada(): { nome: string; codigo: number } {
  return {
    nome: Application.nativeApplicationVersion ?? '?',
    codigo: Number(Application.nativeBuildVersion ?? 0),
  };
}

/** Bundle em uso: o que veio no APK ou o id curto do OTA baixado. */
export function bundleEmUso(): string {
  if (!Updates.isEnabled) return 'atualizações desligadas neste build';
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return 'o que veio no APK';
  return `OTA ${Updates.updateId.slice(0, 8)}`;
}

/**
 * Procura um APK mais novo que o instalado. Null se não há (ou se não há servidor configurado,
 * nem APK publicado). Sem rede ou com erro do servidor, rejeita: quem procura na abertura ignora
 * (atualizar nunca atrapalha o uso offline), e quem procura à mão fica sabendo.
 */
export async function procurarApk(): Promise<ApkDisponivel | null> {
  if (Platform.OS !== 'android') return null;
  const url = await lerUrl();
  if (!url) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 10_000);
  try {
    const r = await fetch(`${url}/app/android`, { signal: controle.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`o servidor respondeu HTTP ${r.status}`);
    const apk = (await r.json()) as ApkPublicado;
    const { codigo } = versaoInstalada();
    if (!codigo || apk.versionCode <= codigo) return null;
    return { apk, obrigatoria: codigo < apk.minimoVersionCode };
  } finally {
    clearTimeout(timer);
  }
}

/** "Depois" vale até o dia seguinte, e só para essa versão. */
export function adiarApk(versionCode: number): void {
  gravarPreferencia(CHAVE_ADIADA, `${versionCode}|${diaDe(new Date(), FUSO_PADRAO)}`);
}

export function apkAdiadoHoje(versionCode: number): boolean {
  return lerPreferencia(CHAVE_ADIADA) === `${versionCode}|${diaDe(new Date(), FUSO_PADRAO)}`;
}

/**
 * Baixa o APK para o cache e confere tamanho e md5 (sem ler o arquivo no JS). A autenticidade é
 * do Android: ele recusa instalar por cima um APK assinado com outra chave.
 */
export async function baixarApk(
  apk: ApkPublicado,
  aoProgredir: (fracao: number) => void,
): Promise<File> {
  const destino = new File(Paths.cache, `compasso-${apk.versionCode}.apk`);
  if (destino.exists) destino.delete();
  const tarefa = File.createDownloadTask(apk.url, destino, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : apk.tamanho;
      aoProgredir(Math.min(1, bytesWritten / total));
    },
  });
  const arquivo = await tarefa.downloadAsync();
  if (!arquivo) throw new Error('download interrompido');
  const info = arquivo.info({ md5: true });
  if (info.size !== apk.tamanho || info.md5?.toLowerCase() !== apk.md5.toLowerCase()) {
    arquivo.delete();
    throw new Error('o arquivo baixado não confere com o publicado; tente de novo');
  }
  return arquivo;
}

/**
 * Abre o instalador do Android. Na primeira vez ele pede para permitir "instalar apps
 * desconhecidos" do Compasso; o próprio sistema leva à tela certa.
 */
export async function instalarApk(arquivo: File): Promise<void> {
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: arquivo.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** APKs baixados ficam no cache; depois de instalado, o que sobrou pode ir embora. */
export function limparApksBaixados(): void {
  try {
    for (const item of Paths.cache.list()) {
      if (item instanceof File && /^compasso-\d+\.apk$/.test(item.name)) item.delete();
    }
  } catch {
    // cache inacessível: nada a limpar
  }
}
