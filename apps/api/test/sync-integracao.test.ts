/**
 * Os quatro cenários de sincronização do roadmap (F1) com dois clients de verdade (ver
 * `clientes.ts`), contra a API e um PostgreSQL reais.
 */
import { describe, expect, it } from 'vitest';
import { DIA, novoEvento, SemRede, usarClientes, type Cliente } from './clientes';

const { ctx, fisicos, doisAparelhos, linhasNoServidor } = usarClientes();
const sqliteDe = (c: Cliente) => c.sqlite;

describe('cenário 1 — criar offline → sincronizar', () => {
  it('o item chega ao servidor e ao outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 1');
    const item = a.repo.criar(novoEvento('Consulta'));
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    expect(a.repo.sujos().itens.map((s) => s.id)).toEqual([item.id]);

    a.online = true;
    await a.motor.sincronizar();
    expect(a.repo.sujos()).toEqual({ itens: [], ocorrencias: [] });
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([item.id]);

    b.online = true;
    await b.motor.sincronizar();
    expect(b.repo.listar().map((i) => [i.id, i.title])).toEqual([[item.id, 'Consulta']]);
  });

  it('roteiro do critério de saída: 3 criados, 1 editado, 1 excluído offline', async () => {
    const { userId, a } = await doisAparelhos('Roteiro F1');
    const [x, y, z] = ['X', 'Y', 'Z'].map((t) => a.repo.criar(novoEvento(t)));
    a.tempo(1000);
    a.repo.editar(y!.id, { title: 'Y editado' });
    a.repo.excluir(z!.id);
    a.online = true;
    await a.motor.sincronizar();

    const servidor = await linhasNoServidor(userId);
    expect(servidor).toHaveLength(3);
    const porId = new Map(servidor.map((l) => [l.id, l]));
    expect(porId.get(x!.id)).toMatchObject({ title: 'X', deleted_at: null });
    expect(porId.get(y!.id)).toMatchObject({ title: 'Y editado', deleted_at: null });
    expect(porId.get(z!.id)!.deleted_at).not.toBeNull();
  });
});

describe('cenário 2 — mesmo item editado nos dois clients offline', () => {
  it.each([
    ['A mais recente, A sincroniza primeiro', 'a', ['a', 'b']],
    ['A mais recente, B sincroniza primeiro', 'a', ['b', 'a']],
    ['B mais recente, A sincroniza primeiro', 'b', ['a', 'b']],
    ['B mais recente, B sincroniza primeiro', 'b', ['b', 'a']],
  ] as const)('%s → os dois convergem para a escrita mais recente', async (_n, vencedor, ordem) => {
    const { userId, a, b } = await doisAparelhos(`Cenário 2 ${vencedor} ${ordem.join('')}`);
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('original'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    a.online = b.online = false;

    const c = { a, b };
    const perdedor = vencedor === 'a' ? 'b' : 'a';
    c[perdedor].tempo(1_000);
    c[perdedor].repo.editar(item.id, { title: `edição de ${perdedor}` });
    c[vencedor].tempo(5_000);
    c[vencedor].repo.editar(item.id, { title: `edição de ${vencedor}` });

    a.online = b.online = true;
    for (const quem of ordem) await c[quem].motor.sincronizar();
    // Uma segunda rodada leva a versão final a quem sincronizou primeiro.
    for (const quem of ordem) await c[quem].motor.sincronizar();

    const esperado = `edição de ${vencedor}`;
    expect(a.repo.obter(item.id)!.title).toBe(esperado);
    expect(b.repo.obter(item.id)!.title).toBe(esperado);
    expect((await linhasNoServidor(userId))[0]!.title).toBe(esperado);
    expect(a.repo.sujos()).toEqual({ itens: [], ocorrencias: [] });
    expect(b.repo.sujos()).toEqual({ itens: [], ocorrencias: [] });
  });
});

describe('cenário 3 — excluir de um lado não ressuscita do outro', () => {
  it('cópia antiga e limpa no outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 3 limpo');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('vai sumir'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();

    a.tempo(1000);
    a.repo.excluir(item.id);
    await b.motor.sincronizar(); // B sincroniza antes de saber da exclusão
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    await a.motor.sincronizar();

    expect(a.repo.listar()).toEqual([]);
    expect(b.repo.listar()).toEqual([]);
    expect((await linhasNoServidor(userId))[0]!.deleted_at).not.toBeNull();
  });

  it('cópia antiga editada offline antes da exclusão no outro client', async () => {
    const { userId, a, b } = await doisAparelhos('Cenário 3 sujo');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('vai sumir'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();
    a.online = b.online = false;

    b.tempo(1000);
    b.repo.editar(item.id, { title: 'edição antiga' });
    a.tempo(5000);
    a.repo.excluir(item.id);

    a.online = true;
    await a.motor.sincronizar();
    b.online = true;
    await b.motor.sincronizar();
    await a.motor.sincronizar();

    expect(a.repo.listar()).toEqual([]);
    expect(b.repo.listar()).toEqual([]);
    const [linha] = await linhasNoServidor(userId);
    expect(linha!.deleted_at).not.toBeNull();
    expect(linha!.title).toBe('vai sumir');
  });
});

describe('cenário 4 — push repetido não duplica', () => {
  it('resposta do push perdida: o retry não cria segunda linha', async () => {
    const { userId, a } = await doisAparelhos('Cenário 4');
    a.online = true;
    a.perderRespostaDoPush = true;
    const item = a.repo.criar(novoEvento('uma vez só'));
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    await expect(a.motor.sincronizar()).rejects.toThrow(SemRede);
    a.perderRespostaDoPush = false;
    await a.motor.sincronizar();

    expect(a.pushes).toBe(3);
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([item.id]);
    expect(a.repo.listar()).toHaveLength(1);
    expect(a.repo.sujos()).toEqual({ itens: [], ocorrencias: [] });
  });
});

describe('motor de sync', () => {
  it('edição feita com o push em voo não se perde', async () => {
    const { userId, a } = await doisAparelhos('Push em voo');
    a.online = true;
    const item = a.repo.criar(novoEvento('antes'));
    a.duranteOPush = () => {
      a.duranteOPush = null;
      a.tempo(10);
      a.repo.editar(item.id, { title: 'durante' });
    };
    await a.motor.sincronizar();
    expect(a.repo.sujos().itens.map((s) => s.title)).toEqual(['durante']);
    expect(a.repo.obter(item.id)!.title).toBe('durante');

    await a.motor.sincronizar();
    expect(a.repo.sujos()).toEqual({ itens: [], ocorrencias: [] });
    expect((await linhasNoServidor(userId))[0]!.title).toBe('durante');
  });

  it('duas chamadas simultâneas rodam uma sincronização só', async () => {
    const { a } = await doisAparelhos('Concorrência');
    a.online = true;
    a.repo.criar(novoEvento('x'));
    const [r1, r2] = await Promise.all([a.motor.sincronizar(), a.motor.sincronizar()]);
    expect(r1).toBe(r2);
    expect(a.pushes).toBe(1);
  });

  it('purga local: tombstone confirmado de 31 dias sai, de 29 fica', async () => {
    const { a } = await doisAparelhos('Purga local');
    a.online = true;
    const t0 = a.relogio;
    const velho = a.repo.criar(novoEvento('velho'));
    const recente = a.repo.criar(novoEvento('recente'));
    a.repo.excluir(velho.id);
    a.tempo(2 * DIA);
    a.repo.excluir(recente.id);
    await a.motor.sincronizar();
    expect(fisicos(a).sort()).toEqual([velho.id, recente.id].sort());

    a.relogio = t0 + 31 * DIA; // velho excluído há 31 dias; recente, há 29
    await a.motor.sincronizar();
    expect(fisicos(a)).toEqual([recente.id]);
  });

  it('aparelho parado mais que a retenção remove o fantasma purgado no servidor', async () => {
    const { a, b } = await doisAparelhos('Fantasma');
    a.online = b.online = true;
    const item = a.repo.criar(novoEvento('fantasma'));
    await a.motor.sincronizar();
    await b.motor.sincronizar();

    // A exclui; o servidor purga antes de B voltar a sincronizar.
    a.repo.excluir(item.id);
    await a.motor.sincronizar();
    await ctx.dono.query(`update items set deleted_at = now() - interval '40 days' where id = $1`, [
      item.id,
    ]);
    await ctx.env.admin.purgarTombstones(30);

    b.tempo(40 * DIA);
    const r = await b.motor.sincronizar();
    expect(r.completo).toBe(true);
    expect(b.repo.listar()).toEqual([]);
  });

  it('linha suja inválida não trava a sincronização das outras', async () => {
    const { userId, a } = await doisAparelhos('Inválida');
    a.online = true;
    const boa = a.repo.criar(novoEvento('boa'));
    const ruim = a.repo.criar(novoEvento('ruim'));
    // Corrompe direto no SQLite, contornando o repositório (ex.: bug de versão antiga do app).
    sqliteDe(a).prepare(`update items set kind = 'task' where id = ?`).run(ruim.id);
    const r = await a.motor.sincronizar();
    expect(r.invalidos).toEqual([ruim.id]);
    expect((await linhasNoServidor(userId)).map((l) => l.id)).toEqual([boa.id]);
  });
});

describe('repositório local (CRUD offline)', () => {
  it('criar, editar e excluir funcionam sem rede e marcam dirty', async () => {
    const { a } = await doisAparelhos('CRUD local');
    const item = a.repo.criar(novoEvento('novo'));
    expect(item.id).toMatch(/^[0-9a-f-]{8}-[0-9a-f]{4}-7/);
    expect(item.dirty).toBe(true);

    a.tempo(10);
    const editado = a.repo.editar(item.id, { title: 'editado', notes: 'levar exames' });
    expect(editado.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());

    a.repo.excluir(item.id);
    expect(a.repo.listar()).toEqual([]);
    expect(a.repo.obter(item.id)).toBeNull();
    const fisica = sqliteDe(a)
      .prepare('select deleted_at, dirty from items where id = ?')
      .get(item.id) as { deleted_at: number | null; dirty: number };
    expect(fisica.deleted_at).not.toBeNull();
    expect(fisica.dirty).toBe(1);
  });

  it('relógio do aparelho que volta no tempo não faz a edição perder para a anterior', async () => {
    const { a } = await doisAparelhos('Relógio volta');
    const item = a.repo.criar(novoEvento('x'));
    a.tempo(-60_000);
    const editado = a.repo.editar(item.id, { title: 'y' });
    expect(editado.updatedAt.getTime()).toBe(item.updatedAt.getTime() + 1);
  });

  it('recusa item que viola invariante, com motivo legível', async () => {
    const { a } = await doisAparelhos('Validação local');
    expect(() => a.repo.criar({ ...novoEvento('t'), kind: 'task' })).toThrow(
      /tarefa exige esforço/,
    );
    expect(() => a.repo.criar(novoEvento('   '))).toThrow(/título vazio/);
    const item = a.repo.criar(novoEvento('ok'));
    expect(() => a.repo.editar(item.id, { effort: 3 })).toThrow(/atributo principal/);
    expect(a.repo.obter(item.id)!.effort).toBeNull();
  });
});

describe('consulta local por intervalo', () => {
  it('mesma regra que itemNoIntervalo do core', async () => {
    const { itemNoIntervalo, instanteDeParede, intervaloDosDias, limitesDiaInteiro } =
      await import('@compasso/core');
    const { a } = await doisAparelhos('Intervalo');
    const sp = (d: number, h: number) => instanteDeParede(2026, 9, d, h, 0);
    const mk = (titulo: string, startAt: Date, endAt: Date | null, allDay = false) =>
      a.repo.criar({ ...novoEvento(titulo), startAt, endAt, allDay });
    mk('três dias desde ontem', sp(22, 10), sp(24, 18));
    mk('termina à meia-noite de ontem', sp(22, 22), sp(23, 0));
    mk('pontual hoje', sp(23, 9), null);
    mk('pontual ontem', sp(22, 9), null);
    mk('amanhã', sp(24, 9), sp(24, 10));
    const di = limitesDiaInteiro('2026-09-23', '2026-09-23');
    mk('dia inteiro hoje', di.startAt, di.endAt, true);
    const excluido = mk('excluído', sp(23, 12), null);
    a.repo.excluir(excluido.id);

    const { de, ate } = intervaloDosDias('2026-09-23', '2026-09-23');
    const viaSql = a.repo
      .listarNoIntervalo(de, ate)
      .map((i) => i.title)
      .sort();
    const viaCore = a.repo
      .listar()
      .filter((i) => itemNoIntervalo(i, de, ate))
      .map((i) => i.title)
      .sort();
    expect(viaSql).toEqual(['dia inteiro hoje', 'pontual hoje', 'três dias desde ontem']);
    expect(viaSql).toEqual(viaCore);
  });
});
