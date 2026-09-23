import { metadados } from '@compasso/core/local';
import { eq } from 'drizzle-orm';
import { db } from './db';

/**
 * Preferências de interface deste aparelho (não sincronizam), na mesma tabela chave-valor do
 * estado de sync, com prefixo `ui.`.
 */
export function lerPreferencia(chave: string): string | null {
  const linha = db
    .select()
    .from(metadados)
    .where(eq(metadados.chave, `ui.${chave}`))
    .get();
  return linha?.valor ?? null;
}

export function gravarPreferencia(chave: string, valor: string): void {
  db.insert(metadados)
    .values({ chave: `ui.${chave}`, valor })
    .onConflictDoUpdate({ target: metadados.chave, set: { valor } })
    .run();
}
