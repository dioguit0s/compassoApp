import {
  ATRIBUTOS,
  ESFORCOS,
  esquemaItem,
  FUSO_PADRAO,
  inicioDoDia,
  instantesDaAula,
  novoId,
  somarDias,
  type EntradaAgenda,
  type ItemWire,
} from '@compasso/core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { definirSessao, hashDoToken, tokenDoCabecalho, type VariaveisAutenticadas } from '../auth';
import type { Banco } from '../db/banco';
import { ErroDeOcorrencia, type LinhaItem, type Repositorios } from '../db/repositorios';
import { LimiteDeTentativas } from '../limite';
import { ErroV1, erroDoZod, invalido } from './erros';
import {
  aulaV1,
  deEntrada,
  deLinha,
  eventoV1,
  TAMANHO_DO_TITULO,
  tarefaV1,
  type ItemV1,
} from './formato';

type C = Context<{ Variables: VariaveisAutenticadas }>;

/** Requisições por minuto por token. Uma conversa de voz faz poucas; isto só segura um laço. */
export const LIMITE_POR_MINUTO = 120;
const DIA_MS = 86_400_000;
const INTERVALO_MAXIMO_DIAS = 366;
const PAGINA_PADRAO = 100;
const PAGINA_MAXIMA = 200;

const OPENAPI = readFileSync(new URL('./openapi.yaml', import.meta.url), 'utf8');

// ---- esquemas de entrada ---------------------------------------------------------------------

const instante = z.iso.datetime({ offset: true });
const data = z.iso.date();
/** U+FFFD: o que sobra de texto que chegou fora de UTF-8; gravado, ficaria corrompido. */
const SUBSTITUICAO = String.fromCharCode(0xfffd);
const titulo = z
  .string()
  .trim()
  .min(1)
  .max(TAMANHO_DO_TITULO)
  // Caractere de controle quebra a fala e o contexto do modelo.
  // eslint-disable-next-line no-control-regex
  .refine((t) => !/[\u0000-\u001f\u007f]/.test(t) && !t.includes(SUBSTITUICAO));
const busca = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((q) => !q.includes(SUBSTITUICAO))
  .optional();

const esquemaEvento = z
  .object({
    title: titulo,
    start: z.union([instante, data]),
    end: z.union([instante, data]).optional(),
    duration_minutes: z.number().int().min(1).max(10_080).optional(),
    all_day: z.boolean().default(false),
  })
  .strict();

const esquemaTarefa = z
  .object({
    title: titulo,
    effort: z.number().refine((v) => (ESFORCOS as readonly number[]).includes(v)),
    attribute: z.enum(ATRIBUTOS),
    secondary_attribute: z.enum(ATRIBUTOS).optional(),
    due: z.union([instante, data]).optional(),
  })
  .strict();

const esquemaConclusao = z.object({ occurrence_date: data.optional() }).strict();

const TIPOS = ['event', 'class', 'task'] as const;
const esquemaAgenda = z.object({
  from: instante,
  to: instante,
  types: z
    .string()
    .optional()
    .transform((t, ctx) => {
      if (t === undefined) return [...TIPOS];
      const lista = [...new Set(t.split(',').map((x) => x.trim()))];
      if (!lista.length || lista.some((x) => !(TIPOS as readonly string[]).includes(x))) {
        ctx.addIssue({ code: 'custom', message: 'types' });
        return z.NEVER;
      }
      return lista as (typeof TIPOS)[number][];
    }),
  q: busca,
  limit: z.coerce.number().int().min(1).max(PAGINA_MAXIMA).default(PAGINA_PADRAO),
  cursor: z.string().max(100).optional(),
});

const esquemaTarefas = z.object({
  done: z.enum(['true', 'false']).optional(),
  q: busca,
  limit: z.coerce.number().int().min(1).max(PAGINA_MAXIMA).default(PAGINA_PADRAO),
  cursor: z.string().max(100).optional(),
});

// ---- auxiliares ------------------------------------------------------------------------------

async function corpoJson(c: C): Promise<unknown> {
  const texto = await c.req.text();
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw invalido('o corpo precisa ser JSON');
  }
}

function validar<T extends z.ZodType>(esquema: T, valor: unknown): z.infer<T> {
  const r = esquema.safeParse(valor);
  if (!r.success) throw erroDoZod(r.error);
  return r.data;
}

function exigirEscopo(c: C, escopo: 'agenda:read' | 'agenda:write') {
  const { escopos } = c.var.sessao;
  if (escopos !== null && !escopos.includes(escopo)) {
    throw new ErroV1(
      403,
      'forbidden',
      escopo === 'agenda:write'
        ? 'este token só pode consultar a agenda'
        : 'este token não pode consultar a agenda',
    );
  }
}

/**
 * Idempotency-Key → id do item (ou da conclusão). SHA-256 de conta + operação + chave, no
 * formato UUID versão 8: a mesma chave gera sempre o mesmo id, então o reenvio após uma
 * reconexão encontra a linha já gravada em vez de duplicar. Sem tabela nova e sobrevive a
 * reinício da API.
 */
function idDaChave(userId: string, operacao: string, chave: string): string {
  const h = createHash('sha256').update(`${userId}\n${operacao}\n${chave}`, 'utf8').digest();
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function chaveDeIdempotencia(c: C): string | null {
  const chave = c.req.header('idempotency-key');
  if (chave === undefined) return null;
  if (!/^[\x21-\x7e]{1,200}$/.test(chave)) {
    throw invalido('Idempotency-Key precisa ter de 1 a 200 caracteres visíveis', 'Idempotency-Key');
  }
  return chave;
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Busca por título: toda palavra de 3+ letras da pergunta aparece no título, sem acento. */
function buscador(q: string | undefined) {
  if (!q) return () => true;
  const palavras = semAcento(q)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
  const inteira = semAcento(q).trim();
  return (texto: string) => {
    const t = semAcento(texto);
    return palavras.length ? palavras.every((p) => t.includes(p)) : t.includes(inteira);
  };
}

/** Paginação por deslocamento sobre a lista já ordenada; o cursor é opaco para a Luna. */
function paginar<T>(lista: T[], limite: number, cursor: string | undefined) {
  let inicio = 0;
  if (cursor !== undefined) {
    const n = Number(Buffer.from(cursor, 'base64url').toString('utf8').replace(/^o:/, ''));
    if (!Number.isInteger(n) || n < 0 || !cursor.length)
      throw invalido('cursor inválido', 'cursor');
    inicio = n;
  }
  const pagina = lista.slice(inicio, inicio + limite);
  const proximo = inicio + limite < lista.length ? inicio + limite : null;
  return {
    pagina,
    next_cursor: proximo === null ? null : Buffer.from(`o:${proximo}`).toString('base64url'),
  };
}

/** Instante de ordenação de um item da agenda. Dia inteiro conta como a meia-noite do dia. */
function instanteDe(i: ItemV1): number {
  if (!i.start) return Number.MAX_SAFE_INTEGER;
  return i.start.length === 10 ? inicioDoDia(i.start).getTime() : Date.parse(i.start);
}

const ORDEM_DO_TIPO = { event: 0, class: 1, task: 2 } as const;
function ordenar(a: ItemV1, b: ItemV1): number {
  return (
    instanteDe(a) - instanteDe(b) ||
    Number(b.all_day) - Number(a.all_day) ||
    ORDEM_DO_TIPO[a.type] - ORDEM_DO_TIPO[b.type] ||
    a.title.localeCompare(b.title, 'pt-BR') ||
    (a.occurrence_date ?? '').localeCompare(b.occurrence_date ?? '')
  );
}

async function agendaV1(
  r: Repositorios,
  de: Date,
  ate: Date,
  tipos: readonly string[],
): Promise<ItemV1[]> {
  const saida: ItemV1[] = [];
  if (tipos.includes('event') || tipos.includes('task')) {
    for (const e of await r.agenda.projetar(de, ate)) {
      if (e.kind === 'event' && tipos.includes('event')) saida.push(eventoV1(deEntrada(e)));
      if (e.kind === 'task' && tipos.includes('task')) saida.push(tarefaV1(deEntrada(e)));
    }
  }
  if (tipos.includes('class')) {
    for (const a of await r.agenda.aulas(de, ate)) {
      const { inicio, fim } = instantesDaAula(a);
      if (inicio < ate && fim > de) saida.push(aulaV1(a));
    }
  }
  return saida.sort(ordenar);
}

/** Eventos com horário e aulas não canceladas que se sobrepõem a `[de, ate)`. */
async function conflitos(r: Repositorios, de: Date, ate: Date, ignorar: string) {
  const lista = await agendaV1(r, de, ate, ['event', 'class']);
  return lista.filter((i) => {
    if (i.type === 'event') return !i.all_day && i.id !== ignorar;
    return i.type === 'class' && !i.cancelled;
  });
}

/** Tarefa lida de volta: simples pela linha, ocorrência pela projeção em volta da data. */
async function tarefaLida(r: Repositorios, item: LinhaItem, ocorrencia: string | null) {
  if (ocorrencia === null) return tarefaV1(deLinha(item));
  const de = inicioDoDia(somarDias(ocorrencia, -31));
  const ate = inicioDoDia(somarDias(ocorrencia, 32));
  const e = (await r.agenda.projetar(de, ate)).find(
    (x: EntradaAgenda) => x.itemId === item.id && x.ocorrencia === ocorrencia,
  );
  if (!e) throw new ErroV1(404, 'not_found', 'não encontrei essa ocorrência da tarefa');
  return tarefaV1(deEntrada(e));
}

/** Campos que definem "o mesmo pedido" num reenvio com a mesma Idempotency-Key. */
function mesmoPedido(a: LinhaItem, b: ItemWire): boolean {
  const t = (d: Date | null) => d?.getTime() ?? null;
  const tw = (d: string | null) => (d ? Date.parse(d) : null);
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.allDay === b.allDay &&
    t(a.startAt) === tw(b.startAt) &&
    t(a.endAt) === tw(b.endAt) &&
    t(a.dueAt) === tw(b.dueAt) &&
    a.effort === b.effort &&
    a.primaryAttribute === b.primaryAttribute &&
    a.secondaryAttribute === b.secondaryAttribute
  );
}

export function itemNovo(
  agora: Date,
  lembrete: number | null,
  campos: Partial<ItemWire>,
): ItemWire {
  return {
    id: novoId(),
    title: '',
    notes: null,
    kind: 'event',
    effort: null,
    effortLockedAt: null,
    primaryAttribute: null,
    secondaryAttribute: null,
    dueAt: null,
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: FUSO_PADRAO,
    rrule: null,
    sourceUid: null,
    courseId: null,
    recurrenceEndsAt: null,
    status: 'open',
    completedAt: null,
    postponeCount: 0,
    // Lembrete padrão da conta, como a captura do app (issue #85).
    reminderMinutesBefore: lembrete,
    deletedAt: null,
    createdAt: agora.toISOString(),
    updatedAt: agora.toISOString(),
    ...campos,
  };
}

/**
 * Grava pela porta da API com idempotência. Reenvio com a mesma chave e o mesmo pedido devolve o
 * já gravado (200); com outro pedido, `conflict`.
 */
async function gravar(r: Repositorios, w: ItemWire) {
  const valido = esquemaItem.safeParse(w);
  if (!valido.success) throw invalido(valido.error.issues[0]?.message ?? 'item inválido');
  const { linha, criado } = await r.itens.criarPelaApi(valido.data);
  if (!criado && !mesmoPedido(linha, valido.data)) {
    throw new ErroV1(409, 'conflict', 'essa Idempotency-Key já foi usada com outro pedido');
  }
  return { linha, criado };
}

// ---- rotas -----------------------------------------------------------------------------------

/**
 * `/api/v1`: a porta da Luna, assistente de voz, servidor a servidor (ADR-0012). Contrato em
 * `openapi.yaml`, servido em `/api/v1/openapi.yaml`. Não substitui o sync: o app continua
 * escrevendo pelo `/sync/push`, e o que a Luna cria chega ao aparelho no próximo pull.
 */
export function rotasV1(banco: Banco, opcoes: { versao: string; limite?: LimiteDeTentativas }) {
  const v1 = new Hono<{ Variables: VariaveisAutenticadas }>();
  const limite = opcoes.limite ?? new LimiteDeTentativas(LIMITE_POR_MINUTO, 60_000);

  v1.onError((erro, c) => {
    let e: ErroV1;
    if (erro instanceof ErroV1) e = erro;
    else if (erro instanceof ErroDeOcorrencia) {
      e =
        erro.status === 404
          ? new ErroV1(404, 'not_found', 'não encontrei esse item')
          : erro.status === 409
            ? new ErroV1(409, 'conflict', erro.message)
            : invalido(erro.message);
    } else {
      console.error(erro);
      e = new ErroV1(500, 'internal', 'erro interno no Compasso');
    }
    return c.json(e.corpo(), e.status, e.cabecalhos);
  });

  // Público: o contrato não tem segredo (o repositório é público).
  v1.get('/openapi.yaml', (c) =>
    c.body(OPENAPI, 200, { 'content-type': 'application/yaml; charset=utf-8' }),
  );

  v1.use('*', async (c, next) => {
    const token = tokenDoCabecalho(c.req.header('authorization'));
    if (!token) throw new ErroV1(401, 'unauthorized', 'token ausente ou inválido');
    const tokenHash = hashDoToken(token);
    const sessao = await banco.resolverToken(tokenHash);
    if (!sessao) throw new ErroV1(401, 'unauthorized', 'token ausente ou inválido');
    const espera = limite.bloqueadoPor(tokenHash);
    if (espera) {
      throw new ErroV1(
        429,
        'rate_limited',
        `muitas requisições; tente de novo em ${espera} s`,
        undefined,
        { 'retry-after': String(espera) },
      );
    }
    limite.registrarFalha(tokenHash); // aqui conta toda requisição, não só falha
    definirSessao(c, banco, tokenHash, sessao);
    await next();
  });

  v1.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: () => {
        throw new ErroV1(413, 'validation_error', 'corpo grande demais');
      },
    }),
  );

  // Não toca o banco além da resolução do token, que o middleware já fez.
  v1.get('/health', (c) => c.json({ ok: true, version: opcoes.versao }));

  v1.get('/agenda', async (c) => {
    exigirEscopo(c, 'agenda:read');
    const p = validar(esquemaAgenda, c.req.query());
    const de = new Date(p.from);
    const ate = new Date(p.to);
    if (ate <= de) throw invalido('to precisa ser depois de from', 'to');
    if (ate.getTime() - de.getTime() > INTERVALO_MAXIMO_DIAS * DIA_MS) {
      throw invalido(`o intervalo pode ter no máximo ${INTERVALO_MAXIMO_DIAS} dias`, 'to');
    }
    const casa = buscador(p.q);
    const lista = (await c.var.transacao((r) => agendaV1(r, de, ate, p.types))).filter(
      (i) => casa(i.title) || (i.type === 'class' && casa(i.subject)),
    );
    const { pagina, next_cursor } = paginar(lista, p.limit, p.cursor);
    return c.json({ timezone: FUSO_PADRAO, items: pagina, next_cursor });
  });

  v1.get('/tasks', async (c) => {
    exigirEscopo(c, 'agenda:read');
    const p = validar(esquemaTarefas, c.req.query());
    const casa = buscador(p.q);
    const linhas = await c.var.transacao((r) => r.itens.tarefasSimples());
    const lista = linhas
      .filter((l) => p.done === undefined || (l.status === 'done') === (p.done === 'true'))
      .filter((l) => casa(l.title))
      .map((l) => tarefaV1(deLinha(l)));
    const { pagina, next_cursor } = paginar(lista, p.limit, p.cursor);
    return c.json({ timezone: FUSO_PADRAO, items: pagina, next_cursor });
  });

  v1.post('/tasks', async (c) => {
    exigirEscopo(c, 'agenda:write');
    const chave = chaveDeIdempotencia(c);
    const p = validar(esquemaTarefa, await corpoJson(c));
    if (p.secondary_attribute === p.attribute) {
      throw invalido(
        'secondary_attribute precisa ser diferente de attribute',
        'secondary_attribute',
      );
    }
    const soData = p.due !== undefined && p.due.length === 10;
    const { tarefa, criado } = await c.var.transacao(async (r) => {
      const agora = new Date();
      const usuario = await r.usuarios.atual();
      const w = itemNovo(agora, usuario?.defaultReminderMinutes ?? null, {
        id: chave ? idDaChave(c.var.userId, 'tasks', chave) : novoId(),
        title: p.title,
        kind: 'task',
        effort: p.effort,
        primaryAttribute: p.attribute,
        secondaryAttribute: p.secondary_attribute ?? null,
        dueAt:
          p.due === undefined
            ? null
            : (soData ? inicioDoDia(p.due) : new Date(p.due)).toISOString(),
        allDay: soData,
      });
      const { linha, criado } = await gravar(r, w);
      return { tarefa: tarefaV1(deLinha(linha)), criado };
    });
    return c.json(tarefa, criado ? 201 : 200, criado ? {} : { 'idempotent-replayed': 'true' });
  });

  v1.post('/tasks/:id/complete', async (c) => {
    exigirEscopo(c, 'agenda:write');
    const id = c.req.param('id');
    const chave = chaveDeIdempotencia(c);
    const p = validar(esquemaConclusao, await corpoJson(c));
    const naoAchei = new ErroV1(404, 'not_found', 'não encontrei essa tarefa');
    if (!z.uuid().safeParse(id).success) throw naoAchei;
    const tarefa = await c.var.transacao(async (r) => {
      const item = await r.itens.obterLinha(id);
      if (!item || item.kind !== 'task') throw naoAchei;
      const ocorrencia = p.occurrence_date ?? null;
      if (item.rrule && ocorrencia === null) {
        throw invalido('essa tarefa se repete: informe occurrence_date', 'occurrence_date');
      }
      if (!item.rrule && ocorrencia !== null) {
        throw invalido('essa tarefa não se repete: não envie occurrence_date', 'occurrence_date');
      }
      const agora = new Date().toISOString();
      // Concluir o concluído não credita de novo (ADR-0006): repetir é seguro mesmo sem chave.
      const conclusao = chave ? idDaChave(c.var.userId, `complete:${id}`, chave) : novoId();
      const { efeitos } = await r.conclusoes.aplicarPush([
        {
          id: conclusao,
          itemId: id,
          occurrenceDate: ocorrencia,
          action: 'complete',
          at: agora,
          createdAt: agora,
          updatedAt: agora,
        },
      ]);
      const efeito = efeitos.get(conclusao);
      if (efeito?.tipo === 'nada' && efeito.motivo === 'data não é ocorrência da série') {
        throw invalido('nessa data a tarefa não acontece', 'occurrence_date');
      }
      const atualizado = await r.itens.obterLinha(id);
      return tarefaLida(r, atualizado!, ocorrencia);
    });
    return c.json(tarefa);
  });

  v1.post('/events', async (c) => {
    exigirEscopo(c, 'agenda:write');
    const chave = chaveDeIdempotencia(c);
    const p = validar(esquemaEvento, await corpoJson(c));
    if (p.end !== undefined && p.duration_minutes !== undefined) {
      throw invalido('envie end ou duration_minutes, não os dois', 'duration_minutes');
    }
    let inicio: Date;
    let fim: Date;
    if (p.all_day) {
      if (p.start.length !== 10) {
        throw invalido('com all_day, start é só a data, como 2026-09-26', 'start');
      }
      if (p.end !== undefined && p.end.length !== 10) {
        throw invalido('com all_day, end é só a data do último dia', 'end');
      }
      if (p.duration_minutes !== undefined) {
        throw invalido('evento de dia inteiro não usa duration_minutes', 'duration_minutes');
      }
      const ultimo = p.end ?? p.start;
      if (ultimo < p.start) throw invalido('end não pode ser antes de start', 'end');
      inicio = inicioDoDia(p.start);
      fim = inicioDoDia(somarDias(ultimo, 1)); // fim exclusivo (ADR-0003)
    } else {
      if (p.start.length === 10) {
        throw invalido('start precisa de hora e fuso, ou use all_day: true', 'start');
      }
      if (p.end !== undefined && p.end.length === 10) {
        throw invalido('end precisa de hora e fuso', 'end');
      }
      inicio = new Date(p.start);
      fim =
        p.end !== undefined
          ? new Date(p.end)
          : new Date(inicio.getTime() + (p.duration_minutes ?? 60) * 60_000);
      if (fim <= inicio) throw invalido('end precisa ser depois de start', 'end');
    }
    const { evento, criado, sobrepostos } = await c.var.transacao(async (r) => {
      const agora = new Date();
      const usuario = await r.usuarios.atual();
      const w = itemNovo(agora, usuario?.defaultReminderMinutes ?? null, {
        id: chave ? idDaChave(c.var.userId, 'events', chave) : novoId(),
        title: p.title,
        kind: 'event',
        startAt: inicio.toISOString(),
        endAt: fim.toISOString(),
        allDay: p.all_day,
      });
      const { linha, criado } = await gravar(r, w);
      // Só avisa: o evento já foi criado. Dia inteiro não conflita com nada.
      const sobrepostos =
        linha.allDay || !linha.startAt || !linha.endAt
          ? []
          : await conflitos(r, linha.startAt, linha.endAt, linha.id);
      return { evento: eventoV1(deLinha(linha)), criado, sobrepostos };
    });
    return c.json(
      { ...evento, conflicts: sobrepostos },
      criado ? 201 : 200,
      criado ? {} : { 'idempotent-replayed': 'true' },
    );
  });

  v1.all('*', () => {
    throw new ErroV1(404, 'not_found', 'rota inexistente na API da Luna');
  });

  return v1;
}
