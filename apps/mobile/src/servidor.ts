import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * URL da API e token de sessão do aparelho. Ficam no armazenamento seguro do sistema — nunca no
 * bundle (EXPO_PUBLIC_* é embutido em texto puro no JS). A URL é digitada na primeira abertura; o
 * token vem de entrar ou criar conta (F10, ADR-0008).
 */
const CHAVE_URL = 'compasso.api.url';
const CHAVE_TOKEN = 'compasso.api.token';

export interface ConexaoServidor {
  url: string;
  token: string;
}

export async function lerConexao(): Promise<ConexaoServidor | null> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(CHAVE_URL),
    SecureStore.getItemAsync(CHAVE_TOKEN),
  ]);
  return url && token ? { url, token } : null;
}

/** URL sem token: sessão encerrada (401) ou nunca entrou. O formulário já abre preenchido. */
export async function lerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE_URL);
}

/**
 * Só aceita http(s)://host. Um erro de digitação ("htttp://", visto no emulador) seria salvo e
 * depois toda chamada falharia com "sem resposta do servidor", sem o formulário para corrigir.
 */
export function urlDeServidorValida(url: string): boolean {
  return /^https?:\/\/[^\s/?#]+(\/\S*)?$/i.test(url.trim());
}

export async function salvarConexao(c: ConexaoServidor): Promise<void> {
  await SecureStore.setItemAsync(CHAVE_URL, c.url.trim().replace(/\/+$/, ''));
  await SecureStore.setItemAsync(CHAVE_TOKEN, c.token.trim());
}

export async function esquecerConexao(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_URL);
  await SecureStore.deleteItemAsync(CHAVE_TOKEN);
}

/**
 * O servidor recusou o token (revogado por "sair" em outro lugar ou pela troca de senha). Esquece
 * só o token: a URL e os dados deste aparelho ficam, e o que não foi enviado sobe quando a pessoa
 * entrar de novo na mesma conta.
 */
async function sessaoEncerrada(conexao: ConexaoServidor): Promise<void> {
  // Só esquece se ainda é o mesmo token: uma resposta atrasada não apaga a sessão nova.
  if ((await SecureStore.getItemAsync(CHAVE_TOKEN)) === conexao.token) {
    await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  }
}

/** Rótulo da sessão no servidor (api_tokens.label), para saber de que aparelho é cada uma. */
export function nomeDoAparelho(): string {
  if (Platform.OS === 'android') {
    const c = Platform.constants as { Brand?: string; Model?: string };
    return ['Android', c.Brand, c.Model].filter(Boolean).join(' ').slice(0, 100);
  }
  return Platform.OS;
}

export interface UsuarioResposta {
  id: string;
  displayName: string;
  avatarKind: 'initials' | 'uploaded';
  avatarPath: string | null;
  accentColor: string;
  defaultReminderMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ResultadoAcesso =
  { ok: true; token: string; usuario: UsuarioResposta } | { ok: false; erro: string };

/**
 * Entrar ou criar conta (rotas públicas). Não usa `chamarApi`: aqui 401 é "senha errada", não
 * sessão encerrada, e a mensagem do servidor vai para a tela.
 */
export async function acessar(
  url: string,
  rota: '/auth/entrar' | '/auth/cadastro',
  corpo: Record<string, string>,
): Promise<ResultadoAcesso> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 30_000);
  try {
    const r = await fetch(`${url.trim().replace(/\/+$/, '')}${rota}`, {
      method: 'POST',
      signal: controle.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpo, aparelho: nomeDoAparelho() }),
    });
    const dados = (await r.json().catch(() => ({}))) as {
      erro?: string;
      token?: string;
      usuario?: UsuarioResposta;
    };
    if (r.ok && dados.token && dados.usuario) {
      return { ok: true, token: dados.token, usuario: dados.usuario };
    }
    return { ok: false, erro: dados.erro ?? `o servidor respondeu HTTP ${r.status}` };
  } catch {
    return { ok: false, erro: 'sem resposta do servidor — confira o endereço e a rede' };
  } finally {
    clearTimeout(timer);
  }
}

export class ErroHttp extends Error {
  /** `detalhe`: o `erro` do corpo da resposta, quando há — para mostrar na tela. */
  constructor(
    readonly status: number,
    readonly detalhe?: string,
  ) {
    super(`HTTP ${status}`);
  }
}

/** fetch com token e tempo-limite. Sem rede, rejeita — quem chama segue lendo do SQLite. */
export async function chamarApi<T>(
  conexao: ConexaoServidor,
  caminho: string,
  init: RequestInit = {},
  limiteMs = 15_000,
): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const r = await fetch(`${conexao.url}${caminho}`, {
      ...init,
      signal: controle.signal,
      headers: {
        ...init.headers,
        authorization: `Bearer ${conexao.token}`,
        'content-type': 'application/json',
      },
    });
    if (r.status === 401) await sessaoEncerrada(conexao);
    if (!r.ok) {
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
      throw new ErroHttp(r.status, corpo.erro);
    }
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Envio multipart (importação de ICS). Sem `content-type`: o fetch monta o boundary. */
export async function enviarArquivo<T>(
  conexao: ConexaoServidor,
  caminho: string,
  arquivo: { uri: string; name: string; mimeType?: string },
  metodo: 'POST' | 'PUT' = 'POST',
  limiteMs = 120_000,
): Promise<T> {
  const form = new FormData();
  // O fetch global do Expo (SDK 57) não aceita o { uri, name, type } do React Native: a parte do
  // multipart precisa ser um Blob ou ter bytes() ("Unsupported FormDataPart implementation",
  // visto no emulador). O File do expo-file-system lê o conteúdo; nome e tipo vão nos cabeçalhos.
  const conteudo = new File(arquivo.uri);
  form.append('arquivo', {
    name: arquivo.name,
    type: arquivo.mimeType ?? 'application/octet-stream',
    bytes: () => conteudo.bytes(),
  } as unknown as Blob);
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const r = await fetch(`${conexao.url}${caminho}`, {
      method: metodo,
      body: form,
      signal: controle.signal,
      headers: { authorization: `Bearer ${conexao.token}` },
    });
    if (r.status === 401) await sessaoEncerrada(conexao);
    const corpo = (await r.json().catch(() => ({}))) as T & { erro?: string };
    if (!r.ok) throw new Error(corpo.erro ?? `HTTP ${r.status}`);
    return corpo;
  } finally {
    clearTimeout(timer);
  }
}

/** Troca de senha (F10). Encerra as sessões dos outros aparelhos; esta continua. */
export async function trocarSenha(atual: string, nova: string): Promise<number> {
  const conexao = await lerConexao();
  if (!conexao) throw new Error('sem sessão: entre de novo no Perfil');
  try {
    const r = await chamarApi<{ outrosAparelhosEncerrados: number }>(conexao, '/me/senha', {
      method: 'PUT',
      body: JSON.stringify({ atual, nova }),
    });
    return r.outrosAparelhosEncerrados;
  } catch (e) {
    if (e instanceof ErroHttp) throw new Error(e.detalhe ?? e.message, { cause: e });
    throw new Error('sem resposta do servidor: trocar a senha precisa de rede', { cause: e });
  }
}

/**
 * "Sair da conta": revoga o token no servidor. Sem rede, segue assim mesmo — o token some deste
 * aparelho de qualquer jeito, e o administrador ainda pode revogá-lo no banco.
 */
export async function encerrarSessaoNoServidor(): Promise<boolean> {
  const conexao = await lerConexao();
  if (!conexao) return true;
  try {
    await chamarApi(conexao, '/auth/sair', { method: 'POST' }, 5_000);
    return true;
  } catch {
    return false;
  }
}
