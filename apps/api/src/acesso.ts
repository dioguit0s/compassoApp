import { corDerivadaDoNome, novoId } from '@compasso/core';
import { randomBytes } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { hashDoToken, type VariaveisAutenticadas } from './auth';
import { hashDoConvite, normalizarCodigo } from './convite';
import type { Banco } from './db/banco';
import type { LimiteDeTentativas } from './limite';
import {
  conferirSenha,
  esquemaEmail,
  gerarHashDeSenha,
  hashDeSenhaFicticio,
  SENHA_MAX,
  SENHA_MIN,
} from './senha';
import { serializarUsuario } from './serializar';

const email = esquemaEmail;
const senha = z
  .string()
  .min(SENHA_MIN, { error: `a senha precisa ter ao menos ${SENHA_MIN} caracteres` })
  .max(SENHA_MAX);
const aparelho = z.string().trim().min(1).max(100).default('aparelho');

const esquemaCadastro = z
  .object({
    convite: z.string().max(64),
    nome: z.string().trim().min(1).max(100),
    email,
    senha,
    aparelho,
  })
  .strict();

const esquemaEntrada = z.object({ email, senha: z.string().max(SENHA_MAX), aparelho }).strict();

const esquemaTrocaDeSenha = z.object({ atual: z.string().max(SENHA_MAX), nova: senha }).strict();

/** Token de sessão: 32 bytes aleatórios em base64url (43 caracteres), como o do script. */
function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

const limiteDeCorpo = bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) => c.json({ erro: 'corpo grande demais' }, 413),
});

function invalido(c: Context, erro: z.ZodError) {
  return c.json(
    { erro: erro.issues[0]?.message ?? 'payload inválido', detalhes: erro.issues },
    400,
  );
}

/**
 * IP de origem. Atrás do túnel, a Cloudflare põe o do cliente em `CF-Connecting-IP`; sem túnel
 * (rede local), vale o da conexão. O cabeçalho pode ser forjado fora do túnel, mas aí só engana o
 * limite por IP — o por conta e o teto de hashes simultâneos continuam.
 */
function ipDe(c: Context): string {
  const cabecalho = c.req.header('cf-connecting-ip');
  if (cabecalho) return cabecalho;
  try {
    return getConnInfo(c).remote.address ?? 'desconhecido';
  } catch {
    return 'desconhecido'; // app.request() dos testes não tem conexão
  }
}

function bloqueado(c: Context, segundos: number) {
  c.header('retry-after', String(segundos));
  return c.json(
    { erro: `muitas tentativas; tente de novo em ${Math.ceil(segundos / 60)} min` },
    429,
  );
}

/**
 * Rotas públicas de acesso (F10, ADR-0008): cadastro com convite e entrada com e-mail e senha.
 * As duas devolvem um token de sessão novo, um por aparelho, guardado só como SHA-256.
 */
export function rotasPublicasDeAcesso(
  banco: Banco,
  limite: LimiteDeTentativas,
  limitePorIp: LimiteDeTentativas,
) {
  const rotas = new Hono();

  rotas.post('/auth/cadastro', limiteDeCorpo, async (c) => {
    const corpo = esquemaCadastro.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return invalido(c, corpo.error);
    const d = corpo.data;
    if (normalizarCodigo(d.convite).length !== 16) {
      return c.json({ erro: 'convite inválido, já usado ou vencido' }, 403);
    }

    const userId = novoId();
    const token = novoToken();
    const resultado = await banco.cadastrarConta({
      conviteHash: hashDoConvite(d.convite),
      userId,
      nome: d.nome,
      cor: corDerivadaDoNome(d.nome),
      email: d.email,
      senhaHash: await gerarHashDeSenha(d.senha),
      tokenHash: hashDoToken(token),
      rotulo: d.aparelho,
    });
    if (resultado === 'convite') {
      return c.json({ erro: 'convite inválido, já usado ou vencido' }, 403);
    }
    if (resultado === 'email') return c.json({ erro: 'este e-mail já tem conta' }, 409);

    const usuario = await banco.comUsuario(userId, (r) => r.usuarios.atual());
    return c.json({ token, usuario: serializarUsuario(usuario!) }, 201);
  });

  rotas.post('/auth/entrar', limiteDeCorpo, async (c) => {
    const corpo = esquemaEntrada.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return invalido(c, corpo.error);
    const d = corpo.data;

    const ip = `ip:${ipDe(c)}`;
    const espera = Math.max(limite.bloqueadoPor(d.email), limitePorIp.bloqueadoPor(ip));
    if (espera) return bloqueado(c, espera);

    const credencial = await banco.credencialPorEmail(d.email);
    // E-mail desconhecido confere contra um hash fictício: mesmo tempo, mesma resposta.
    const ok = await conferirSenha(
      d.senha,
      credencial?.passwordHash ?? (await hashDeSenhaFicticio()),
    );
    if (!credencial || !ok) {
      limite.registrarFalha(d.email);
      limitePorIp.registrarFalha(ip);
      return c.json({ erro: 'e-mail ou senha incorretos' }, 401);
    }
    limite.limpar(d.email);

    const token = novoToken();
    const usuario = await banco.comUsuario(credencial.userId, async (r) => {
      await r.acesso.emitirToken(hashDoToken(token), d.aparelho);
      return r.usuarios.atual();
    });
    return c.json({ token, usuario: serializarUsuario(usuario!) });
  });

  return rotas;
}

/** Rotas de acesso que exigem sessão: sair e trocar a senha. */
export function rotasDeAcesso(limite: LimiteDeTentativas) {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.post('/auth/sair', async (c) => {
    const tokenHash = c.var.tokenHash;
    await c.var.transacao((r) => r.acesso.revogarToken(tokenHash));
    return c.body(null, 204);
  });

  rotas.put('/me/senha', limiteDeCorpo, async (c) => {
    const corpo = esquemaTrocaDeSenha.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return invalido(c, corpo.error);
    const chave = `conta:${c.var.userId}`;
    const espera = limite.bloqueadoPor(chave);
    if (espera) return bloqueado(c, espera);

    const atual = await c.var.transacao((r) => r.acesso.hashDaSenha());
    if (!atual) {
      return c.json(
        { erro: 'esta conta ainda não tem senha; peça ao administrador (conta:acesso)' },
        409,
      );
    }
    // 403, não 401: o app trata 401 como sessão encerrada e esqueceria o token.
    if (!(await conferirSenha(corpo.data.atual, atual))) {
      limite.registrarFalha(chave);
      return c.json({ erro: 'senha atual incorreta' }, 403);
    }
    limite.limpar(chave);

    const novoHash = await gerarHashDeSenha(corpo.data.nova);
    const tokenHash = c.var.tokenHash;
    const encerrados = await c.var.transacao(async (r) => {
      await r.acesso.trocarHashDaSenha(novoHash);
      return r.acesso.revogarOutrosTokens(tokenHash);
    });
    return c.json({ outrosAparelhosEncerrados: encerrados });
  });

  return rotas;
}
