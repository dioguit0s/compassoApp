import { corDerivadaDoNome, novoId } from '@compasso/core';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashDoToken } from '../auth';

/**
 * Operações que rodam fora de uma requisição, com o papel dono (DATABASE_ADMIN_URL): criação
 * de conta e emissão de token. O dono não está sujeito ao RLS, por isso este módulo nunca é
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
