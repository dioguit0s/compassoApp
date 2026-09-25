import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { rotasDeAcesso, rotasPublicasDeAcesso } from './acesso';
import { autenticacao, type VariaveisAutenticadas } from './auth';
import type { Config } from './config';
import type { Banco } from './db/banco';
import { rotasDaEconomia } from './economia';
import { ARQUIVO_AVATAR, rotasDePerfil } from './perfil';
import { serializarUsuario } from './serializar';
import { rotasDaGrade } from './grade';
import { rotasDeImportacao } from './importacao';
import { rotasDeItens } from './itens';
import { LimiteDeTentativas } from './limite';
import { rotasDeSync } from './sync';
import { rotasDeTokensDeServico } from './tokensDeServico';
import { rotasV1 } from './v1/rotas';

export function criarApp(banco: Banco, config: Config) {
  const app = new Hono();

  app.onError((erro, c) => {
    if (erro instanceof HTTPException) return erro.getResponse();
    console.error(erro);
    return c.json({ erro: 'erro interno' }, 500);
  });

  // Sem autenticação: /health (túnel e deploy), /avatares, cadastro e entrada.
  app.get('/health', (c) => c.json({ ok: true }));

  const limite = new LimiteDeTentativas(); // por conta: 5 em 15 min
  const limitePorIp = new LimiteDeTentativas(20); // por IP: 20 em 15 min, qualquer e-mail
  app.route('/', rotasPublicasDeAcesso(banco, limite, limitePorIp));

  // Fotos de perfil, públicas: o nome é aleatório e muda a cada troca, então o cache é imutável.
  // Servidas pela própria API em desenvolvimento e em produção (não há Nginx, ADR-0011).
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

  // A porta da Luna (ADR-0012), antes do middleware de sessão: tem autenticação, escopos e
  // formato de erro próprios, e aceita o token de serviço que as outras rotas recusam.
  app.route('/api/v1', rotasV1(banco, { versao: config.versao }));

  const autenticada = new Hono<{ Variables: VariaveisAutenticadas }>();
  autenticada.use('*', autenticacao(banco));

  autenticada.get('/me', async (c) => {
    const usuario = await c.var.transacao((r) => r.usuarios.atual());
    if (!usuario) return c.json({ erro: 'conta não encontrada' }, 404);
    return c.json(serializarUsuario(usuario));
  });

  autenticada.route('/', rotasDeAcesso(limite));
  autenticada.route('/', rotasDeTokensDeServico());
  autenticada.route('/sync', rotasDeSync(config));
  autenticada.route('/', rotasDeItens());
  autenticada.route('/import', rotasDeImportacao());
  autenticada.route('/', rotasDaGrade());
  autenticada.route('/', rotasDaEconomia());
  autenticada.route('/', rotasDePerfil(config));

  app.route('/', autenticada);
  return app;
}
