import { serve } from '@hono/node-server';
import { criarApp } from './app';
import { lerConfig } from './config';
import { Banco } from './db/banco';

const config = lerConfig();
const banco = new Banco(config.databaseUrl);
const app = criarApp(banco, config);

const servidor = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Compasso API ouvindo na porta ${info.port}`);
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    servidor.close();
    void banco.fechar().then(() => process.exit(0));
  });
}
