/** Paleta de cores de destaque para o avatar de iniciais (especificação §5 users, §7 Perfil). */
export const PALETA_DESTAQUE = [
  '#8C4A2F',
  '#2F6B8C',
  '#4A7A3A',
  '#7A3A6B',
  '#8C7A2F',
  '#3A4A8C',
  '#2F8C7A',
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
