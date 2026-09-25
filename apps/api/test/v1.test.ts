import { diaDe, somarDias } from '@compasso/core';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { LimiteDeTentativas } from '../src/limite';
import { semearExemplo } from '../src/v1/exemplo';
import { isoComFuso, tituloLimpo } from '../src/v1/formato';
import { rotasV1 } from '../src/v1/rotas';
import { ambiente, comToken } from './ajuda';

let env: Awaited<ReturnType<typeof ambiente>>;
let userId: string;
let sessao: string; // token de aparelho
let luna: string; // token de serviço com leitura e escrita
let soLeitura: string;
let ids: Awaited<ReturnType<typeof semearExemplo>>;
const hoje = diaDe(new Date());
const amanha = somarDias(hoje, 1);

/** Pares requisição/resposta reais, gravados em EXEMPLOS_LUNA para a documentação. */
const exemplos: Record<string, unknown> = {};

async function chamar(
  nome: string | null,
  metodo: string,
  caminho: string,
  token: string | null,
  corpo?: unknown,
  cabecalhos: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...cabecalhos };
  if (token) headers.authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  const r = await env.app.request(caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (nome) {
    exemplos[nome] = {
      request: { method: metodo, path: caminho, headers: cabecalhos, body: corpo },
      status: r.status,
      body: json,
    };
  }
  return { status: r.status, corpo: json, cabecalhos: r.headers };
}

beforeAll(async () => {
  env = await ambiente();
  const conta = await env.admin.criarConta('Pessoa da Luna');
  sessao = conta.token;
  userId = conta.userId;
  ids = await env.banco.comUsuario(conta.userId, (r) => semearExemplo(r, hoje));
  const t1 = await chamar('gerar-token', 'POST', '/service-tokens', sessao, {
    label: 'Luna',
    scopes: ['agenda:read', 'agenda:write'],
  });
  expect(t1.status).toBe(201);
  luna = t1.corpo.token;
  const t2 = await chamar(null, 'POST', '/service-tokens', sessao, {
    label: 'Luna leitura',
    scopes: ['agenda:read'],
  });
  soLeitura = t2.corpo.token;
});

afterAll(async () => {
  if (process.env.EXEMPLOS_LUNA) {
    writeFileSync(process.env.EXEMPLOS_LUNA, JSON.stringify(exemplos, null, 2));
  }
  await env.fechar();
});

const dia = (d: string) => ({
  from: `${d}T00:00:00-03:00`,
  to: `${somarDias(d, 1)}T00:00:00-03:00`,
});
const agendaDe = (d: string, extra = '') => {
  const { from, to } = dia(d);
  return `/api/v1/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extra}`;
};

describe('formato', () => {
  it('instante sai com o deslocamento de São Paulo, nunca em UTC', () => {
    expect(isoComFuso(new Date('2026-09-26T17:00:00Z'))).toBe('2026-09-26T14:00:00-03:00');
    expect(isoComFuso(new Date('2026-09-27T02:30:15Z'))).toBe('2026-09-26T23:30:15-03:00');
  });

  it('título sem controle, espaços colapsados e no máximo 200 caracteres', () => {
    expect(tituloLimpo('  a\n\tb  ')).toBe('a b');
    const t = tituloLimpo('x'.repeat(500));
    expect(t).toHaveLength(200);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('autenticação e tokens de serviço', () => {
  it('health: 200 com token válido, 401 sem token ou com token errado', async () => {
    const ok = await chamar('health', 'GET', '/api/v1/health', luna);
    expect(ok.status).toBe(200);
    expect(ok.corpo).toEqual({ ok: true, version: 'teste' });

    const sem = await chamar('erro-401', 'GET', '/api/v1/health', null);
    expect(sem.status).toBe(401);
    expect(sem.corpo).toEqual({
      error: { code: 'unauthorized', message: 'token ausente ou inválido' },
    });
    const errado = await chamar(null, 'GET', '/api/v1/health', 'x'.repeat(43));
    expect(errado.status).toBe(401);
  });

  it('token só de leitura: consulta sim, cria não (403)', async () => {
    expect((await chamar(null, 'GET', agendaDe(amanha), soLeitura)).status).toBe(200);
    const r = await chamar('erro-403', 'POST', '/api/v1/tasks', soLeitura, {
      title: 'x',
      effort: 1,
      attribute: 'casa',
    });
    expect(r.status).toBe(403);
    expect(r.corpo.error.code).toBe('forbidden');
  });

  it('token de serviço não alcança as rotas do app (403), e o de aparelho alcança a v1', async () => {
    const r = await env.app.request('/sync/pull', comToken(luna));
    expect(r.status).toBe(403);
    expect((await chamar(null, 'GET', '/api/v1/health', sessao)).status).toBe(200);
  });

  it('lista e revoga; revogado vira 401', async () => {
    const lista = await chamar('listar-tokens', 'GET', '/service-tokens', sessao);
    expect(lista.corpo.map((t: { label: string }) => t.label).sort()).toEqual([
      'Luna',
      'Luna leitura',
    ]);
    expect(JSON.stringify(lista.corpo)).not.toContain(luna);
    const novo = await chamar(null, 'POST', '/service-tokens', sessao, { label: 'descartável' });
    expect(novo.corpo.scopes).toEqual(['agenda:read', 'agenda:write']);
    const del = await env.app.request(
      `/service-tokens/${novo.corpo.id}`,
      comToken(sessao, { method: 'DELETE' }),
    );
    expect(del.status).toBe(204);
    expect((await chamar(null, 'GET', '/api/v1/health', novo.corpo.token)).status).toBe(401);
  });

  it('token de serviço não gera nem revoga tokens', async () => {
    expect((await chamar(null, 'GET', '/service-tokens', luna)).status).toBe(403);
  });

  it('rate limit: 429 rate_limited com Retry-After', async () => {
    const app = new Hono().route(
      '/limitada',
      rotasV1(env.banco, { versao: 't', limite: new LimiteDeTentativas(2, 60_000) }),
    );
    const pedir = () => app.request('/limitada/health', comToken(luna));
    expect((await pedir()).status).toBe(200);
    expect((await pedir()).status).toBe(200);
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    const corpo = (await r.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('rate_limited');
    exemplos['erro-429'] = { status: 429, body: corpo };
  });
});

describe('GET /api/v1/agenda', () => {
  it('amanhã: eventos, aula, tarefas e recorrência expandida numa resposta, em ordem', async () => {
    const r = await chamar('agenda-amanha', 'GET', agendaDe(amanha), luna);
    expect(r.status).toBe(200);
    const itens = r.corpo.items as { type: string; title: string; start: string }[];
    expect(itens.map((i) => i.title)).toEqual([
      'Aniversário da Ana',
      'Treino na academia',
      'Cálculo II',
      'Dentista',
      'Entregar relatório de física',
    ]);
    expect(r.corpo.next_cursor).toBeNull();

    const [aniversario, treino, aula, dentista, relatorio] = r.corpo.items;
    expect(aniversario).toEqual({
      id: ids.aniversario,
      type: 'event',
      title: 'Aniversário da Ana',
      start: amanha,
      end: amanha,
      all_day: true,
      location: null,
      recurring: false,
      occurrence_date: null,
    });
    expect(treino).toMatchObject({
      id: ids.treino,
      recurring: true,
      occurrence_date: amanha,
      start: `${amanha}T07:00:00-03:00`,
      end: `${amanha}T08:00:00-03:00`,
    });
    expect(aula).toEqual({
      id: ids.horario,
      type: 'class',
      title: 'Cálculo II',
      start: `${amanha}T08:00:00-03:00`,
      end: `${amanha}T10:00:00-03:00`,
      all_day: false,
      location: 'B-204',
      recurring: true,
      occurrence_date: amanha,
      subject: 'Cálculo II',
      professor: 'Marcos Lima',
      cancelled: false,
    });
    expect(dentista.start).toBe(`${amanha}T14:00:00-03:00`);
    expect(relatorio).toMatchObject({
      type: 'task',
      due: `${amanha}T23:59:00-03:00`,
      done: false,
      end: null,
    });
  });

  it('types e q filtram; a busca ignora acento e caixa', async () => {
    const r = await chamar(
      'agenda-busca',
      'GET',
      `/api/v1/agenda?from=${encodeURIComponent(`${hoje}T00:00:00-03:00`)}&to=${encodeURIComponent(`${somarDias(hoje, 60)}T00:00:00-03:00`)}&types=event&q=${encodeURIComponent('prova de calculo')}`,
      luna,
    );
    expect(r.corpo.items.map((i: { id: string }) => i.id)).toEqual([ids.prova]);
    const tarefas = await chamar(null, 'GET', agendaDe(amanha, '&types=task'), luna);
    expect(tarefas.corpo.items).toHaveLength(1);
  });

  it('pagina só quando passa do limite', async () => {
    const semana = `/api/v1/agenda?from=${encodeURIComponent(`${hoje}T00:00:00-03:00`)}&to=${encodeURIComponent(`${somarDias(hoje, 30)}T00:00:00-03:00`)}&types=event`;
    const tudo = await chamar(null, 'GET', semana, luna);
    const p1 = await chamar(null, 'GET', `${semana}&limit=10`, luna);
    expect(p1.corpo.items).toHaveLength(10);
    const p2 = await chamar(null, 'GET', `${semana}&limit=10&cursor=${p1.corpo.next_cursor}`, luna);
    expect([...p1.corpo.items, ...p2.corpo.items].slice(0, 20)).toEqual(
      tudo.corpo.items.slice(0, 20),
    );
  });

  it('erros de validação apontam o parâmetro', async () => {
    const semFuso = await chamar(
      'erro-400',
      'GET',
      `/api/v1/agenda?from=2026-09-26T00:00:00&to=2026-09-27T00:00:00-03:00`,
      luna,
    );
    expect(semFuso.status).toBe(400);
    expect(semFuso.corpo.error).toMatchObject({ code: 'validation_error', field: 'from' });
    const faltando = await chamar(null, 'GET', '/api/v1/agenda', luna);
    expect(faltando.corpo.error).toMatchObject({ field: 'from', message: 'from é obrigatório' });
    const tipo = await chamar(null, 'GET', agendaDe(amanha, '&types=meeting'), luna);
    expect(tipo.corpo.error.field).toBe('types');
    const invertido = await chamar(
      null,
      'GET',
      `/api/v1/agenda?from=${encodeURIComponent(dia(amanha).to)}&to=${encodeURIComponent(dia(amanha).from)}`,
      luna,
    );
    expect(invertido.corpo.error.field).toBe('to');
  });

  it('rota inexistente: 404 not_found no formato da v1', async () => {
    const r = await chamar('erro-404-rota', 'GET', '/api/v1/events', luna);
    expect(r.status).toBe(404);
    expect(r.corpo.error.code).toBe('not_found');
  });
});

describe('tarefas', () => {
  it('GET /tasks?done=false inclui a sem prazo, prazo primeiro', async () => {
    const r = await chamar('tarefas-abertas', 'GET', '/api/v1/tasks?done=false', luna);
    expect(r.corpo.items.map((t: { id: string }) => t.id)).toEqual([
      ids.relatorio,
      ids.lista,
      ids.racao,
    ]);
    expect(r.corpo.items[1]).toMatchObject({ due: somarDias(hoje, 2), all_day: true });
    expect(r.corpo.items[2]).toMatchObject({ due: null, start: null, all_day: false });
  });

  it('cria com prazo só de data; exige esforço e atributo', async () => {
    const r = await chamar(
      'criar-tarefa',
      'POST',
      '/api/v1/tasks',
      luna,
      {
        title: 'Pagar a conta de luz',
        effort: 1,
        attribute: 'casa',
        due: somarDias(hoje, 3),
      },
      { 'Idempotency-Key': 'voz-tarefa-1' },
    );
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      type: 'task',
      title: 'Pagar a conta de luz',
      due: somarDias(hoje, 3),
      all_day: true,
      done: false,
    });
    const sem = await chamar('erro-400-esforco', 'POST', '/api/v1/tasks', luna, {
      title: 'Sem esforço',
    });
    expect(sem.corpo.error).toMatchObject({ code: 'validation_error', field: 'effort' });
    const prioridade = await chamar(null, 'POST', '/api/v1/tasks', luna, {
      title: 'x',
      effort: 1,
      attribute: 'casa',
      priority: 'high',
    });
    expect(prioridade.corpo.error).toMatchObject({
      field: 'priority',
      message: 'campo não suportado: priority',
    });
  });

  it('concluir: 200 com done true; repetir é seguro; série exige a data', async () => {
    const r = await chamar(
      'concluir-tarefa',
      'POST',
      `/api/v1/tasks/${ids.racao}/complete`,
      luna,
      undefined,
      { 'Idempotency-Key': 'voz-concluir-1' },
    );
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ id: ids.racao, done: true });
    const de_novo = await chamar(null, 'POST', `/api/v1/tasks/${ids.racao}/complete`, luna);
    expect(de_novo.corpo.done).toBe(true);
    const abertas = await chamar(null, 'GET', '/api/v1/tasks?done=false', luna);
    expect(abertas.corpo.items.map((t: { id: string }) => t.id)).not.toContain(ids.racao);

    const nao = await chamar(
      'erro-404',
      'POST',
      '/api/v1/tasks/0190b1a2-0000-7000-8000-000000000000/complete',
      luna,
    );
    expect(nao.status).toBe(404);
    expect(nao.corpo.error.message).toBe('não encontrei essa tarefa');
    // Evento não é tarefa.
    expect(
      (await chamar(null, 'POST', `/api/v1/tasks/${ids.dentista}/complete`, luna)).status,
    ).toBe(404);
  });

  it('conclui a ocorrência de uma tarefa recorrente', async () => {
    const criada = await chamar(null, 'POST', '/api/v1/tasks', luna, {
      title: 'Regar as plantas',
      effort: 1,
      attribute: 'casa',
      due: `${hoje}T09:00:00-03:00`,
    });
    // A v1 não cria série; a série vem do app (aqui, pelo repositório).
    await env.banco.comUsuario(userId, (r) =>
      r.itens.editar(criada.corpo.id, { rrule: 'FREQ=DAILY' }),
    );
    const semData = await chamar(null, 'POST', `/api/v1/tasks/${criada.corpo.id}/complete`, luna);
    expect(semData.corpo.error.field).toBe('occurrence_date');
    const ok = await chamar(null, 'POST', `/api/v1/tasks/${criada.corpo.id}/complete`, luna, {
      occurrence_date: amanha,
    });
    expect(ok.corpo).toMatchObject({ recurring: true, occurrence_date: amanha, done: true });
    const agenda = await chamar(null, 'GET', agendaDe(amanha, '&types=task'), luna);
    const oc = agenda.corpo.items.find((i: { id: string }) => i.id === criada.corpo.id);
    expect(oc).toMatchObject({ done: true, due: `${amanha}T09:00:00-03:00` });
  });
});

describe('POST /api/v1/events', () => {
  it('cria com duração padrão de 60 min e avisa conflito sem recusar', async () => {
    const r = await chamar(
      'criar-evento-conflito',
      'POST',
      '/api/v1/events',
      luna,
      { title: 'Reunião do grupo', start: `${amanha}T14:30:00-03:00` },
      { 'Idempotency-Key': 'voz-evento-1' },
    );
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      type: 'event',
      title: 'Reunião do grupo',
      start: `${amanha}T14:30:00-03:00`,
      end: `${amanha}T15:30:00-03:00`,
      all_day: false,
    });
    expect(r.corpo.conflicts.map((c: { id: string }) => c.id)).toEqual([ids.dentista]);
  });

  it('Idempotency-Key: reenvio devolve o mesmo evento (200), outro pedido dá 409', async () => {
    const corpo = {
      title: 'Café com a Bia',
      start: `${amanha}T16:00:00-03:00`,
      duration_minutes: 30,
    };
    const a = await chamar(null, 'POST', '/api/v1/events', luna, corpo, {
      'Idempotency-Key': 'k-2',
    });
    const b = await chamar('reenvio-idempotente', 'POST', '/api/v1/events', luna, corpo, {
      'Idempotency-Key': 'k-2',
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.cabecalhos.get('idempotent-replayed')).toBe('true');
    expect(b.corpo.id).toBe(a.corpo.id);
    const agenda = await chamar(null, 'GET', agendaDe(amanha, '&types=event&q=bia'), luna);
    expect(agenda.corpo.items).toHaveLength(1);

    const outro = await chamar(
      'erro-409',
      'POST',
      '/api/v1/events',
      luna,
      { ...corpo, title: 'Outro' },
      {
        'Idempotency-Key': 'k-2',
      },
    );
    expect(outro.status).toBe(409);
    expect(outro.corpo.error.code).toBe('conflict');
  });

  it('dia inteiro: datas, fim inclusivo, gravado como meia-noite de São Paulo', async () => {
    const r = await chamar('criar-evento-dia-inteiro', 'POST', '/api/v1/events', luna, {
      title: 'Viagem para Campinas',
      start: somarDias(hoje, 5),
      end: somarDias(hoje, 7),
      all_day: true,
    });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      start: somarDias(hoje, 5),
      end: somarDias(hoje, 7),
      all_day: true,
      conflicts: [],
    });
    const meio = await chamar(
      null,
      'GET',
      agendaDe(somarDias(hoje, 6), '&types=event&q=campinas'),
      luna,
    );
    expect(meio.corpo.items).toHaveLength(1);
    const depois = await chamar(
      null,
      'GET',
      agendaDe(somarDias(hoje, 8), '&types=event&q=campinas'),
      luna,
    );
    expect(depois.corpo.items).toHaveLength(0);
  });

  it('validação: fuso obrigatório, end xor duração, dia inteiro só com data', async () => {
    const semFuso = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: 'x',
      start: `${amanha}T14:00:00`,
    });
    expect(semFuso.corpo.error.field).toBe('start');
    const os2 = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: 'x',
      start: `${amanha}T14:00:00-03:00`,
      end: `${amanha}T15:00:00-03:00`,
      duration_minutes: 30,
    });
    expect(os2.corpo.error.field).toBe('duration_minutes');
    const soData = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: 'x',
      start: amanha,
    });
    expect(soData.corpo.error.field).toBe('start');
    const local = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: 'x',
      start: `${amanha}T14:00:00-03:00`,
      location: 'Sala 3',
    });
    expect(local.corpo.error).toMatchObject({ field: 'location', code: 'validation_error' });
    const titulo = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: 'x'.repeat(201),
      start: `${amanha}T14:00:00-03:00`,
    });
    expect(titulo.corpo.error.field).toBe('title');
    // Texto que chegou fora de UTF-8 (visto com curl no Windows): 400, nunca gravado nem 500.
    const corrompido = await chamar(null, 'POST', '/api/v1/events', luna, {
      title: `Reuni${String.fromCharCode(0xfffd)}o do grupo`,
      start: `${amanha}T14:00:00-03:00`,
    });
    expect(corrompido.status).toBe(400);
    expect(corrompido.corpo.error.field).toBe('title');
    const json = await env.app.request('/api/v1/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${luna}`, 'content-type': 'application/json' },
      body: '{"title":',
    });
    expect(((await json.json()) as { error: { message: string } }).error.message).toBe(
      'o corpo precisa ser JSON',
    );
  });

  it('o evento criado pela Luna chega ao aparelho pelo sync', async () => {
    const pull = await env.app.request('/sync/pull', comToken(sessao));
    const { itens } = (await pull.json()) as { itens: { title: string }[] };
    expect(itens.map((i) => i.title)).toContain('Reunião do grupo');
  });
});

describe('openapi', () => {
  it('servido sem autenticação', async () => {
    const r = await env.app.request('/api/v1/openapi.yaml');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('openapi: 3.1.0');
  });
});
