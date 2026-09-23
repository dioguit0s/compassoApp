import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { autenticacao, type VariaveisAutenticadas } from './auth';
import type { Config } from './config';
import type { Banco } from './db/banco';
import { rotasDaEconomia } from './economia';
import { ARQUIVO_AVATAR, rotasDePerfil } from './perfil';
import { serializarUsuario } from './serializar';
import { rotasDaGrade } from './grade';
import { rotasDeImportacao } from './importacao';
import { rotasDeItens } from './itens';
import { rotasDeSync } from './sync';

export function criarApp(banco: Banco, config: Config) {
  const app = new Hono();

  app.onError((erro, c) => {
    if (erro instanceof HTTPException) return erro.getResponse();
    console.error(erro);
    return c.json({ erro: 'erro interno' }, 500);
  });

  // Sem autenticação: /health (túnel e deploy) e /avatares.
  app.get('/health', (c) => c.json({ ok: true }));

  // Fotos de perfil, públicas como o Nginx as serve em produção (deploy/nginx.conf.example): o nome
  // é aleatório e muda a cada troca. Em produção o Nginx responde antes; sem ele (desenvolvimento)
  // o app recebia 401 e ficava nas iniciais depois de enviar a foto (visto no emulador).
  app.get('/avatares/:arquivo', async (c) => {
    const arquivo = c.req.param('arquivo');
    if (!ARQUIVO_AVATAR.test(arquivo)) return c.notFound();
    try {
      const dados = await readFile(join(config.avatarDir, arquivo));
      return c.body(dados, 200, {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=31536000, immutable',
      });
    } catch {
      return c.notFound();
    }
  });

  const autenticada = new Hono<{ Variables: VariaveisAutenticadas }>();
  autenticada.use('*', autenticacao(banco));

  autenticada.get('/me', async (c) => {
    const usuario = await c.var.transacao((r) => r.usuarios.atual());
    if (!usuario) return c.json({ erro: 'conta não encontrada' }, 404);
    return c.json(serializarUsuario(usuario));
  });

  autenticada.route('/sync', rotasDeSync(config));
  autenticada.route('/', rotasDeItens());
  autenticada.route('/import', rotasDeImportacao());
  autenticada.route('/', rotasDaGrade());
  autenticada.route('/', rotasDaEconomia());
  autenticada.route('/', rotasDePerfil(config));

  app.route('/', autenticada);
  return app;
}
