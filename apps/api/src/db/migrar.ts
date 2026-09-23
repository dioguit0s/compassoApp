import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const PASTA_MIGRACOES = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica as migrações pendentes. Precisa do papel dono (DATABASE_ADMIN_URL), nunca do da API. */
export async function migrar(urlAdmin: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await migrate(drizzle({ client: cliente }), { migrationsFolder: PASTA_MIGRACOES });
  } finally {
    await cliente.end();
  }
}
