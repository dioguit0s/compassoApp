import type { z } from 'zod';

/** Códigos estáveis de erro da /api/v1 (ADR-0012). A Luna decide pelo código, nunca pelo texto. */
export type CodigoDeErro =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

/**
 * Erro da /api/v1. A `message` é curta e em português porque pode ser verbalizada; `field` aponta
 * o campo ou parâmetro culpado, quando há um.
 */
export class ErroV1 extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500,
    readonly codigo: CodigoDeErro,
    mensagem: string,
    readonly campo?: string,
    readonly cabecalhos: Record<string, string> = {},
  ) {
    super(mensagem);
  }

  corpo() {
    return {
      error: {
        code: this.codigo,
        message: this.message,
        ...(this.campo ? { field: this.campo } : {}),
      },
    };
  }
}

export const invalido = (mensagem: string, campo?: string) =>
  new ErroV1(400, 'validation_error', mensagem, campo);

/**
 * Mensagem de cada campo quando o valor não passa na validação. A do zod é em inglês e genérica;
 * esta diz o formato esperado, que é o que a Luna precisa para corrigir o pedido.
 */
const FORMATO: Record<string, string> = {
  title: 'o título precisa ter de 1 a 200 caracteres, em UTF-8 e numa linha só',
  start: 'start precisa ser data e hora com fuso, como 2026-09-26T14:00:00-03:00',
  end: 'end precisa ser data e hora com fuso, como 2026-09-26T15:00:00-03:00',
  duration_minutes: 'duration_minutes precisa ser um inteiro de 1 a 10080',
  all_day: 'all_day precisa ser true ou false',
  due: 'due precisa ser uma data (2026-09-26) ou data e hora com fuso',
  effort: 'effort precisa ser 1, 2, 3, 5 ou 8',
  attribute: 'attribute precisa ser corpo, mente, oficio, casa ou social',
  secondary_attribute: 'secondary_attribute precisa ser corpo, mente, oficio, casa ou social',
  occurrence_date: 'occurrence_date precisa ser uma data, como 2026-09-26',
  from: 'from precisa ser data e hora com fuso, como 2026-09-26T00:00:00-03:00',
  to: 'to precisa ser data e hora com fuso, como 2026-09-27T00:00:00-03:00',
  types: 'types aceita event, class e task, separados por vírgula',
  q: 'a busca precisa ter de 1 a 100 caracteres, em UTF-8',
  limit: 'limit precisa ser um inteiro de 1 a 200',
  cursor: 'cursor inválido: use o next_cursor da resposta anterior',
  done: 'done precisa ser true ou false',
};

/** Primeiro problema do zod → `validation_error` com campo e mensagem legível. */
export function erroDoZod(erro: z.ZodError): ErroV1 {
  const p = erro.issues[0];
  if (!p) return invalido('pedido inválido');
  if (p.code === 'unrecognized_keys') {
    const campo = p.keys[0]!;
    return invalido(`campo não suportado: ${campo}`, campo);
  }
  const campo = p.path.map(String).join('.') || undefined;
  if (!campo) return invalido('o corpo precisa ser um objeto JSON');
  if (p.code === 'invalid_type' && p.input === undefined) {
    return invalido(`${campo} é obrigatório`, campo);
  }
  return invalido(FORMATO[campo] ?? `${campo} inválido`, campo);
}
