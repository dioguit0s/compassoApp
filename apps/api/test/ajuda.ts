import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';
import { criarApp } from '../src/app';
import type { Config } from '../src/config';
import { Admin } from '../src/db/admin';
import { Banco } from '../src/db/banco';

export const config: Config = {
  databaseUrl: inject('urlApp'),
  port: 0,
  tzDefault: 'America/Sao_Paulo',
  trashRetentionDays: 30,
  syncCursorWindowSeconds: 60,
  avatarDir: join(tmpdir(), `compasso-avatares-${process.pid}`),
  avatarMaxBytes: 5 * 1024 * 1024,
  versao: 'teste',
};

export async function ambiente() {
  const banco = new Banco(inject('urlApp'));
  const admin = await Admin.conectar(inject('urlAdmin'));
  const app = criarApp(banco, config);
  return {
    banco,
    admin,
    app,
    async fechar() {
      await banco.fechar();
      await admin.fechar();
    },
  };
}

export function comToken(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } };
}
