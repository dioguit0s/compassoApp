/**
 * Administração de contas, com o papel dono. Segredos aparecem UMA vez, na saída.
 *
 *   npm run conta:criar -w @compasso/api -- "Nome de Exibição"
 *   npm run conta:token -w @compasso/api -- <userId> "rótulo do aparelho"
 *   npm run conta:acesso -w @compasso/api -- <userId|e-mail> [e-mail novo]
 *
 * `conta:acesso` define e-mail e uma senha temporária (F10, ADR-0008): dá login à conta criada
 * por script e é o caminho de "esqueci a senha". A pessoa troca a senha no app depois.
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
  } else if (modo === 'acesso' && args[0]) {
    const alvo = args[0];
    const userId = alvo.includes('@') ? await admin.contaPorEmail(alvo) : alvo;
    const email = args[1] ?? (alvo.includes('@') ? alvo : undefined);
    if (!userId) throw new Error(`nenhuma conta com o e-mail ${alvo}`);
    if (!email) throw new Error('informe o e-mail: conta:acesso <userId> <e-mail>');
    const senha = await admin.definirAcesso(userId, email);
    console.log(`Acesso definido para ${email} (conta ${userId}).`);
    console.log(`Senha temporária (guarde agora, troque no app em Configurações):\n\n  ${senha}\n`);
  } else {
    console.error(
      'uso: criar-conta.ts criar "Nome" [rótulo] | token <userId> "rótulo" | acesso <userId|e-mail> [e-mail]',
    );
    process.exitCode = 1;
  }
} catch (erro) {
  console.error((erro as Error).message);
  process.exitCode = 1;
} finally {
  await admin.fechar();
}
