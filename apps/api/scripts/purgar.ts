/**
 * Purga de tombstones mais antigos que TRASH_RETENTION_DAYS (padrão 30). Diária, pelo
 * deploy/manutencao.sh, com o papel dono (DATABASE_ADMIN_URL).
 */
import { Admin } from '../src/db/admin';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL não definida.');
  process.exit(1);
}
const dias = Number(process.env.TRASH_RETENTION_DAYS || 30);
if (!Number.isInteger(dias) || dias < 1) {
  console.error('TRASH_RETENTION_DAYS precisa ser inteiro >= 1.');
  process.exit(1);
}

const admin = await Admin.conectar(url);
try {
  const n = await admin.purgarTombstones(dias);
  console.log(`purga: ${n} tombstone(s) com mais de ${dias} dias removido(s)`);
} finally {
  await admin.fechar();
}
