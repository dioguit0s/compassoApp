import { z } from 'zod';

/**
 * Desvio de uma ocorrência de série (especificação §5, itemOccurrences). Só vira linha quando
 * a ocorrência desvia da regra. A identidade é `(itemId, occurrenceDate)` — a data ORIGINAL
 * segundo a regra, mesmo quando a ocorrência foi movida. O `id` existe para o sync, mas dois
 * aparelhos que criem offline um desvio para a mesma data convergem pela identidade (ADR-0004).
 *
 * Os campos são independentes e se somam: `startAt`/`endAt` preenchidos = movida; overrides
 * preenchidos = editada; `status = done` = concluída; `type = cancelled` = cancelada (esconde a
 * ocorrência, o resto é ignorado). `type` registra o último tipo de desvio aplicado.
 */
const dataIso = z.iso.datetime({ offset: true });

export const TIPOS_OCORRENCIA = ['completed', 'cancelled', 'moved', 'edited'] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

export const esquemaOcorrencia = z
  .object({
    id: z.uuid(),
    itemId: z.uuid(),
    occurrenceDate: z.iso.date(),
    type: z.enum(TIPOS_OCORRENCIA),
    status: z.enum(['open', 'done']),
    completedAt: dataIso.nullable(),
    startAt: dataIso.nullable(),
    endAt: dataIso.nullable(),
    titleOverride: z.string().trim().min(1).max(500).nullable(),
    notesOverride: z.string().max(20_000).nullable(),
    deletedAt: dataIso.nullable(),
    createdAt: dataIso,
    updatedAt: dataIso,
  })
  .superRefine((o, ctx) => {
    for (const motivo of violacoesDeOcorrencia(o))
      ctx.addIssue({ code: 'custom', message: motivo });
  });

export type OcorrenciaWire = z.infer<typeof esquemaOcorrencia>;

/** Espelha os CHECKs de `item_occurrences` no PostgreSQL. */
export function violacoesDeOcorrencia(o: {
  status: 'open' | 'done';
  completedAt: unknown;
  startAt: unknown;
  endAt: unknown;
}): string[] {
  const v: string[] = [];
  const presente = (x: unknown) => x !== null && x !== undefined;
  if ((o.status === 'done') !== presente(o.completedAt)) {
    v.push('ocorrência concluída exige data de conclusão, e só ela');
  }
  if (presente(o.endAt) && !presente(o.startAt)) v.push('fim sem início na ocorrência movida');
  if (
    presente(o.startAt) &&
    presente(o.endAt) &&
    new Date(o.endAt as string).getTime() < new Date(o.startAt as string).getTime()
  ) {
    v.push('fim antes do início na ocorrência movida');
  }
  return v;
}
