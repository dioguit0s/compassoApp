import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
} from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { novoId } from '../id';
import { violacoesDeInvariante, type ItemWire } from '../item';
import type { ArmazemLocal, MetadadosSync } from '../sync/motor';
import type * as schema from './schema';
import { items, metadados, type ItemLocal } from './schema';

/**
 * Banco local em modo síncrono: é o que o `expo-sqlite` (app) e o `better-sqlite3` (testes em
 * Node) oferecem ao Drizzle. O mesmo repositório roda nos dois.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLocalSync = BaseSQLiteDatabase<'sync', any, typeof schema>;

export class ErroDeValidacao extends Error {
  constructor(readonly motivos: string[]) {
    super(motivos.join('; '));
  }
}

/** Campos que a UI informa. `id`, carimbos, `dirty` e tombstone são do repositório. */
export type DadosItem = Omit<
  ItemLocal,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty' | 'postponeCount' | 'status'
> &
  Partial<Pick<ItemLocal, 'postponeCount' | 'status'>>;

const iso = (d: Date | null) => (d === null ? null : d.toISOString());
const data = (s: string | null) => (s === null ? null : new Date(s));

export function localParaWire(l: ItemLocal): ItemWire {
  return {
    id: l.id,
    title: l.title,
    notes: l.notes,
    kind: l.kind,
    effort: l.effort,
    effortLockedAt: iso(l.effortLockedAt),
    primaryAttribute: l.primaryAttribute,
    secondaryAttribute: l.secondaryAttribute,
    dueAt: iso(l.dueAt),
    startAt: iso(l.startAt),
    endAt: iso(l.endAt),
    allDay: l.allDay,
    timezone: l.timezone,
    rrule: l.rrule,
    recurrenceEndsAt: iso(l.recurrenceEndsAt),
    status: l.status,
    completedAt: iso(l.completedAt),
    postponeCount: l.postponeCount,
    reminderMinutesBefore: l.reminderMinutesBefore,
    deletedAt: iso(l.deletedAt),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function wireParaLocal(w: ItemWire, dirty: boolean): ItemLocal {
  return {
    ...w,
    effort: w.effort,
    effortLockedAt: data(w.effortLockedAt),
    dueAt: data(w.dueAt),
    startAt: data(w.startAt),
    endAt: data(w.endAt),
    recurrenceEndsAt: data(w.recurrenceEndsAt),
    completedAt: data(w.completedAt),
    deletedAt: data(w.deletedAt),
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
    dirty,
  };
}

/**
 * CRUD local (escrita imediata, a tela nunca espera a rede) e o lado local do protocolo de
 * sincronização. Toda escrita da UI marca a linha como `dirty`; exclusão é sempre tombstone.
 */
export class RepositorioLocal implements ArmazemLocal {
  constructor(
    private readonly db: DbLocalSync,
    private readonly agora: () => number = Date.now,
  ) {}

  /**
   * `updatedAt` de uma edição: o relógio do aparelho, mas sempre depois da versão anterior.
   * Se o relógio voltou, a edição nova ainda vence a antiga no LWW.
   */
  private carimbo(anterior?: Date): Date {
    const t = this.agora();
    return new Date(anterior ? Math.max(t, anterior.getTime() + 1) : t);
  }

  private validar(item: ItemLocal): void {
    const motivos = violacoesDeInvariante(item);
    if (!item.title.trim()) motivos.unshift('título vazio');
    if (motivos.length) throw new ErroDeValidacao(motivos);
  }

  // ---- CRUD da UI ------------------------------------------------------------------------

  criar(dados: DadosItem): ItemLocal {
    const t = this.carimbo();
    const item: ItemLocal = {
      postponeCount: 0,
      status: 'open',
      ...dados,
      id: novoId(),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      dirty: true,
    };
    this.validar(item);
    this.db.insert(items).values(item).run();
    return item;
  }

  editar(id: string, mudancas: Partial<DadosItem>): ItemLocal {
    const atual = this.obter(id);
    if (!atual) throw new ErroDeValidacao(['item não encontrado']);
    const novo: ItemLocal = {
      ...atual,
      ...mudancas,
      id,
      updatedAt: this.carimbo(atual.updatedAt),
      dirty: true,
    };
    this.validar(novo);
    this.db.update(items).set(novo).where(eq(items.id, id)).run();
    return novo;
  }

  /** Exclusão lógica: a linha fica, com `deletedAt`, até a purga depois da retenção. */
  excluir(id: string): void {
    const atual = this.obter(id);
    if (!atual) return;
    const t = this.carimbo(atual.updatedAt);
    this.db
      .update(items)
      .set({ deletedAt: t, updatedAt: t, dirty: true })
      .where(eq(items.id, id))
      .run();
  }

  obter(id: string): ItemLocal | null {
    return (
      this.db
        .select()
        .from(items)
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .get() ?? null
    );
  }

  listar(): ItemLocal[] {
    return this.db
      .select()
      .from(items)
      .where(isNull(items.deletedAt))
      .orderBy(asc(items.startAt), asc(items.dueAt), asc(items.id))
      .all();
  }

  /**
   * Itens simples (sem recorrência) que caem em `[de, ate)` — a mesma regra de
   * `itemNoIntervalo` do core, em SQL. Devolve a consulta sem executar, para a tela poder
   * observá-la com `useLiveQuery`; `listarNoIntervalo` executa.
   */
  consultaNoIntervalo(de: Date, ate: Date) {
    const tarefa = and(eq(items.kind, 'task'), gte(items.dueAt, de), lt(items.dueAt, ate));
    const evento = and(
      eq(items.kind, 'event'),
      lt(items.startAt, ate),
      or(
        and(isNotNull(items.endAt), gt(items.endAt, items.startAt), gt(items.endAt, de)),
        and(or(isNull(items.endAt), lte(items.endAt, items.startAt)), gte(items.startAt, de)),
      ),
    );
    return this.db
      .select()
      .from(items)
      .where(and(isNull(items.deletedAt), isNull(items.rrule), or(tarefa, evento)))
      .orderBy(asc(items.startAt), asc(items.dueAt));
  }

  listarNoIntervalo(de: Date, ate: Date): ItemLocal[] {
    return this.consultaNoIntervalo(de, ate).all();
  }

  // ---- lado local da sincronização ---------------------------------------------------------

  sujos(): ItemWire[] {
    return this.db.select().from(items).where(eq(items.dirty, true)).all().map(localParaWire);
  }

  /**
   * Limpa `dirty` só das linhas que o servidor confirmou E que não mudaram de novo desde o envio
   * (mesmo `updatedAt`). Uma edição feita com o push em voo continua suja e vai no próximo.
   */
  confirmar(enviados: { id: string; updatedAt: string }[]): void {
    this.db.transaction((tx) => {
      for (const e of enviados) {
        tx.update(items)
          .set({ dirty: false })
          .where(and(eq(items.id, e.id), eq(items.updatedAt, new Date(e.updatedAt))))
          .run();
      }
    });
  }

  /**
   * Aplica o pull com LWW, idempotente por `id`. Linha suja só é sobrescrita por versão
   * estritamente mais nova; linha limpa aceita igual ou mais nova (o empate é o próprio eco).
   */
  aplicar(recebidos: ItemWire[]): number {
    let aplicados = 0;
    this.db.transaction((tx) => {
      for (const w of recebidos) {
        const local = tx
          .select({ updatedAt: items.updatedAt, dirty: items.dirty })
          .from(items)
          .where(eq(items.id, w.id))
          .get();
        const remoto = Date.parse(w.updatedAt);
        if (local) {
          const t = local.updatedAt.getTime();
          if (local.dirty ? remoto <= t : remoto < t) continue;
        }
        const linha = wireParaLocal(w, false);
        tx.insert(items).values(linha).onConflictDoUpdate({ target: items.id, set: linha }).run();
        aplicados++;
      }
    });
    return aplicados;
  }

  /**
   * Depois de um pull completo (sem cursor): remove as linhas limpas que o servidor não tem mais
   * — tombstones já purgados lá enquanto este aparelho estava parado.
   */
  reconciliar(idsNoServidor: string[]): number {
    const r = this.db
      .delete(items)
      .where(and(eq(items.dirty, false), notInArray(items.id, idsNoServidor)))
      .run();
    return (r as { changes?: number }).changes ?? 0;
  }

  /** Purga física local de tombstones já confirmados, mais antigos que `limite`. */
  purgar(limite: Date): number {
    const r = this.db
      .delete(items)
      .where(and(isNotNull(items.deletedAt), lt(items.deletedAt, limite), eq(items.dirty, false)))
      .run();
    return (r as { changes?: number }).changes ?? 0;
  }

  lerMetadados(): MetadadosSync {
    const linhas = this.db
      .select()
      .from(metadados)
      .where(inArray(metadados.chave, ['cursor', 'ultimaSync', 'retencaoDias']))
      .all();
    const m = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    return {
      cursor: m.cursor ?? null,
      ultimaSync: m.ultimaSync ? Number(m.ultimaSync) : null,
      retencaoDias: m.retencaoDias ? Number(m.retencaoDias) : null,
    };
  }

  gravarMetadados(m: { cursor: string; ultimaSync: number; retencaoDias: number }): void {
    this.db.transaction((tx) => {
      for (const [chave, valor] of Object.entries(m)) {
        tx.insert(metadados)
          .values({ chave, valor: String(valor) })
          .onConflictDoUpdate({ target: metadados.chave, set: { valor: String(valor) } })
          .run();
      }
    });
  }
}
