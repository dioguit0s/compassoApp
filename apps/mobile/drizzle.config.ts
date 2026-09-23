import { defineConfig } from 'drizzle-kit';

// O schema local mora em packages/core/src/local (ver comentário lá). As migrações ficam aqui,
// empacotadas no app e aplicadas na abertura por useMigrations.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: '../../packages/core/src/local/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
