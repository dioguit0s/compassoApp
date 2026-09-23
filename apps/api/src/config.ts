/** Variáveis de ambiente da API (especificação §9). */
export interface Config {
  databaseUrl: string;
  port: number;
  tzDefault: string;
  trashRetentionDays: number;
  syncCursorWindowSeconds: number;
}

function inteiro(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nome} precisa ser um inteiro >= 0`);
  return n;
}

export function lerConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não definida');
  return {
    databaseUrl,
    port: inteiro('PORT', 3000),
    tzDefault: process.env.TZ_DEFAULT || 'America/Sao_Paulo',
    trashRetentionDays: inteiro('TRASH_RETENTION_DAYS', 30),
    syncCursorWindowSeconds: inteiro('SYNC_CURSOR_WINDOW_SECONDS', 60),
  };
}
