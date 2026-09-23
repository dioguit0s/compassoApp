/** "1 moeda", "0 moedas", "-1 moeda": singular só quando o valor absoluto é 1. */
export function quantas(n: number, singular: string, plural: string): string {
  return `${n} ${Math.abs(n) === 1 ? singular : plural}`;
}

export const moedas = (n: number) => quantas(n, 'moeda', 'moedas');
