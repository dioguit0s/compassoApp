import { corDerivadaDoNome, novoId } from '@compasso/core';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashDoToken } from '../auth';
import { gerarCodigoDeConvite, hashDoConvite } from '../convite';
import { esquemaEmail, gerarHashDeSenha, senhaTemporaria } from '../senha';

/**
 * Operações que rodam fora de uma requisição, com o papel dono (DATABASE_ADMIN_URL): criação
 * de conta, emissão de token, convites e senha temporária. O dono não está sujeito ao RLS, por isso este módulo nunca é
 * importado pela API em execução — só por scripts.
 */
export class Admin {
  private constructor(private readonly cliente: pg.Client) {}

  static async conectar(urlAdmin: string): Promise<Admin> {
    const cliente = new pg.Client({ connectionString: urlAdmin });
    await cliente.connect();
    return new Admin(cliente);
  }

  async fechar(): Promise<void> {
    await this.cliente.end();
  }

  /** Cria a conta e o primeiro token. O token em claro só existe no retorno. */
  async criarConta(displayName: string, label = 'primeiro aparelho') {
    const nome = displayName.trim();
    if (!nome) throw new Error('nome de exibição vazio');
    const userId = novoId();
    await this.cliente.query('begin');
    try {
      await this.cliente.query(
        'insert into users (id, display_name, accent_color) values ($1, $2, $3)',
        [userId, nome, corDerivadaDoNome(nome)],
      );
      const token = await this.inserirToken(userId, label);
      await this.cliente.query('commit');
      return { userId, token };
    } catch (erro) {
      await this.cliente.query('rollback');
      throw erro;
    }
  }

  /** Emite mais um token para uma conta existente (ex.: um segundo aparelho). */
  async emitirToken(userId: string, label: string): Promise<string> {
    return this.inserirToken(userId, label);
  }

  /** Convite de cadastro (F10). O código em claro só existe no retorno. */
  async criarConvite(nota: string | null, dias = 7): Promise<{ codigo: string; venceEm: Date }> {
    if (!Number.isInteger(dias) || dias < 1 || dias > 90) {
      throw new Error('validade do convite: de 1 a 90 dias');
    }
    const codigo = gerarCodigoDeConvite();
    const r = await this.cliente.query<{ expires_at: Date }>(
      `insert into invites (code_hash, note, expires_at)
       values ($1, $2, now() + make_interval(days => $3)) returning expires_at`,
      [hashDoConvite(codigo), nota?.trim() || null, dias],
    );
    return { codigo, venceEm: r.rows[0]!.expires_at };
  }

  async listarConvites() {
    const r = await this.cliente.query<{
      note: string | null;
      created_at: Date;
      expires_at: Date;
      used_at: Date | null;
      display_name: string | null;
    }>(
      `select i.note, i.created_at, i.expires_at, i.used_at, u.display_name
       from invites i left join users u on u.id = i.used_by
       order by i.created_at desc`,
    );
    return r.rows;
  }

  /**
   * Define e-mail e uma senha temporária para uma conta (F10). Serve para dar login à conta
   * criada por script e como "esqueci a senha" (ADR-0008): o administrador roda, entrega a senha
   * e a pessoa troca no app. Não encerra as sessões abertas.
   */
  async definirAcesso(userId: string, email: string): Promise<string> {
    const validado = esquemaEmail.safeParse(email);
    if (!validado.success) throw new Error(`e-mail inválido: ${email}`);
    const normalizado = validado.data;
    const senha = senhaTemporaria();
    const r = await this.cliente.query(
      `insert into credentials (user_id, email, password_hash)
       select id, $2, $3 from users where id = $1
       on conflict (user_id) do update
         set email = excluded.email, password_hash = excluded.password_hash, updated_at = now()`,
      [userId, normalizado, await gerarHashDeSenha(senha)],
    );
    if (!r.rowCount) throw new Error(`conta ${userId} não encontrada`);
    return senha;
  }

  /** Para o script: acha a conta pelo e-mail já cadastrado. */
  async contaPorEmail(email: string): Promise<string | null> {
    const r = await this.cliente.query<{ user_id: string }>(
      'select user_id from credentials where email = $1',
      [email.trim().toLowerCase()],
    );
    return r.rows[0]?.user_id ?? null;
  }

  private async inserirToken(userId: string, label: string): Promise<string> {
    // 32 bytes de aleatoriedade criptográfica, em base64url: 43 caracteres.
    const token = randomBytes(32).toString('base64url');
    await this.cliente.query(
      'insert into api_tokens (token_hash, user_id, label) values ($1, $2, $3)',
      [hashDoToken(token), userId, label],
    );
    return token;
  }

  /**
   * Purga física dos tombstones mais antigos que `dias` (especificação §6.6). Roda com o papel
   * dono, que não está sujeito ao RLS: é a única operação que atravessa contas, e só apaga o que
   * cada conta já excluiu há mais tempo que a retenção.
   */
  async purgarTombstones(dias: number): Promise<number> {
    // Filhos antes dos pais; os que sobrarem saem por ON DELETE CASCADE. Itens ligados a uma
    // disciplina purgada ficam, com course_id anulado (ON DELETE SET NULL (course_id)).
    let grade = 0;
    for (const t of ['class_exceptions', 'class_slots', 'courses', 'semesters', 'rewards']) {
      const r = await this.cliente.query(
        `delete from ${t} where deleted_at < now() - make_interval(days => $1)`,
        [dias],
      );
      grade += r.rowCount ?? 0;
    }
    // Desvios de itens purgados saem junto (FK com ON DELETE CASCADE).
    const oc = await this.cliente.query(
      `delete from item_occurrences where deleted_at < now() - make_interval(days => $1)`,
      [dias],
    );
    const it = await this.cliente.query(
      `delete from items where deleted_at < now() - make_interval(days => $1)`,
      [dias],
    );
    return grade + (oc.rowCount ?? 0) + (it.rowCount ?? 0);
  }
}
