import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { VariaveisAutenticadas } from './auth';
import { planejarImportacao } from './ics';

/** Exportações do Google chegam a alguns MB; 20 MB cobre anos de agenda com folga. */
export const LIMITE_ICS_BYTES = 20 * 1024 * 1024;

/**
 * `POST /import/ics` (especificação §6.5): importação única, multipart, campo `arquivo`.
 * Tudo numa transação — em erro, nada é gravado. Responde o resumo.
 */
export function rotasDeImportacao() {
  const rotas = new Hono<{ Variables: VariaveisAutenticadas }>();

  rotas.post(
    '/ics',
    bodyLimit({
      maxSize: LIMITE_ICS_BYTES,
      onError: (c) =>
        c.json({ erro: `arquivo maior que ${LIMITE_ICS_BYTES / 1024 / 1024} MB` }, 413),
    }),
    async (c) => {
      const corpo = await c.req.parseBody().catch(() => null);
      const arquivo = corpo?.['arquivo'];
      if (!arquivo || typeof arquivo === 'string') {
        return c.json({ erro: 'envie o .ics no campo multipart "arquivo"' }, 400);
      }
      let plano;
      try {
        plano = planejarImportacao(await arquivo.text());
      } catch (e) {
        return c.json({ erro: (e as Error).message }, 400);
      }
      const resumo = await c.var.transacao((r) => r.importacao.aplicar(plano));
      return c.json(resumo);
    },
  );

  return rotas;
}
