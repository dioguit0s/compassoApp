import { Hono } from 'hono';
import { z } from 'zod';
import type { VariaveisAutenticadas } from './auth';
import { ErroDeGrade, ErroDeOcorrencia, ErroDeResgate } from './db/repositorios';
import { alterarPreco, diaDe, novoId, precosDaNova, promover } from '@compasso/core';

const uuid = z.uuid();

/** Rotas da economia (especificação §6.3, ADR-0007). */
export function rotasDaEconomia() {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();
  rotas.onError((erro, c) => {
    if (erro instanceof ErroDeResgate)
      return c.json({ erro: erro.message, estado: erro.estado }, 409);
    if (erro instanceof ErroDeOcorrencia || erro instanceof ErroDeGrade) {
      return c.json({ erro: erro.message }, erro.status);
    }
    throw erro;
  });

  rotas.get('/rewards', async (c) =>
    c.json(
      await c.var.transacao(async (r) => {
        const hoje = diaDe(new Date());
        const lista = (await r.grade.alteradosDesde('recompensas', null)).filter(
          (x) => !x.deletedAt,
        );
        return lista.map((x) => ({ ...x, ...promover(x as never, hoje) }));
      }),
    ),
  );

  // Criar: o preço só vale a partir da próxima segunda-feira (carência).
  rotas.post('/rewards', async (c) => {
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const preco = Number(b.price);
    const dados = {
      name: b.name,
      cooldownDays: b.cooldownDays ?? 0,
      active: true,
      ...precosDaNova(preco, diaDe(new Date())),
    };
    return c.json(await c.var.transacao((r) => r.grade.criar('recompensas', dados)), 201);
  });

  // Alterar preço grava pendingPrice/pendingFrom; nome, cooldown e ativo mudam na hora.
  rotas.patch('/rewards/:id', async (c) => {
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    return c.json(
      await c.var.transacao(async (r) => {
        const atual = await r.grade.obter('recompensas', c.req.param('id'));
        if (!atual) throw new ErroDeGrade(404, 'recompensa não encontrada');
        const hoje = diaDe(new Date());
        const precos =
          b.price !== undefined
            ? alterarPreco(atual as never, Number(b.price), hoje)
            : promover(atual as never, hoje);
        const m: Record<string, unknown> = { ...precos };
        for (const k of ['name', 'cooldownDays', 'active']) if (k in b) m[k] = b[k];
        return r.grade.editar('recompensas', c.req.param('id'), m);
      }),
    );
  });

  rotas.post('/rewards/:id/redeem', async (c) => {
    const chave = c.req.header('idempotency-key') ?? novoId();
    if (!uuid.safeParse(chave).success)
      return c.json({ erro: 'Idempotency-Key precisa ser um UUID' }, 400);
    return c.json(await c.var.transacao((r) => r.economia.resgatar(c.req.param('id'), chave)), 201);
  });

  rotas.get('/redemptions', async (c) =>
    c.json(await c.var.transacao((r) => r.economia.resgates())),
  );

  return rotas;
}
