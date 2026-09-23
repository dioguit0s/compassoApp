/**
 * Cria uma conta e imprime o token de acesso UMA vez.
 *
 *   npm run conta:criar -w @compasso/api -- "Nome de Exibição"
 *   npm run conta:token -w @compasso/api -- <userId> "rótulo do aparelho"
 */
import { Admin } from '../src/db/admin';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL não definida (o script usa o papel dono, não o da API).');
  process.exit(1);
}

const [modo, ...args] = process.argv.slice(2);
const admin = await Admin.conectar(url);
try {
  if (modo === 'criar' && args[0]) {
    const { userId, token } = await admin.criarConta(args[0], args[1]);
    console.log(`Conta criada: ${userId}`);
    console.log(`Token (guarde agora, não será mostrado de novo):\n\n  ${token}\n`);
  } else if (modo === 'token' && args[0] && args[1]) {
    const token = await admin.emitirToken(args[0], args[1]);
    console.log(`Token (guarde agora, não será mostrado de novo):\n\n  ${token}\n`);
  } else {
    console.error('uso: criar-conta.ts criar "Nome" [rótulo] | token <userId> "rótulo"');
    process.exitCode = 1;
  }
} finally {
  await admin.fechar();
}
