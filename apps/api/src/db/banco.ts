import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { criarRepositorios, type Repositorios } from './repositorios';

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

  /** Resolve o hash de um token para o `userId`, sem precisar de `app.user_id` definido. */
  async resolverToken(tokenHash: string): Promise<string | null> {
    const r = await this.db.execute<{ user_id: string | null }>(
      sql`select resolver_token(${tokenHash}) as user_id`,
    );
    return r.rows[0]?.user_id ?? null;
  }

  /** Relógio do banco. Usado para o cursor de sync — nunca `Date.now()` da API. */
  async agora(): Promise<Date> {
    const r = await this.db.execute<{ agora: Date }>(sql`select now() as agora`);
    return r.rows[0]!.agora;
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }
}
