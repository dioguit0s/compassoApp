/**
 * Lembretes de um item (especificação §5, ADR-0018): uma lista de "minutos antes", com até 5
 * valores, sem repetição, em ordem crescente — o mais próximo do compromisso primeiro.
 *
 * O campo antigo `reminderMinutesBefore` continua existindo e espelha o PRIMEIRO da lista, para
 * as versões do app que só conhecem um lembrete. Quem escreve é sempre `resolverLembretes`, no
 * aparelho e no servidor, para as duas colunas nunca divergirem.
 */

export const MAX_LEMBRETES = 5;
/** Um ano: o mesmo teto do campo antigo. */
export const MAX_MINUTOS_DE_LEMBRETE = 525_600;

/** Sem repetição e em ordem crescente. Não corta: passar de 5 é erro de validação, não ajuste. */
export function normalizarLembretes(lista: readonly number[]): number[] {
  return [...new Set(lista)].sort((a, b) => a - b);
}

interface ComLembretes {
  remindersMinutesBefore?: readonly number[] | null;
  reminderMinutesBefore: number | null;
}

/** A lista do item; quando ela não veio (versão antiga do app ou do servidor), o campo antigo. */
export function lembretesDoItem(i: ComLembretes): number[] {
  if (i.remindersMinutesBefore) return normalizarLembretes(i.remindersMinutesBefore);
  return i.reminderMinutesBefore === null ? [] : [i.reminderMinutesBefore];
}

/**
 * As duas colunas a gravar. Com a lista, ela manda e o campo antigo a espelha. Sem a lista (quem
 * escreveu só conhece o campo antigo): se ele continua igual ao primeiro lembrete já gravado, a
 * versão antiga não mexeu no lembrete e os lembretes extras ficam; se mudou, vale o valor novo.
 */
export function resolverLembretes(
  novo: ComLembretes,
  atuais?: readonly number[] | null,
): { remindersMinutesBefore: number[]; reminderMinutesBefore: number | null } {
  let lista: number[];
  if (novo.remindersMinutesBefore) lista = normalizarLembretes(novo.remindersMinutesBefore);
  else if (atuais && (atuais[0] ?? null) === novo.reminderMinutesBefore) lista = [...atuais];
  else lista = novo.reminderMinutesBefore === null ? [] : [novo.reminderMinutesBefore];
  return { remindersMinutesBefore: lista, reminderMinutesBefore: lista[0] ?? null };
}

/** "na hora", "10 min antes", "1 h antes", "1 h 30 antes", "2 dias antes". */
export function rotuloDoLembrete(minutos: number): string {
  if (minutos === 0) return 'na hora';
  if (minutos % 1440 === 0) {
    const d = minutos / 1440;
    return `${d} ${d === 1 ? 'dia' : 'dias'} antes`;
  }
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min antes`;
  return m === 0 ? `${h} h antes` : `${h} h ${String(m).padStart(2, '0')} antes`;
}
