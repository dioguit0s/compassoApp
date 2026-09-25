import { createHash } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { Banco, Sessao } from './db/banco';
import type { Repositorios } from './db/repositorios';

export interface VariaveisAutenticadas {
  userId: string;
  /** Hash do token desta requisição: sair revoga só ele, trocar a senha revoga os outros. */
  tokenHash: string;
  /** Tipo e escopos do token (ADR-0012). */
  sessao: Sessao;
  /** Executa `fn` numa transação escopada à conta autenticada. */
  transacao: <T>(fn: (repos: Repositorios) => Promise<T>) => Promise<T>;
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Lê o Bearer do cabeçalho; `null` quando ausente ou fora do formato. */
export function tokenDoCabecalho(cabecalho: string | undefined): string | null {
  const [esquema, token, ...resto] = (cabecalho ?? '').split(' ');
  if (esquema !== 'Bearer' || !token || resto.length || token.length < 32 || token.length > 256) {
    return null;
  }
  return token;
}

/**
 * Token de sessão → `userId`. Cada aparelho tem o seu, emitido ao entrar com e-mail e senha
 * (ou, para a conta criada por script, pelo próprio script) e revogável individualmente
 * (ADR-0008). O resto da API só enxerga o `userId`.
 *
 * O token não é comparado diretamente: a busca é pelo SHA-256 dele, então o tempo da consulta
 * não depende de quantos caracteres do token recebido coincidem com o guardado.
 *
 * Token de serviço (a Luna, ADR-0012) é válido mas não entra aqui: 403, não 401 — o app trata
 * 401 como sessão encerrada, e a integração precisa saber que o token existe mas não alcança
 * esta rota. A porta dele é /api/v1 (`v1/auth.ts`).
 */
export function autenticacao(banco: Banco) {
  return createMiddleware<{ Variables: VariaveisAutenticadas }>(async (c, next) => {
    const token = tokenDoCabecalho(c.req.header('authorization'));
    if (!token) return c.json({ erro: 'não autorizado' }, 401);
    const tokenHash = hashDoToken(token);
    const sessao = await banco.resolverToken(tokenHash);
    if (!sessao) return c.json({ erro: 'não autorizado' }, 401);
    if (sessao.tipo !== 'session') {
      return c.json({ erro: 'token de serviço só acessa /api/v1' }, 403);
    }
    definirSessao(c, banco, tokenHash, sessao);
    await next();
  });
}

export function definirSessao(
  c: { set: <K extends keyof VariaveisAutenticadas>(k: K, v: VariaveisAutenticadas[K]) => void },
  banco: Banco,
  tokenHash: string,
  sessao: Sessao,
): void {
  c.set('userId', sessao.userId);
  c.set('tokenHash', tokenHash);
  c.set('sessao', sessao);
  c.set('transacao', (fn) => banco.comUsuario(sessao.userId, fn));
}
