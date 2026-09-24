import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { gerarCodigoDeConvite, hashDoConvite, normalizarCodigo } from '../src/convite';
import { LimiteDeTentativas } from '../src/limite';
import { conferirSenha, gerarHashDeSenha } from '../src/senha';
import { ambiente, comToken } from './ajuda';

let env: Awaited<ReturnType<typeof ambiente>>;
let dono: pg.Client;
beforeAll(async () => {
  env = await ambiente();
  dono = new pg.Client({ connectionString: inject('urlAdmin') });
  await dono.connect();
});
afterAll(async () => {
  await dono.end();
  await env.fechar();
});

let seq = 0;
const emailNovo = () => `pessoa${++seq}.${Date.now()}@exemplo.com`;

function post(caminho: string, corpo: unknown, init: RequestInit = {}) {
  return env.app.request(caminho, {
    ...init,
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

async function cadastrar(extra: Record<string, unknown> = {}) {
  const { codigo } = await env.admin.criarConvite('teste');
  const email = emailNovo();
  const r = await post('/auth/cadastro', {
    convite: codigo,
    nome: 'Amiga Teste',
    email,
    senha: 'senha-boa-123',
    aparelho: 'Pixel',
    ...extra,
  });
  return { r, email, codigo };
}

describe('senha (scrypt)', () => {
  it('confere a certa e recusa a errada e a adulterada', async () => {
    const h = await gerarHashDeSenha('correta horse');
    expect(h.startsWith('scrypt$17$8$1$')).toBe(true);
    expect(await conferirSenha('correta horse', h)).toBe(true);
    expect(await conferirSenha('correta horsE', h)).toBe(false);
    expect(await conferirSenha('correta horse', h.slice(0, -2) + 'AA')).toBe(false);
    expect(await conferirSenha('correta horse', 'bcrypt$lixo')).toBe(false);
  });

  it('muitos hashes ao mesmo tempo terminam todos (fila com teto de simultâneos)', async () => {
    const hashes = await Promise.all(
      Array.from({ length: 5 }, (_, i) => gerarHashDeSenha(`s-${i}`)),
    );
    expect(new Set(hashes).size).toBe(5);
    expect(await conferirSenha('s-4', hashes[4]!)).toBe(true);
  });

  it('sal diferente a cada hash', async () => {
    expect(await gerarHashDeSenha('x'.repeat(8))).not.toBe(await gerarHashDeSenha('x'.repeat(8)));
  });
});

describe('limite de tentativas', () => {
  it('bloqueia na 5ª falha dentro da janela e libera depois dela', () => {
    let agora = 0;
    const l = new LimiteDeTentativas(5, 60_000, () => agora);
    for (let i = 0; i < 4; i++) l.registrarFalha('a');
    expect(l.bloqueadoPor('a')).toBe(0);
    l.registrarFalha('a');
    expect(l.bloqueadoPor('a')).toBe(60);
    expect(l.bloqueadoPor('b')).toBe(0);
    agora = 60_001;
    expect(l.bloqueadoPor('a')).toBe(0);
  });

  it('chaves vencidas saem quando o mapa passa de 1000', () => {
    let agora = 0;
    const l = new LimiteDeTentativas(5, 60_000, () => agora);
    for (let i = 0; i < 1000; i++) l.registrarFalha(`inventado${i}@x.com`);
    expect(l.tamanho).toBe(1000);
    agora = 60_001;
    l.registrarFalha('novo@x.com');
    expect(l.tamanho).toBe(1);
  });

  it('acerto zera a contagem', () => {
    const l = new LimiteDeTentativas(2, 60_000, () => 0);
    l.registrarFalha('a');
    l.limpar('a');
    l.registrarFalha('a');
    expect(l.bloqueadoPor('a')).toBe(0);
  });
});

describe('código de convite', () => {
  it('formato XXXX-XXXX-XXXX-XXXX, sem 0/O/1/I', () => {
    const c = gerarCodigoDeConvite();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  });

  it('caixa, espaços e hífens não mudam o hash', () => {
    const c = gerarCodigoDeConvite();
    const digitado = ` ${c.toLowerCase().replaceAll('-', ' ')} `;
    expect(normalizarCodigo(digitado)).toBe(c.replaceAll('-', ''));
    expect(hashDoConvite(digitado)).toBe(hashDoConvite(c));
  });
});

describe('POST /auth/cadastro', () => {
  it('cria a conta, devolve token que funciona e consome o convite', async () => {
    const { r, email, codigo } = await cadastrar();
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as {
      token: string;
      usuario: { id: string; displayName: string };
    };
    expect(corpo.usuario.displayName).toBe('Amiga Teste');

    const me = (await (await env.app.request('/me', comToken(corpo.token))).json()) as {
      id: string;
    };
    expect(me.id).toBe(corpo.usuario.id);

    const credencial = await dono.query('select email from credentials where user_id = $1', [
      corpo.usuario.id,
    ]);
    expect(credencial.rows[0].email).toBe(email);

    const segunda = await post('/auth/cadastro', {
      convite: codigo,
      nome: 'Outra',
      email: emailNovo(),
      senha: 'senha-boa-123',
    });
    expect(segunda.status).toBe(403);
  });

  it('aceita o código digitado em minúsculas e sem hífens', async () => {
    const { codigo } = await env.admin.criarConvite(null);
    const r = await post('/auth/cadastro', {
      convite: codigo.toLowerCase().replaceAll('-', ''),
      nome: 'Minúsculas',
      email: emailNovo(),
      senha: 'senha-boa-123',
    });
    expect(r.status).toBe(201);
  });

  it('convite inexistente ou vencido → 403', async () => {
    const r1 = await cadastrar({ convite: gerarCodigoDeConvite() });
    expect(r1.r.status).toBe(403);

    const { codigo } = await env.admin.criarConvite('vence');
    await dono.query(
      `update invites set expires_at = now() - interval '1 second' where code_hash = $1`,
      [hashDoConvite(codigo)],
    );
    const r2 = await cadastrar({ convite: codigo });
    expect(r2.r.status).toBe(403);
  });

  it('e-mail já cadastrado → 409, e o convite continua valendo', async () => {
    const primeiro = await cadastrar();
    const { codigo } = await env.admin.criarConvite('segundo');
    const r = await post('/auth/cadastro', {
      convite: codigo,
      nome: 'Duplicada',
      email: primeiro.email.toUpperCase(),
      senha: 'senha-boa-123',
    });
    expect(r.status).toBe(409);
    const usado = await dono.query('select used_at from invites where code_hash = $1', [
      hashDoConvite(codigo),
    ]);
    expect(usado.rows[0].used_at).toBeNull();
    const semUsuario = await dono.query(
      `select count(*)::int as n from users where display_name = 'Duplicada'`,
    );
    expect(semUsuario.rows[0].n).toBe(0);
  });

  it('senha curta e e-mail inválido → 400 com mensagem', async () => {
    const curta = await cadastrar({ senha: '1234567' });
    expect(curta.r.status).toBe(400);
    expect(((await curta.r.json()) as { erro: string }).erro).toMatch(/8 caracteres/);
    const email = await cadastrar({ email: 'não é e-mail' });
    expect(email.r.status).toBe(400);
  });

  it('dois cadastros simultâneos com o mesmo convite: só um passa', async () => {
    const { codigo } = await env.admin.criarConvite('corrida');
    const tentar = () =>
      post('/auth/cadastro', {
        convite: codigo,
        nome: 'Corrida',
        email: emailNovo(),
        senha: 'senha-boa-123',
      });
    const status = (await Promise.all([tentar(), tentar()])).map((r) => r.status).sort();
    expect(status).toEqual([201, 403]);
  });
});

describe('POST /auth/entrar', () => {
  it('senha certa → token novo; e-mail em qualquer caixa', async () => {
    const { email } = await cadastrar();
    const r = await post('/auth/entrar', {
      email: ` ${email.toUpperCase()} `,
      senha: 'senha-boa-123',
      aparelho: 'tablet',
    });
    expect(r.status).toBe(200);
    const { token } = (await r.json()) as { token: string };
    expect((await env.app.request('/me', comToken(token))).status).toBe(200);
  });

  it('senha errada e e-mail desconhecido → mesmo 401', async () => {
    const { email } = await cadastrar();
    const errada = await post('/auth/entrar', { email, senha: 'outra-senha' });
    const desconhecido = await post('/auth/entrar', { email: emailNovo(), senha: 'outra-senha' });
    expect(errada.status).toBe(401);
    expect(desconhecido.status).toBe(401);
    expect(await errada.json()).toEqual(await desconhecido.json());
  });

  it('5 falhas bloqueiam o e-mail, inclusive a senha certa, com Retry-After', async () => {
    const { email } = await cadastrar();
    for (let i = 0; i < 5; i++) {
      expect((await post('/auth/entrar', { email, senha: `errada-${i}` })).status).toBe(401);
    }
    const r = await post('/auth/entrar', { email, senha: 'senha-boa-123' });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('trocar de e-mail a cada tentativa: o limite por IP bloqueia na 20ª falha', async () => {
    const ip = { headers: { 'cf-connecting-ip': '203.0.113.7' } };
    for (let i = 0; i < 20; i++) {
      const r = await post('/auth/entrar', { email: emailNovo(), senha: 'chute-chute' }, ip);
      expect(r.status).toBe(401);
    }
    const { email } = await cadastrar();
    const bloqueada = await post('/auth/entrar', { email, senha: 'senha-boa-123' }, ip);
    expect(bloqueada.status).toBe(429);
    // Outro IP, mesma conta: passa.
    const outroIp = { headers: { 'cf-connecting-ip': '203.0.113.8' } };
    expect((await post('/auth/entrar', { email, senha: 'senha-boa-123' }, outroIp)).status).toBe(
      200,
    );
  }, 120_000); // 22 hashes scrypt em sequência

  it('conta:acesso recusa e-mail que a entrada recusaria', async () => {
    const { userId } = await env.admin.criarConta('E-mail Ruim');
    await expect(env.admin.definirAcesso(userId, 'diogo@localhost')).rejects.toThrow(
      /e-mail inválido/,
    );
  });

  it('conta criada por script entra depois de conta:acesso', async () => {
    const { userId } = await env.admin.criarConta('Legado');
    const email = emailNovo();
    const senha = await env.admin.definirAcesso(userId, email);
    const r = await post('/auth/entrar', { email, senha });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { usuario: { id: string } }).usuario.id).toBe(userId);
  });
});

describe('POST /auth/sair', () => {
  it('revoga só o token usado', async () => {
    const { r, email } = await cadastrar();
    const { token: t1 } = (await r.json()) as { token: string };
    const e2 = await post('/auth/entrar', { email, senha: 'senha-boa-123' });
    const { token: t2 } = (await e2.json()) as { token: string };

    expect((await env.app.request('/auth/sair', comToken(t1, { method: 'POST' }))).status).toBe(
      204,
    );
    expect((await env.app.request('/me', comToken(t1))).status).toBe(401);
    expect((await env.app.request('/me', comToken(t2))).status).toBe(200);
  });
});

describe('PUT /me/senha', () => {
  const trocar = (token: string, corpo: unknown) =>
    env.app.request(
      '/me/senha',
      comToken(token, {
        method: 'PUT',
        body: JSON.stringify(corpo),
        headers: { 'content-type': 'application/json' },
      }),
    );

  it('senha atual errada → 403 (não 401, que o app leria como sessão encerrada)', async () => {
    const { r } = await cadastrar();
    const { token } = (await r.json()) as { token: string };
    const t = await trocar(token, { atual: 'errada-errada', nova: 'nova-senha-456' });
    expect(t.status).toBe(403);
  });

  it('troca, encerra os outros aparelhos e mantém este', async () => {
    const { r, email } = await cadastrar();
    const { token: este } = (await r.json()) as { token: string };
    const e2 = await post('/auth/entrar', { email, senha: 'senha-boa-123' });
    const { token: outro } = (await e2.json()) as { token: string };

    const t = await trocar(este, { atual: 'senha-boa-123', nova: 'nova-senha-456' });
    expect(t.status).toBe(200);
    expect(await t.json()).toEqual({ outrosAparelhosEncerrados: 1 });

    expect((await env.app.request('/me', comToken(este))).status).toBe(200);
    expect((await env.app.request('/me', comToken(outro))).status).toBe(401);
    expect((await post('/auth/entrar', { email, senha: 'senha-boa-123' })).status).toBe(401);
    expect((await post('/auth/entrar', { email, senha: 'nova-senha-456' })).status).toBe(200);
  });

  it('conta sem senha (só token de script) → 409', async () => {
    const { token } = await env.admin.criarConta('Sem Senha');
    const t = await trocar(token, { atual: 'qualquer-coisa', nova: 'nova-senha-456' });
    expect(t.status).toBe(409);
  });
});

describe('isolamento do papel da API', () => {
  it('não lê convites, não cria conta nem lê a credencial de outra conta', async () => {
    const app = new pg.Client({ connectionString: inject('urlApp') });
    await app.connect();
    try {
      await expect(app.query('select * from invites')).rejects.toThrow(/permission denied/);
      await expect(
        app.query(
          `insert into users (id, display_name, accent_color) values (gen_random_uuid(), 'x', '#000')`,
        ),
      ).rejects.toThrow(/permission denied/);
      const { r } = await cadastrar();
      const { usuario } = (await r.json()) as { usuario: { id: string } };
      // Sem app.user_id, o RLS não deixa passar linha nenhuma.
      const semEscopo = await app.query('select * from credentials where user_id = $1', [
        usuario.id,
      ]);
      expect(semEscopo.rowCount).toBe(0);
      // As funções de sessão também não agem sem app.user_id.
      await expect(app.query(`select emitir_token('x', 'y')`)).rejects.toThrow(/app.user_id/);
      const revogados = await app.query(`select revogar_tokens('x', true) as n`);
      expect(revogados.rows[0].n).toBe(0);
    } finally {
      await app.end();
    }
  });
});
