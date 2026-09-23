import { createHash } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { Banco } from './db/banco';
import type { Repositorios } from './db/repositorios';

export interface VariaveisAutenticadas {
  userId: string;
  /** Executa `fn` numa transação escopada à conta autenticada. */
  transacao: <T>(fn: (repos: Repositorios) => Promise<T>) => Promise<T>;
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Token estático → `userId`. O resto da API só enxerga o `userId`, então trocar por
 * autenticação real (F10) mexe só aqui.
 *
 * O token não é comparado diretamente: a busca é pelo SHA-256 dele, então o tempo da consulta
 * não depende de quantos caracteres do token recebido coincidem com o guardado.
 */
export function autenticacao(banco: Banco) {
  return createMiddleware<{ Variables: VariaveisAutenticadas }>(async (c, next) => {
    const cabecalho = c.req.header('authorization') ?? '';
    const [esquema, token] = cabecalho.split(' ');
    if (esquema !== 'Bearer' || !token || token.length < 32 || token.length > 256) {
      return c.json({ erro: 'não autorizado' }, 401);
    }
    const userId = await banco.resolverToken(hashDoToken(token));
    if (!userId) return c.json({ erro: 'não autorizado' }, 401);

    c.set('userId', userId);
    c.set('transacao', (fn) => banco.comUsuario(userId, fn));
    await next();
  });
}
