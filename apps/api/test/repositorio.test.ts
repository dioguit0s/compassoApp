import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ambiente } from './ajuda';

let env: Awaited<ReturnType<typeof ambiente>>;
beforeAll(async () => {
  env = await ambiente();
});
afterAll(() => env.fechar());

describe('camada de repositório', () => {
  it('usuarios.atual devolve só a conta do escopo', async () => {
    const a = await env.admin.criarConta('Repo A');
    await env.admin.criarConta('Repo B');
    const u = await env.banco.comUsuario(a.userId, (r) => r.usuarios.atual());
    expect(u?.id).toBe(a.userId);
  });

  it('userId inexistente não enxerga nada', async () => {
    const u = await env.banco.comUsuario('00000000-0000-7000-8000-000000000000', (r) =>
      r.usuarios.atual(),
    );
    expect(u).toBeNull();
  });
});
