import * as schema from '@compasso/core/local';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// enableChangeListener: useLiveQuery re-renderiza a tela quando a tabela muda.
const sqlite = openDatabaseSync('compasso.db', { enableChangeListener: true });

export const db = drizzle(sqlite, { schema, casing: 'snake_case' });
export type DbLocal = typeof db;
