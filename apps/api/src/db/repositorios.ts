import { eq } from 'drizzle-orm';
import type { Tx } from './banco';
import { users } from './schema';

export type Usuario = typeof users.$inferSelect;

/**
 * Repositórios escopados. Quem chama nunca passa `userId`: ele vem da fábrica e entra em toda
 * consulta. O RLS (app.user_id) é a segunda camada, para a consulta que escapar desta.
 */
export function criarRepositorios(tx: Tx, userId: string) {
  return {
    usuarios: {
      /** A tabela users é o caso em que a própria linha é o dono: filtra por `id`. */
      async atual(): Promise<Usuario | null> {
        const [linha] = await tx.select().from(users).where(eq(users.id, userId));
        return linha ?? null;
      },
    },
  };
}

export type Repositorios = ReturnType<typeof criarRepositorios>;
