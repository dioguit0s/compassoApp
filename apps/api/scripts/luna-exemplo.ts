/**
 * Conta de demonstração para a integração com a Luna (ADR-0012): cria uma conta nova, separada
 * da sua, com dados de exemplo (evento recorrente, evento com horário, dia inteiro, aula, prova,
 * tarefas com e sem prazo) e um token de serviço com leitura e escrita. Segredos aparecem UMA vez.
 *
 *   npm run luna:exemplo -w @compasso/api -- ["Nome da conta"]
 *
 * Precisa de DATABASE_ADMIN_URL (criar a conta) e DATABASE_URL (gravar como a API grava).
 * A conta de exemplo não tem e-mail nem senha; `conta:acesso` dá acesso a ela (docs/luna.md).
 */
import { diaDe } from '@compasso/core';
import { randomBytes } from 'node:crypto';
import { hashDoToken } from '../src/auth';
import { Admin } from '../src/db/admin';
import { Banco } from '../src/db/banco';
import { semearExemplo } from '../src/v1/exemplo';

const urlAdmin = process.env.DATABASE_ADMIN_URL;
const urlApp = process.env.DATABASE_URL;
if (!urlAdmin || !urlApp) {
  console.error('DATABASE_ADMIN_URL e DATABASE_URL precisam estar definidas.');
  process.exit(1);
}

const admin = await Admin.conectar(urlAdmin);
const banco = new Banco(urlApp);
try {
  const { userId } = await admin.criarConta(process.argv[2] ?? 'Luna (exemplo)', 'script');
  const token = randomBytes(32).toString('base64url');
  const ids = await banco.comUsuario(userId, async (r) => {
    const ids = await semearExemplo(r, diaDe(new Date()));
    await r.acesso.emitirTokenDeServico(hashDoToken(token), 'Luna (teste)', [
      'agenda:read',
      'agenda:write',
    ]);
    return ids;
  });
  console.log(`Conta de exemplo: ${userId}`);
  console.log(`Itens: ${JSON.stringify(ids, null, 2)}`);
  console.log(`Token de serviço (guarde agora, não será mostrado de novo):\n\n  ${token}\n`);
} catch (erro) {
  console.error((erro as Error).message);
  process.exitCode = 1;
} finally {
  await banco.fechar();
  await admin.fechar();
}
