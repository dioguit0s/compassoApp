import { migrar } from '../src/db/migrar';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL não definida.');
  process.exit(1);
}
await migrar(url);
console.log('Migrações aplicadas.');
