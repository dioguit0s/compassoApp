import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { criarRepositorios, type Repositorios } from './repositorios';

export interface Sessao {
  userId: string;
  tipo: 'session' | 'service';
  /** Só em token de serviço: `agenda:read`, `agenda:write`. */
  escopos: string[] | null;
}

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Único ponto do código que segura o cliente do banco. Fora de `src/db/`, nada importa `pg`
 * nem `drizzle-orm/node-postgres`: rotas recebem repositórios já escopados.
 */
export class Banco {
  private readonly pool: pg.Pool;
  private readonly db: Db;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 5 });
    this.db = drizzle({ client: this.pool, schema, casing: 'snake_case' });
  }

  /**
   * Abre uma transação escopada a `userId`: define `app.user_id` com SET LOCAL (liga o RLS) e
   * entrega repositórios que injetam `userId` em toda consulta e escrita.
   */
  comUsuario<T>(userId: string, fn: (repos: Repositorios) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return fn(criarRepositorios(tx, userId));
    });
  }

  /**
   * Resolve o hash de um token para a conta, o tipo e os escopos, sem precisar de `app.user_id`
   * definido. Token de sessão (aparelho) não tem escopos: acesso total (ADR-0012).
   */
  async resolverToken(tokenHash: string): Promise<Sessao | null> {
    const r = await this.db.execute<{
      user_id: string;
      kind: 'session' | 'service';
      scopes: string[] | null;
    }>(sql`select user_id, kind, scopes from resolver_sessao(${tokenHash})`);
    const l = r.rows[0];
    return l ? { userId: l.user_id, tipo: l.kind, escopos: l.scopes } : null;
  }

  /** Entrar (F10): acha a credencial pelo e-mail, antes de existir `app.user_id`. */
  async credencialPorEmail(
    email: string,
  ): Promise<{ userId: string; passwordHash: string } | null> {
    const r = await this.db.execute<{ user_id: string; password_hash: string }>(
      sql`select user_id, password_hash from credencial_por_email(${email})`,
    );
    const linha = r.rows[0];
    return linha ? { userId: linha.user_id, passwordHash: linha.password_hash } : null;
  }

  /** Cadastro por convite (F10): tudo ou nada, dentro de `cadastrar_conta`. */
  async cadastrarConta(p: {
    conviteHash: string;
    userId: string;
    nome: string;
    cor: string;
    email: string;
    senhaHash: string;
    tokenHash: string;
    rotulo: string;
  }): Promise<'ok' | 'convite' | 'email'> {
    const r = await this.db.execute<{ resultado: 'ok' | 'convite' | 'email' }>(
      sql`select cadastrar_conta(${p.conviteHash}, ${p.userId}, ${p.nome}, ${p.cor}, ${p.email},
        ${p.senhaHash}, ${p.tokenHash}, ${p.rotulo}) as resultado`,
    );
    return r.rows[0]!.resultado;
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }
}
