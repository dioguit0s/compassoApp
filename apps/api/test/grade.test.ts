/** F5 — grade acadêmica: schema e sync (#56), courseId (#57), rotas (#58), projeção (#60). */
import { aulasDoDia, intervaloDosDias, novoId, type Aula } from '@compasso/core';
import { describe, expect, it } from 'vitest';
import { comToken } from './ajuda';
import { novoEvento, usarClientes, type Cliente } from './clientes';

const { ctx, doisAparelhos } = usarClientes();

async function sincronizar(...cs: Cliente[]) {
  for (const c of cs) {
    c.online = true;
    await c.motor.sincronizar();
  }
}

function montarGrade(c: Cliente) {
  const sem = c.repo.criarSemestre({
    label: '2026.2',
    startDate: '2026-08-03',
    endDate: '2026-12-12',
  });
  const sr = c.repo.criarDisciplina({
    semesterId: sem.id,
    name: 'Sistemas Reconfiguráveis',
    code: 'SR',
    professor: 'Ana',
    color: '#2F6B8C',
    defaultRoom: 'B-201',
    notes: null,
  });
  const comp = c.repo.criarDisciplina({
    semesterId: sem.id,
    name: 'Compiladores',
    code: 'COMP',
    professor: null,
    color: '#8C4A2F',
    defaultRoom: 'A-101',
    notes: null,
  });
  const h1 = c.repo.criarHorario({
    courseId: sr.id,
    weekday: 2,
    startTime: '19:00',
    endTime: '20:40',
    room: null,
  });
  const h2 = c.repo.criarHorario({
    courseId: comp.id,
    weekday: 2,
    startTime: '20:50',
    endTime: '22:30',
    room: null,
  });
  return { sem, sr, comp, h1, h2 };
}

async function agendaApi(token: string, de: string, ate: string) {
  const j = intervaloDosDias(de, ate);
  const r = await ctx.env.app.request(
    `/agenda?from=${j.de.toISOString()}&to=${j.ate.toISOString()}`,
    comToken(token),
  );
  return ((await r.json()) as { aulas: Aula[] }).aulas;
}

async function api(token: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await ctx.env.app.request(
    caminho,
    comToken(token, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined }),
  );
  return {
    status: r.status,
    corpo: r.status === 204 ? null : ((await r.json()) as Record<string, unknown> & { id: string }),
  };
}

describe('grade no banco e no sync (#56)', () => {
  it('grade criada offline sincroniza; o outro aparelho projeta as mesmas aulas que a API', async () => {
    const { a, b, token } = await doisAparelhos('Grade offline');
    const g = montarGrade(a);
    a.repo.registrarExcecao({
      slotId: g.h1.id,
      date: '2026-09-22',
      type: 'room_change',
      room: 'B-305',
      note: null,
      startTime: null,
      endTime: null,
    });
    a.repo.registrarExcecao({
      slotId: g.h2.id,
      date: '2026-09-29',
      type: 'cancelled',
      room: null,
      note: 'feriado',
      startTime: null,
      endTime: null,
    });
    await sincronizar(a, b);

    const semana = await agendaApi(token, '2026-09-20', '2026-10-03');
    const local = [
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ].flatMap((d) => aulasDoDia(b.repo.grade(), d));
    expect(local).toEqual(semana);
    expect(semana.map((x) => [x.dia, x.disciplina, x.sala, x.salaTrocada, x.cancelada])).toEqual([
      ['2026-09-22', 'Sistemas Reconfiguráveis', 'B-305', true, false],
      ['2026-09-22', 'Compiladores', 'A-101', false, false],
      ['2026-09-29', 'Sistemas Reconfiguráveis', 'B-201', false, false],
      ['2026-09-29', 'Compiladores', 'A-101', false, true],
    ]);
  });

  it('horário 25:00 ou 9:5 é recusado pelo banco (e pelo app antes dele)', async () => {
    const { a, userId } = await doisAparelhos('HH:mm');
    const g = montarGrade(a);
    await sincronizar(a);
    for (const hora of ['25:00', '9:5', '24:00']) {
      await expect(
        ctx.dono.query(
          `insert into class_slots (id, user_id, course_id, weekday, start_time, end_time, created_at, updated_at)
           values ($1, $2, $3, 1, $4, '23:59', now(), now())`,
          [novoId(), userId, g.sr.id, hora],
        ),
      ).rejects.toThrow(/violates check constraint "class_slots_/);
    }
    expect(() =>
      a.repo.criarHorario({
        courseId: g.sr.id,
        weekday: 1,
        startTime: '9:5',
        endTime: '10:00',
        room: null,
      }),
    ).toThrow(/HH:mm/);
  });

  it('só um semestre ativo por vez; nenhuma ocorrência de aula é gravada', async () => {
    const { a, userId } = await doisAparelhos('Semestres');
    const velho = a.repo.criarSemestre({
      label: '2026.1',
      startDate: '2026-02-09',
      endDate: '2026-07-04',
    });
    const novo = a.repo.criarSemestre({
      label: '2026.2',
      startDate: '2026-08-03',
      endDate: '2026-12-12',
    });
    await sincronizar(a);
    const r = await ctx.dono.query(
      'select id, active from semesters where user_id = $1 order by label',
      [userId],
    );
    expect(r.rows).toEqual([
      { id: velho.id, active: false },
      { id: novo.id, active: true },
    ]);
    const oc = await ctx.dono.query(
      'select count(*)::int as n from item_occurrences where user_id = $1',
      [userId],
    );
    expect(oc.rows[0].n).toBe(0);
  });
});

describe('courseId em items (#57)', () => {
  it('o banco recusa ligar um item a disciplina de outra conta', async () => {
    const a = await doisAparelhos('Curso A');
    const b = await doisAparelhos('Curso B');
    const g = montarGrade(a.a);
    await sincronizar(a.a);
    const item = b.a.repo.criar(novoEvento('prova'));
    await sincronizar(b.a);
    await expect(
      ctx.dono.query('update items set course_id = $1 where id = $2', [g.sr.id, item.id]),
    ).rejects.toThrow(/items_course_fk/);
    // Pelo sync, o vínculo com disciplina inexistente nesta conta cai e o item entra.
    b.a.tempo(1000);
    b.a.repo.editar(item.id, { courseId: g.sr.id });
    await sincronizar(b.a);
    const r = await ctx.dono.query('select course_id from items where id = $1', [item.id]);
    expect(r.rows[0].course_id).toBeNull();
  });

  it('excluir a disciplina mantém a prova, sem vínculo, nos dois aparelhos', async () => {
    const { a, b } = await doisAparelhos('Excluir disciplina');
    const g = montarGrade(a);
    const prova = a.repo.criar({ ...novoEvento('Prova de SR'), courseId: g.sr.id });
    await sincronizar(a, b);
    expect(b.repo.obter(prova.id)!.courseId).toBe(g.sr.id);
    a.tempo(1000);
    a.repo.excluirDisciplina(g.sr.id);
    await sincronizar(a, b);
    for (const c of [a, b]) {
      expect(c.repo.obter(prova.id)).toMatchObject({ title: 'Prova de SR', courseId: null });
      expect(aulasDoDia(c.repo.grade(), '2026-09-22').map((x) => x.disciplina)).toEqual([
        'Compiladores',
      ]);
    }
  });

  it('purga física da disciplina anula só course_id (SET NULL de uma coluna)', async () => {
    const { a, userId } = await doisAparelhos('Purga disciplina');
    const g = montarGrade(a);
    const prova = a.repo.criar({ ...novoEvento('Prova'), courseId: g.comp.id });
    await sincronizar(a);
    await ctx.dono.query('delete from courses where id = $1', [g.comp.id]);
    const r = await ctx.dono.query('select user_id, course_id from items where id = $1', [
      prova.id,
    ]);
    expect(r.rows[0]).toEqual({ user_id: userId, course_id: null });
  });
});

describe('rotas da grade (#58)', () => {
  it('disciplina com dois horários e uma exceção pela API', async () => {
    const { token } = await doisAparelhos('Rotas');
    const sem = await api(token, 'POST', '/semesters', {
      label: '2026.2',
      startDate: '2026-08-03',
      endDate: '2026-12-12',
    });
    expect(sem.status).toBe(201);
    const c = await api(token, 'POST', '/courses', {
      semesterId: sem.corpo!.id,
      name: 'Redes',
      code: 'RED',
      color: '#4A7A3A',
      defaultRoom: 'C-1',
    });
    expect(c.status).toBe(201);
    const h1 = await api(token, 'POST', `/courses/${c.corpo!.id}/slots`, {
      weekday: 1,
      startTime: '08:00',
      endTime: '09:40',
    });
    await api(token, 'POST', `/courses/${c.corpo!.id}/slots`, {
      weekday: 3,
      startTime: '08:00',
      endTime: '09:40',
      room: 'LAB',
    });
    const ex = await api(token, 'POST', `/slots/${h1.corpo!.id}/exceptions`, {
      date: '2026-09-21',
      type: 'room_change',
      room: 'C-9',
    });
    expect(ex.status).toBe(201);

    const lista = await ctx.env.app.request(
      `/courses?semesterId=${sem.corpo!.id}`,
      comToken(token),
    );
    const cursos = (await lista.json()) as {
      name: string;
      horarios: { weekday: number; room: string | null }[];
    }[];
    expect(cursos).toEqual([
      expect.objectContaining({
        name: 'Redes',
        horarios: [
          expect.objectContaining({ weekday: 1, room: null }),
          expect.objectContaining({ weekday: 3, room: 'LAB' }),
        ],
      }),
    ]);
    const aulas = await agendaApi(token, '2026-09-21', '2026-09-23');
    expect(aulas.map((x) => [x.dia, x.sala])).toEqual([
      ['2026-09-21', 'C-9'],
      ['2026-09-23', 'LAB'],
    ]);
  });

  it('validação: horário inválido → 400; disciplina de semestre inexistente → 404; excluir → 204', async () => {
    const { token } = await doisAparelhos('Rotas inválidas');
    const sem = await api(token, 'POST', '/semesters', {
      label: 'x',
      startDate: '2026-08-03',
      endDate: '2026-12-12',
    });
    const c = await api(token, 'POST', '/courses', {
      semesterId: sem.corpo!.id,
      name: 'X',
      color: '#000000',
    });
    expect(
      (
        await api(token, 'POST', `/courses/${c.corpo!.id}/slots`, {
          weekday: 1,
          startTime: '25:00',
          endTime: '26:00',
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(token, 'POST', '/courses', { semesterId: novoId(), name: 'Y', color: '#000000' }))
        .status,
    ).toBe(404);
    expect((await api(token, 'DELETE', `/courses/${c.corpo!.id}`)).status).toBe(204);
    expect((await api(token, 'DELETE', `/courses/${c.corpo!.id}`)).status).toBe(404);
  });
});
