/**
 * Paleta de cores de destaque para o avatar de iniciais (especificação §5 users, §7 Perfil).
 * Toda cor tem contraste de pelo menos 4,5:1 com texto branco (WCAG AA), conferido em teste.
 */
export const PALETA_DESTAQUE = [
  '#8C4A2F',
  '#2F6B8C',
  '#4A7A3A',
  '#7A3A6B',
  '#76682A',
  '#3A4A8C',
  '#277566',
  '#8C2F4A',
  '#5A5A5A',
  '#6B4A2F',
] as const;

/** Cor derivada do nome: o mesmo nome sempre dá a mesma cor, em qualquer aparelho. */
export function corDerivadaDoNome(nome: string): string {
  let h = 0;
  for (const ch of nome.trim().toLocaleLowerCase('pt-BR')) {
    h = (Math.imul(h, 31) + ch.codePointAt(0)!) >>> 0;
  }
  return PALETA_DESTAQUE[h % PALETA_DESTAQUE.length]!;
}

/** Até duas iniciais: primeira letra do primeiro e do último nome. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = [...partes[0]!][0]!;
  const ultima = partes.length > 1 ? [...partes[partes.length - 1]!][0]! : '';
  return (primeira + ultima).toLocaleUpperCase('pt-BR');
}

/** Razão de contraste WCAG entre duas cores `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const luminancia = (h: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
