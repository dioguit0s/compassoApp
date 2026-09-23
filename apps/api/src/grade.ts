import { Hono, type Context } from 'hono';
import type { VariaveisAutenticadas } from './auth';
import { ErroDeGrade } from './db/repositorios';

type C = Context<{ Variables: VariaveisAutenticadas }>;

/**
 * Rotas da grade acadêmica (especificação §6.3). O app escreve pelo sync (offline-first); estas
 * rotas existem para uso direto da API e seguem as mesmas regras, pela mesma validação.
 */
export function rotasDaGrade() {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();
  rotas.onError((erro, c) => {
    if (erro instanceof ErroDeGrade) return c.json({ erro: erro.message }, erro.status);
    throw erro;
  });
  const corpo = async (c: C) =>
    ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  rotas.get('/semesters', async (c) =>
    c.json(await c.var.transacao(async (r) => (await r.grade.paraProjecao()).semestres)),
  );

  // Semestre novo nasce ativo e desativa os outros (ADR-0005).
  rotas.post('/semesters', async (c) => {
    const { label, startDate, endDate } = await corpo(c);
    return c.json(
      await c.var.transacao(async (r) => {
        const ativos = (await r.grade.paraProjecao()).semestres.filter((s) => s.active);
        for (const s of ativos) await r.grade.editar('semestres', s.id, { active: false });
        return r.grade.criar('semestres', { label, startDate, endDate, active: true });
      }),
      201,
    );
  });

  rotas.get('/courses', async (c) => {
    const semesterId = c.req.query('semesterId') ?? null;
    return c.json(await c.var.transacao((r) => r.grade.disciplinasComHorarios(semesterId)));
  });

  rotas.post('/courses', async (c) => {
    const b = await corpo(c);
    const dados = {
      semesterId: b.semesterId,
      name: b.name,
      code: b.code ?? null,
      professor: b.professor ?? null,
      color: b.color,
      defaultRoom: b.defaultRoom ?? null,
      notes: b.notes ?? null,
    };
    return c.json(await c.var.transacao((r) => r.grade.criar('disciplinas', dados)), 201);
  });

  const campos = (b: Record<string, unknown>, permitidos: string[]) =>
    Object.fromEntries(Object.entries(b).filter(([k]) => permitidos.includes(k)));

  rotas.patch('/courses/:id', async (c) => {
    const m = campos(await corpo(c), [
      'name',
      'code',
      'professor',
      'color',
      'defaultRoom',
      'notes',
    ]);
    return c.json(
      await c.var.transacao((r) => r.grade.editar('disciplinas', c.req.param('id'), m)),
    );
  });

  rotas.delete('/courses/:id', async (c) => {
    await c.var.transacao((r) => r.grade.excluir('disciplinas', c.req.param('id')));
    return c.body(null, 204);
  });

  rotas.post('/courses/:id/slots', async (c) => {
    const b = await corpo(c);
    const dados = {
      courseId: c.req.param('id'),
      weekday: b.weekday,
      startTime: b.startTime,
      endTime: b.endTime,
      room: b.room ?? null,
    };
    return c.json(await c.var.transacao((r) => r.grade.criar('horarios', dados)), 201);
  });

  rotas.patch('/slots/:id', async (c) => {
    const m = campos(await corpo(c), ['weekday', 'startTime', 'endTime', 'room']);
    return c.json(await c.var.transacao((r) => r.grade.editar('horarios', c.req.param('id'), m)));
  });

  rotas.delete('/slots/:id', async (c) => {
    await c.var.transacao((r) => r.grade.excluir('horarios', c.req.param('id')));
    return c.body(null, 204);
  });

  rotas.post('/slots/:id/exceptions', async (c) => {
    const b = await corpo(c);
    const dados = {
      slotId: c.req.param('id'),
      date: b.date,
      type: b.type,
      room: b.room ?? null,
      note: b.note ?? null,
      startTime: b.startTime ?? null,
      endTime: b.endTime ?? null,
    };
    return c.json(await c.var.transacao((r) => r.grade.criar('excecoes', dados)), 201);
  });

  return rotas;
}
