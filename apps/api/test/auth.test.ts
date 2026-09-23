import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ambiente, comToken } from './ajuda';

let env: Awaited<ReturnType<typeof ambiente>>;
beforeAll(async () => {
  env = await ambiente();
});
afterAll(() => env.fechar());

describe('GET /health', () => {
  it('responde sem autenticação', async () => {
    const r = await env.app.request('/health');
    expect(r.status).toBe(200);
  });
});

describe('GET /me', () => {
  it('sem token → 401', async () => {
    expect((await env.app.request('/me')).status).toBe(401);
  });

  it('token errado → 401', async () => {
    const r = await env.app.request('/me', comToken('x'.repeat(43)));
    expect(r.status).toBe(401);
  });

  it('esquema errado → 401', async () => {
    const { token } = await env.admin.criarConta('Esquema');
    const r = await env.app.request('/me', { headers: { authorization: `Basic ${token}` } });
    expect(r.status).toBe(401);
  });

  it('token certo → dados da conta', async () => {
    const { userId, token } = await env.admin.criarConta('Diogo Santos');
    const r = await env.app.request('/me', comToken(token));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({
      id: userId,
      displayName: 'Diogo Santos',
      avatarKind: 'initials',
    });
  });

  it('duas contas: o token de uma não enxerga a outra', async () => {
    const a = await env.admin.criarConta('Conta A');
    const b = await env.admin.criarConta('Conta B');
    const ra = (await (await env.app.request('/me', comToken(a.token))).json()) as { id: string };
    const rb = (await (await env.app.request('/me', comToken(b.token))).json()) as { id: string };
    expect(ra.id).toBe(a.userId);
    expect(rb.id).toBe(b.userId);
  });

  it('segundo token da mesma conta funciona', async () => {
    const { userId } = await env.admin.criarConta('Dois Aparelhos');
    const token2 = await env.admin.emitirToken(userId, 'tablet');
    const r = (await (await env.app.request('/me', comToken(token2))).json()) as { id: string };
    expect(r.id).toBe(userId);
  });
});
