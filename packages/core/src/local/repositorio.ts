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
import { inicioDoDia, type Dia } from '../calendario';
import { aulasDoDia, type GradeParaProjecao } from '../grade';
import { novoId } from '../id';
import {
  ESQUEMAS_SYNC,
  linhasVazias,
  TABELAS_SYNC,
  violacoesDeInvariante,
  type ItemWire,
  type TabelaSync,
} from '../item';
import { violacoesDeOcorrencia, type OcorrenciaWire, type TipoOcorrencia } from '../ocorrencia';
import { projetarAgenda, type EntradaAgenda } from '../projecao';
import {
  ehOcorrencia,
  fimDaSerie,
  interpretar,
  ocorrencias,
  serializarRRule,
  type Serie,
} from '../rrule';
import type { ArmazemLocal, Confirmacoes, Linhas, MetadadosSync } from '../sync/motor';
import type * as schema from './schema';
import {
  classExceptions,
  classSlots,
  courses,
  itemOccurrences,
  items,
  metadados,
  semesters,
  type DisciplinaLocal,
  type ExcecaoLocal,
  type HorarioLocal,
  type ItemLocal,
  type OcorrenciaLocal,
  type SemestreLocal,
} from './schema';

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

/** Campos que a UI informa. `id`, carimbos, `dirty`, tombstone e `recurrenceEndsAt` são daqui. */
export type DadosItem = Omit<
  ItemLocal,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'dirty'
  | 'postponeCount'
  | 'status'
  | 'recurrenceEndsAt'
> &
  Partial<Pick<ItemLocal, 'postponeCount' | 'status'>>;

/** O que uma operação de ocorrência pode mudar. */
export interface MudancaDeOcorrencia {
  startAt?: Date | null;
  endAt?: Date | null;
  titleOverride?: string | null;
  notesOverride?: string | null;
}

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
    sourceUid: l.sourceUid,
    courseId: l.courseId,
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

export function ocorrenciaParaWire(o: OcorrenciaLocal): OcorrenciaWire {
  return {
    id: o.id,
    itemId: o.itemId,
    occurrenceDate: o.occurrenceDate,
    type: o.type,
    status: o.status,
    completedAt: iso(o.completedAt),
    startAt: iso(o.startAt),
    endAt: iso(o.endAt),
    titleOverride: o.titleOverride,
    notesOverride: o.notesOverride,
    deletedAt: iso(o.deletedAt),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function wireParaOcorrencia(w: OcorrenciaWire, dirty: boolean): OcorrenciaLocal {
  return {
    ...w,
    completedAt: data(w.completedAt),
    startAt: data(w.startAt),
    endAt: data(w.endAt),
    deletedAt: data(w.deletedAt),
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
    dirty,
  };
}

/** A série de um item, no formato do expansor. */
export function serieDoItem(
  i: Pick<ItemLocal, 'kind' | 'dueAt' | 'startAt' | 'endAt' | 'rrule' | 'timezone'>,
): Serie | null {
  const inicio = i.kind === 'task' ? i.dueAt : i.startAt;
  if (!i.rrule || !inicio) return null;
  const fim = i.kind === 'event' ? i.endAt : null;
  return {
    rrule: i.rrule,
    inicio,
    duracaoMs: fim && fim > inicio ? fim.getTime() - inicio.getTime() : 0,
    fuso: i.timezone,
  };
}

/** `recurrenceEndsAt` desnormalizado (especificação §5): fim da última ocorrência, ou null. */
export function calcularFimDaSerie(i: Parameters<typeof serieDoItem>[0]): Date | null {
  const s = serieDoItem(i);
  if (!s) return null;
  try {
    return fimDaSerie(s);
  } catch {
    return null; // regra inválida: a validação recusa com a mensagem certa
  }
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

  // ---- itens ---------------------------------------------------------------------------------

  criar(dados: DadosItem): ItemLocal {
    const t = this.carimbo();
    const item: ItemLocal = {
      postponeCount: 0,
      status: 'open',
      ...dados,
      recurrenceEndsAt: calcularFimDaSerie(dados),
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
    novo.recurrenceEndsAt = calcularFimDaSerie(novo);
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
    return this.db
      .select()
      .from(items)
      .where(and(isNull(items.deletedAt), isNull(items.rrule), simplesNoIntervalo(de, ate)))
      .orderBy(asc(items.startAt), asc(items.dueAt));
  }

  listarNoIntervalo(de: Date, ate: Date): ItemLocal[] {
    return this.consultaNoIntervalo(de, ate).all();
  }

  // ---- agenda (projeção local, a mesma função da API) ------------------------------------------

  /**
   * Candidatos da agenda: itens simples no intervalo e TODAS as séries ativas (a projeção decide
   * quais ocorrências entram — inclusive as movidas de fora para dentro do intervalo).
   */
  consultaItensDaAgenda(de: Date, ate: Date) {
    return this.db
      .select()
      .from(items)
      .where(
        and(
          isNull(items.deletedAt),
          or(isNotNull(items.rrule), and(isNull(items.rrule), simplesNoIntervalo(de, ate))),
        ),
      );
  }

  consultaDesvios() {
    return this.db.select().from(itemOccurrences).where(isNull(itemOccurrences.deletedAt));
  }

  agenda(de: Date, ate: Date): EntradaAgenda[] {
    return projetarAgenda(
      this.consultaItensDaAgenda(de, ate).all(),
      this.consultaDesvios().all(),
      de,
      ate,
    );
  }

  // ---- ocorrências de série ------------------------------------------------------------------

  obterDesvio(itemId: string, dataOc: Dia): OcorrenciaLocal | null {
    return (
      this.db
        .select()
        .from(itemOccurrences)
        .where(and(eq(itemOccurrences.itemId, itemId), eq(itemOccurrences.occurrenceDate, dataOc)))
        .get() ?? null
    );
  }

  private serieValidada(itemId: string, dataOc: Dia): { item: ItemLocal; serie: Serie } {
    const item = this.obter(itemId);
    if (!item) throw new ErroDeValidacao(['item não encontrado']);
    const serie = serieDoItem(item);
    if (!serie) throw new ErroDeValidacao(['o item não é uma série']);
    if (!ehOcorrencia(serie, dataOc)) {
      throw new ErroDeValidacao([`${dataOc} não é uma ocorrência desta série`]);
    }
    return { item, serie };
  }

  /**
   * Registra (ou atualiza) o desvio da ocorrência `dataOc`. Upsert pela identidade
   * `(itemId, occurrenceDate)`: repetir a mesma operação não cria linha nova.
   */
  private desviar(
    itemId: string,
    dataOc: Dia,
    tipo: TipoOcorrencia,
    campos: Partial<OcorrenciaLocal>,
  ): OcorrenciaLocal {
    this.serieValidada(itemId, dataOc);
    const atual = this.obterDesvio(itemId, dataOc);
    const t = this.carimbo(atual?.updatedAt);
    const linha: OcorrenciaLocal = {
      id: atual?.id ?? novoId(),
      itemId,
      occurrenceDate: dataOc,
      status: 'open',
      completedAt: null,
      startAt: null,
      endAt: null,
      titleOverride: null,
      notesOverride: null,
      createdAt: atual?.createdAt ?? t,
      ...(atual && !atual.deletedAt ? atual : {}),
      ...campos,
      type: tipo,
      deletedAt: null,
      updatedAt: t,
      dirty: true,
    };
    const motivos = violacoesDeOcorrencia(linha);
    if (motivos.length) throw new ErroDeValidacao(motivos);
    this.db
      .insert(itemOccurrences)
      .values(linha)
      .onConflictDoUpdate({
        target: [itemOccurrences.itemId, itemOccurrences.occurrenceDate],
        set: linha,
      })
      .run();
    return linha;
  }

  /** Concluir só se aplica a item pontuável: compromisso puro não é concluível (§4.8). */
  concluirOcorrencia(itemId: string, dataOc: Dia): OcorrenciaLocal {
    const { item } = this.serieValidada(itemId, dataOc);
    if (item.effort === null)
      throw new ErroDeValidacao(['compromisso sem esforço não é concluível']);
    const atual = this.obterDesvio(itemId, dataOc);
    if (atual && !atual.deletedAt && atual.status === 'done') return atual; // idempotente
    return this.desviar(itemId, dataOc, 'completed', {
      status: 'done',
      completedAt: new Date(this.agora()),
    });
  }

  reabrirOcorrencia(itemId: string, dataOc: Dia): OcorrenciaLocal {
    return this.desviar(itemId, dataOc, 'edited', { status: 'open', completedAt: null });
  }

  cancelarOcorrencia(itemId: string, dataOc: Dia): OcorrenciaLocal {
    return this.desviar(itemId, dataOc, 'cancelled', {});
  }

  /** "Só esta": move e/ou edita uma ocorrência sem tocar nas outras. */
  alterarOcorrencia(itemId: string, dataOc: Dia, m: MudancaDeOcorrencia): OcorrenciaLocal {
    const tipo: TipoOcorrencia = m.startAt !== undefined ? 'moved' : 'edited';
    return this.desviar(itemId, dataOc, tipo, m);
  }

  /** Datas de ocorrência da série estritamente antes de `dataOc` (para dividir COUNT). */
  private ocorrenciasAntes(serie: Serie, dataOc: Dia) {
    return ocorrencias({ ...serie, duracaoMs: 0 }, serie.inicio, inicioDoDia(dataOc)).filter(
      (o) => o.data < dataOc,
    );
  }

  /**
   * "Esta e as futuras" (especificação §7, ADR-0004): encerra a série original na ocorrência
   * anterior a `dataOc` e cria uma série nova a partir de `dataOc` com as mudanças. O passado não
   * é tocado. Desvios de `dataOc` em diante passam para a série nova quando a data continua
   * sendo ocorrência dela; os que deixam de ser saem (tombstone).
   * Devolve a série nova (ou a própria, alterada, se `dataOc` é a primeira ocorrência).
   */
  alterarDaquiEmDiante(itemId: string, dataOc: Dia, mudancas: Partial<DadosItem>): ItemLocal {
    const { item, serie } = this.serieValidada(itemId, dataOc);
    const antes = this.ocorrenciasAntes(serie, dataOc);
    if (antes.length === 0) return this.editar(itemId, mudancas);

    const regra = interpretar(item.rrule!, item.timezone);
    const restante = regra.count !== null ? regra.count - antes.length : null;
    const antiga = serializarRRule({
      ...regra,
      count: null,
      until: { instante: antes.at(-1)!.inicio },
    });

    // A ocorrência de `dataOc` na série original é o início da nova, salvo mudança explícita.
    const inicioOriginal = ocorrencias(
      { ...serie, duracaoMs: 0 },
      inicioDoDia(dataOc),
      new Date(inicioDoDia(dataOc).getTime() + 86_400_000 * 2),
    ).find((o) => o.data === dataOc)!.inicio;
    const duracao = serie.duracaoMs ?? 0;
    const base: DadosItem = {
      title: item.title,
      notes: item.notes,
      kind: item.kind,
      effort: item.effort,
      effortLockedAt: null,
      primaryAttribute: item.primaryAttribute,
      secondaryAttribute: item.secondaryAttribute,
      dueAt: item.kind === 'task' ? inicioOriginal : null,
      startAt: item.kind === 'event' ? inicioOriginal : null,
      endAt:
        item.kind === 'event' && item.endAt ? new Date(inicioOriginal.getTime() + duracao) : null,
      allDay: item.allDay,
      timezone: item.timezone,
      rrule: serializarRRule({ ...regra, count: restante }),
      sourceUid: null,
      courseId: item.courseId,
      completedAt: null,
      reminderMinutesBefore: item.reminderMinutesBefore,
    };

    let nova!: ItemLocal;
    this.db.transaction(() => {
      this.editar(itemId, { rrule: antiga });
      nova = this.criar({ ...base, ...mudancas });
      const serieNova = serieDoItem(nova)!;
      const futuros = this.db
        .select()
        .from(itemOccurrences)
        .where(
          and(
            eq(itemOccurrences.itemId, itemId),
            gte(itemOccurrences.occurrenceDate, dataOc),
            isNull(itemOccurrences.deletedAt),
          ),
        )
        .all();
      for (const d of futuros) {
        const t = this.carimbo(d.updatedAt);
        this.db
          .update(itemOccurrences)
          .set({ deletedAt: t, updatedAt: t, dirty: true })
          .where(eq(itemOccurrences.id, d.id))
          .run();
        if (d.occurrenceDate !== dataOc && ehOcorrencia(serieNova, d.occurrenceDate)) {
          this.db
            .insert(itemOccurrences)
            .values({
              ...d,
              id: novoId(),
              itemId: nova.id,
              createdAt: t,
              updatedAt: t,
              dirty: true,
            })
            .run();
        }
      }
    });
    return nova;
  }

  /**
   * Excluir "esta e as futuras": a série termina na ocorrência anterior a `dataOc`. Se `dataOc` é
   * a primeira ocorrência, a série inteira vai para a lixeira.
   */
  encerrarSerieAntes(itemId: string, dataOc: Dia): void {
    const { item, serie } = this.serieValidada(itemId, dataOc);
    const antes = this.ocorrenciasAntes(serie, dataOc);
    if (antes.length === 0) {
      this.excluir(itemId);
      return;
    }
    const regra = interpretar(item.rrule!, item.timezone);
    this.editar(itemId, {
      rrule: serializarRRule({ ...regra, count: null, until: { instante: antes.at(-1)!.inicio } }),
    });
  }

  // ---- grade acadêmica (F5) -------------------------------------------------------------------

  /** Valida pelo esquema de transporte (o mesmo do servidor) antes de gravar. */
  private validarGrade(tabela: TabelaGrade, linha: Record<string, unknown>): void {
    const r = ESQUEMAS_SYNC[tabela].safeParse(linhaParaWire(linha));
    if (!r.success) throw new ErroDeValidacao(r.error.issues.map((i) => i.message));
  }

  private gravarGrade<T extends { id: string; updatedAt: Date; createdAt: Date }>(
    tabela: TabelaGrade,
    dados: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'>,
  ): T {
    const t = this.carimbo();
    const linha = {
      ...dados,
      id: novoId(),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      dirty: true,
    };
    this.validarGrade(tabela, linha);
    this.db
      .insert(TABELAS_GRADE[tabela])
      .values(linha as never)
      .run();
    return linha as unknown as T;
  }

  private editarGrade<T extends { id: string; updatedAt: Date }>(
    tabela: TabelaGrade,
    id: string,
    mudancas: Partial<T>,
  ): T {
    const t = TABELAS_GRADE[tabela];
    const atual = this.db
      .select()
      .from(t)
      .where(and(eq(t.id, id), isNull(t.deletedAt)))
      .get() as T | undefined;
    if (!atual) throw new ErroDeValidacao(['registro não encontrado']);
    const novo = {
      ...atual,
      ...mudancas,
      id,
      updatedAt: this.carimbo(atual.updatedAt),
      dirty: true,
    };
    this.validarGrade(tabela, novo);
    this.db
      .update(t)
      .set(novo as never)
      .where(eq(t.id, id))
      .run();
    return novo;
  }

  private excluirGrade(tabela: TabelaGrade, ids: string[]): void {
    const t = TABELAS_GRADE[tabela];
    for (const id of ids) {
      const atual = this.db
        .select({ updatedAt: t.updatedAt })
        .from(t)
        .where(and(eq(t.id, id), isNull(t.deletedAt)))
        .get();
      if (!atual) continue;
      const c = this.carimbo(atual.updatedAt);
      this.db.update(t).set({ deletedAt: c, updatedAt: c, dirty: true }).where(eq(t.id, id)).run();
    }
  }

  /**
   * Semestre novo já nasce ativo e desativa os outros: só um semestre corrente por vez
   * (ADR-0005). Trocar de semestre é criar o novo, não editar o anterior.
   */
  criarSemestre(dados: { label: string; startDate: Dia; endDate: Dia }): SemestreLocal {
    let novo!: SemestreLocal;
    this.db.transaction(() => {
      novo = this.gravarGrade<SemestreLocal>('semestres', { ...dados, active: true });
      this.desativarOutros(novo.id);
    });
    return novo;
  }

  ativarSemestre(id: string): void {
    this.db.transaction(() => {
      this.editarGrade<SemestreLocal>('semestres', id, { active: true });
      this.desativarOutros(id);
    });
  }

  private desativarOutros(id: string): void {
    const ativos = this.db
      .select({ id: semesters.id })
      .from(semesters)
      .where(and(eq(semesters.active, true), isNull(semesters.deletedAt)))
      .all();
    for (const s of ativos) {
      if (s.id !== id) this.editarGrade<SemestreLocal>('semestres', s.id, { active: false });
    }
  }

  editarSemestre(id: string, m: Partial<Pick<SemestreLocal, 'label' | 'startDate' | 'endDate'>>) {
    return this.editarGrade<SemestreLocal>('semestres', id, m);
  }

  criarDisciplina(
    dados: Omit<DisciplinaLocal, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'>,
  ) {
    return this.gravarGrade<DisciplinaLocal>('disciplinas', dados);
  }

  editarDisciplina(id: string, m: Partial<DisciplinaLocal>) {
    return this.editarGrade<DisciplinaLocal>('disciplinas', id, m);
  }

  /**
   * Exclusão lógica da disciplina: horários e exceções dela saem junto, e os itens ligados
   * (prova, trabalho) ficam intactos com `courseId` anulado — o tombstone é um UPDATE, então o
   * `ON DELETE SET NULL` do banco não dispara; quem anula é a aplicação (issue #57).
   */
  excluirDisciplina(id: string): void {
    this.db.transaction(() => {
      const horarios = this.db
        .select({ id: classSlots.id })
        .from(classSlots)
        .where(and(eq(classSlots.courseId, id), isNull(classSlots.deletedAt)))
        .all()
        .map((h) => h.id);
      for (const h of horarios) this.excluirHorario(h);
      const ligados = this.db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.courseId, id), isNull(items.deletedAt)))
        .all();
      for (const l of ligados) this.editar(l.id, { courseId: null });
      this.excluirGrade('disciplinas', [id]);
    });
  }

  criarHorario(
    dados: Omit<HorarioLocal, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'>,
  ) {
    return this.gravarGrade<HorarioLocal>('horarios', dados);
  }

  editarHorario(id: string, m: Partial<HorarioLocal>) {
    return this.editarGrade<HorarioLocal>('horarios', id, m);
  }

  excluirHorario(id: string): void {
    this.db.transaction(() => {
      const excecoes = this.db
        .select({ id: classExceptions.id })
        .from(classExceptions)
        .where(and(eq(classExceptions.slotId, id), isNull(classExceptions.deletedAt)))
        .all()
        .map((e) => e.id);
      this.excluirGrade('excecoes', excecoes);
      this.excluirGrade('horarios', [id]);
    });
  }

  /** Exceção de um dia: cancelamento, troca de sala ou aula extra (reposição). */
  registrarExcecao(
    dados: Omit<ExcecaoLocal, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'>,
  ): ExcecaoLocal {
    return this.gravarGrade<ExcecaoLocal>('excecoes', dados);
  }

  removerExcecao(id: string): void {
    this.excluirGrade('excecoes', [id]);
  }

  /** "Não tem aula hoje" (feriado, recesso): cancela todas as aulas regulares do dia. */
  cancelarAulasDoDia(dia: Dia, nota: string | null = null): number {
    const aulas = aulasDoDia(this.grade(), dia).filter((a) => !a.cancelada && !a.extra);
    this.db.transaction(() => {
      for (const a of aulas) {
        this.registrarExcecao({
          slotId: a.slotId,
          date: dia,
          type: 'cancelled',
          room: null,
          note: nota,
          startTime: null,
          endTime: null,
        });
      }
    });
    return aulas.length;
  }

  consultasDaGrade() {
    return {
      semestres: this.db.select().from(semesters).where(isNull(semesters.deletedAt)),
      disciplinas: this.db.select().from(courses).where(isNull(courses.deletedAt)),
      horarios: this.db.select().from(classSlots).where(isNull(classSlots.deletedAt)),
      excecoes: this.db.select().from(classExceptions).where(isNull(classExceptions.deletedAt)),
    };
  }

  grade(): GradeParaProjecao {
    const q = this.consultasDaGrade();
    return {
      semestres: q.semestres.all(),
      disciplinas: q.disciplinas.all(),
      horarios: q.horarios.all(),
      excecoes: q.excecoes.all(),
    };
  }

  // ---- lado local da sincronização ---------------------------------------------------------

  sujos(): Linhas {
    const saida = linhasVazias();
    saida.itens = this.db
      .select()
      .from(items)
      .where(eq(items.dirty, true))
      .all()
      .map(localParaWire);
    saida.ocorrencias = this.db
      .select()
      .from(itemOccurrences)
      .where(eq(itemOccurrences.dirty, true))
      .all()
      .map(ocorrenciaParaWire);
    for (const tabela of TABELAS_DA_GRADE) {
      const t = TABELAS_GRADE[tabela];
      (saida[tabela] as unknown[]) = this.db
        .select()
        .from(t)
        .where(eq(t.dirty, true))
        .all()
        .map((l) => linhaParaWire(l as Record<string, unknown>));
    }
    return saida;
  }

  /**
   * Limpa `dirty` só das linhas que o servidor confirmou E que não mudaram de novo desde o envio
   * (mesmo `updatedAt`). Uma edição feita com o push em voo continua suja e vai no próximo.
   */
  confirmar(enviados: Confirmacoes): void {
    this.db.transaction(() => {
      for (const tabela of TABELAS_SYNC) {
        const t = tabelaLocal(tabela);
        for (const e of enviados[tabela]) {
          this.db
            .update(t)
            .set({ dirty: false })
            .where(and(eq(t.id, e.id), eq(t.updatedAt, new Date(e.updatedAt))))
            .run();
        }
      }
    });
  }

  /**
   * Aplica o pull com LWW, idempotente. Linha suja só é sobrescrita por versão estritamente mais
   * nova; linha limpa aceita igual ou mais nova (o empate é o próprio eco). Desvios de ocorrência
   * casam pela identidade `(itemId, occurrenceDate)`, não pelo `id` (ADR-0004).
   */
  aplicar(recebidos: Linhas): number {
    let aplicados = 0;
    const vence = (local: { updatedAt: Date; dirty: boolean } | undefined, remoto: string) => {
      if (!local) return true;
      const r = Date.parse(remoto);
      const t = local.updatedAt.getTime();
      return local.dirty ? r > t : r >= t;
    };
    this.db.transaction(() => {
      const porId = (
        tabela: Exclude<TabelaSync, 'ocorrencias'>,
        linhas: { id: string; updatedAt: string }[],
      ) => {
        const t = tabelaLocal(tabela);
        for (const w of linhas) {
          const local = this.db
            .select({ updatedAt: t.updatedAt, dirty: t.dirty })
            .from(t)
            .where(eq(t.id, w.id))
            .get();
          if (!vence(local, w.updatedAt)) continue;
          const linha =
            tabela === 'itens'
              ? wireParaLocal(w as ItemWire, false)
              : { ...wireParaLinha(w as unknown as Record<string, unknown>), dirty: false };
          this.db
            .insert(t)
            .values(linha as never)
            .onConflictDoUpdate({ target: t.id, set: linha as never })
            .run();
          aplicados++;
        }
      };
      for (const tabela of TABELAS_DA_GRADE) porId(tabela, recebidos[tabela]);
      porId('itens', recebidos.itens);
      for (const w of recebidos.ocorrencias) {
        const local = this.db
          .select({
            id: itemOccurrences.id,
            updatedAt: itemOccurrences.updatedAt,
            dirty: itemOccurrences.dirty,
          })
          .from(itemOccurrences)
          .where(
            and(
              eq(itemOccurrences.itemId, w.itemId),
              eq(itemOccurrences.occurrenceDate, w.occurrenceDate),
            ),
          )
          .get();
        if (!vence(local, w.updatedAt)) continue;
        const linha = wireParaOcorrencia(w, false);
        if (local && local.id !== w.id) {
          this.db.delete(itemOccurrences).where(eq(itemOccurrences.id, local.id)).run();
        }
        this.db
          .insert(itemOccurrences)
          .values(linha)
          .onConflictDoUpdate({ target: itemOccurrences.id, set: linha })
          .run();
        aplicados++;
      }
    });
    return aplicados;
  }

  /**
   * Depois de um pull completo (sem cursor): remove as linhas limpas que o servidor não tem mais
   * — tombstones já purgados lá enquanto este aparelho estava parado.
   */
  reconciliar(noServidor: Record<TabelaSync, string[]>): number {
    let n = 0;
    for (const tabela of TABELAS_SYNC) {
      const t = tabelaLocal(tabela);
      n += mudancas(
        this.db
          .delete(t)
          .where(and(eq(t.dirty, false), notInArray(t.id, noServidor[tabela])))
          .run(),
      );
    }
    return n;
  }

  /** Purga física local de tombstones já confirmados, mais antigos que `limite`. */
  purgar(limite: Date): number {
    let n = 0;
    for (const tabela of TABELAS_SYNC) {
      const t = tabelaLocal(tabela);
      n += mudancas(
        this.db
          .delete(t)
          .where(and(isNotNull(t.deletedAt), lt(t.deletedAt, limite), eq(t.dirty, false)))
          .run(),
      );
    }
    return n;
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

type TabelaGrade = 'semestres' | 'disciplinas' | 'horarios' | 'excecoes';
const TABELAS_DA_GRADE: TabelaGrade[] = ['semestres', 'disciplinas', 'horarios', 'excecoes'];
const TABELAS_GRADE = {
  semestres: semesters,
  disciplinas: courses,
  horarios: classSlots,
  excecoes: classExceptions,
} as const;

function tabelaLocal(tabela: TabelaSync) {
  if (tabela === 'itens') return items;
  if (tabela === 'ocorrencias') return itemOccurrences;
  return TABELAS_GRADE[tabela];
}

const CARIMBOS = ['deletedAt', 'createdAt', 'updatedAt'] as const;

/** Linha local da grade → transporte: carimbos Date → ISO; `dirty` sai. */
function linhaParaWire(l: Record<string, unknown>): Record<string, unknown> {
  const { dirty: _dirty, ...resto } = l;
  for (const c of CARIMBOS) {
    const v = resto[c];
    resto[c] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return resto;
}

function wireParaLinha(w: Record<string, unknown>): Record<string, unknown> {
  const l = { ...w };
  for (const c of CARIMBOS) l[c] = w[c] ? new Date(w[c] as string) : null;
  return l;
}

function mudancas(r: unknown): number {
  return (r as { changes?: number }).changes ?? 0;
}

/** A regra de `itemNoIntervalo`, em SQL. */
function simplesNoIntervalo(de: Date, ate: Date) {
  const tarefa = and(eq(items.kind, 'task'), gte(items.dueAt, de), lt(items.dueAt, ate));
  const evento = and(
    eq(items.kind, 'event'),
    lt(items.startAt, ate),
    or(
      and(isNotNull(items.endAt), gt(items.endAt, items.startAt), gt(items.endAt, de)),
      and(or(isNull(items.endAt), lte(items.endAt, items.startAt)), gte(items.startAt, de)),
    ),
  );
  return or(tarefa, evento);
}
