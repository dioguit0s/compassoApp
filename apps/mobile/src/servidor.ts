import * as SecureStore from 'expo-secure-store';

/**
 * URL da API e token do aparelho. Ficam no armazenamento seguro do sistema, digitados na primeira
 * abertura — nunca no bundle (EXPO_PUBLIC_* é embutido em texto puro no JS).
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

export async function salvarConexao(c: ConexaoServidor): Promise<void> {
  await SecureStore.setItemAsync(CHAVE_URL, c.url.trim().replace(/\/+$/, ''));
  await SecureStore.setItemAsync(CHAVE_TOKEN, c.token.trim());
}

export async function esquecerConexao(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_URL);
  await SecureStore.deleteItemAsync(CHAVE_TOKEN);
}

export class ErroHttp extends Error {
  constructor(readonly status: number) {
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
    if (!r.ok) throw new ErroHttp(r.status);
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
  limiteMs = 120_000,
): Promise<T> {
  const form = new FormData();
  // React Native aceita { uri, name, type } como arquivo em FormData.
  form.append('arquivo', {
    uri: arquivo.uri,
    name: arquivo.name,
    type: arquivo.mimeType ?? 'text/calendar',
  } as unknown as Blob);
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const r = await fetch(`${conexao.url}${caminho}`, {
      method: 'POST',
      body: form,
      signal: controle.signal,
      headers: { authorization: `Bearer ${conexao.token}` },
    });
    const corpo = (await r.json().catch(() => ({}))) as T & { erro?: string };
    if (!r.ok) throw new Error(corpo.erro ?? `HTTP ${r.status}`);
    return corpo;
  } finally {
    clearTimeout(timer);
  }
}
