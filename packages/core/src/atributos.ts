/** Os cinco atributos de vida, fixos e não editáveis (especificação §4.2). */
export const ATRIBUTOS = ['corpo', 'mente', 'oficio', 'casa', 'social'] as const;
export type Atributo = (typeof ATRIBUTOS)[number];

/** Escala fixa de esforço (especificação §4.1). Nenhum outro valor é aceito. */
export const ESFORCOS = [1, 2, 3, 5, 8] as const;
export type Esforco = (typeof ESFORCOS)[number];

export function ehEsforcoValido(valor: unknown): valor is Esforco {
  return typeof valor === 'number' && (ESFORCOS as readonly number[]).includes(valor);
}

export function ehAtributoValido(valor: unknown): valor is Atributo {
  return typeof valor === 'string' && (ATRIBUTOS as readonly string[]).includes(valor);
}
