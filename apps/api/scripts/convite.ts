/**
 * Convites de cadastro (F10, ADR-0008), com o papel dono.
 *
 *   npm run convite:criar -w @compasso/api -- [nota] [dias]     (padrão: 7 dias)
 *   npm run convite:listar -w @compasso/api
 *
 * O código aparece UMA vez. Mande para a pessoa junto com o endereço do servidor; ela cria a conta
 * no app, em Perfil → Criar conta.
 */
import { FUSO_PADRAO } from '@compasso/core';
import { Admin } from '../src/db/admin';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL não definida (o script usa o papel dono, não o da API).');
  process.exit(1);
}

const data = (d: Date) => d.toLocaleString('pt-BR', { timeZone: FUSO_PADRAO });
const [modo, ...args] = process.argv.slice(2);
const admin = await Admin.conectar(url);
try {
  if (modo === 'criar') {
    const dias = args[1] ? Number(args[1]) : 7;
    const { codigo, venceEm } = await admin.criarConvite(args[0] ?? null, dias);
    console.log(`Convite (vale uma conta, até ${data(venceEm)}):\n\n  ${codigo}\n`);
  } else if (modo === 'listar') {
    const agora = new Date();
    for (const c of await admin.listarConvites()) {
      const estado = c.used_at
        ? `usado por ${c.display_name ?? '?'} em ${data(c.used_at)}`
        : c.expires_at <= agora
          ? `vencido em ${data(c.expires_at)}`
          : `aberto até ${data(c.expires_at)}`;
      console.log(`${data(c.created_at)} · ${c.note ?? '(sem nota)'} · ${estado}`);
    }
  } else {
    console.error('uso: convite.ts criar [nota] [dias] | listar');
    process.exitCode = 1;
  }
} catch (erro) {
  console.error((erro as Error).message);
  process.exitCode = 1;
} finally {
  await admin.fechar();
}
