import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { autenticacao, type VariaveisAutenticadas } from './auth';
import type { Config } from './config';
import type { Banco } from './db/banco';
import type { Usuario } from './db/repositorios';

export function serializarUsuario(u: Usuario) {
  return {
    id: u.id,
    displayName: u.displayName,
    avatarKind: u.avatarKind,
    avatarPath: u.avatarPath,
    accentColor: u.accentColor,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function criarApp(banco: Banco, _config: Config) {
  const app = new Hono();

  app.onError((erro, c) => {
    if (erro instanceof HTTPException) return erro.getResponse();
    console.error(erro);
    return c.json({ erro: 'erro interno' }, 500);
  });

  // Única rota sem autenticação: usada pelo túnel e pelo deploy.
  app.get('/health', (c) => c.json({ ok: true }));

  const autenticada = new Hono<{ Variables: VariaveisAutenticadas }>();
  autenticada.use('*', autenticacao(banco));

  autenticada.get('/me', async (c) => {
    const usuario = await c.var.transacao((r) => r.usuarios.atual());
    if (!usuario) return c.json({ erro: 'conta não encontrada' }, 404);
    return c.json(serializarUsuario(usuario));
  });

  app.route('/', autenticada);
  return app;
}
