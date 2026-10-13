/**
 * Observações do item (`notes`, especificação §5 e §7). O campo é texto puro, sem formatação:
 * estas funções só leem — a primeira linha para a prévia nas listas e no lembrete, e os trechos
 * que viram toque no modo leitura do detalhe (link, e-mail, telefone).
 */

/** Primeira linha com conteúdo, sem espaços nas pontas, cortada em `max` caracteres. */
export function primeiraLinhaDaNota(notas: string | null | undefined, max = 80): string | null {
  if (!notas) return null;
  const linha = notas
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find((l) => l.length > 0);
  if (!linha) return null;
  return linha.length > max ? `${linha.slice(0, max - 1).trimEnd()}…` : linha;
}

export type TrechoDaNota =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'link' | 'email' | 'telefone'; texto: string; alvo: string };

// Ordem das alternativas: link, e-mail, telefone. Um telefone dentro de um link é do link.
const PADRAO =
  /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+55[\s-]?)?(?:\(\d{2}\)\s?|\d{2}[\s-]?)?9?\d{4}[-\s]?\d{4})/gi;

/** Pontuação que fecha a frase, não o endereço: "veja em https://x.com/a." */
const FIM_DE_FRASE = /[.,;:!?)\]'"]+$/;

/**
 * Telefone brasileiro: com DDD (10 ou 11 dígitos, 12–13 com o +55) ou, sem DDD, só quando escrito
 * com hífen ("3333-4444") — oito dígitos soltos são mais vezes um protocolo que um telefone.
 */
function ehTelefone(trecho: string): boolean {
  const digitos = trecho.replace(/\D/g, '').length;
  return digitos >= 10 || (digitos >= 8 && trecho.includes('-'));
}

/** Quebra a nota em texto e trechos tocáveis, preservando tudo (inclusive as quebras de linha). */
export function trechosDaNota(notas: string): TrechoDaNota[] {
  const trechos: TrechoDaNota[] = [];
  let cursor = 0;
  const texto = (ate: number) => {
    if (ate > cursor) trechos.push({ tipo: 'texto', texto: notas.slice(cursor, ate) });
  };
  for (const m of notas.matchAll(PADRAO)) {
    const inicio = m.index;
    let achado = m[0];
    if (m[1]) {
      achado = achado.replace(FIM_DE_FRASE, '');
      if (achado.length < 5) continue;
      texto(inicio);
      trechos.push({
        tipo: 'link',
        texto: achado,
        alvo: /^https?:\/\//i.test(achado) ? achado : `https://${achado}`,
      });
    } else if (m[2]) {
      achado = achado.replace(/\.+$/, '');
      texto(inicio);
      trechos.push({ tipo: 'email', texto: achado, alvo: `mailto:${achado}` });
    } else {
      // Número colado em outro (um CPF, um código de barras) não é telefone.
      const antes = notas[inicio - 1] ?? '';
      const depois = notas[inicio + achado.length] ?? '';
      if (/\d/.test(antes) || /\d/.test(depois) || !ehTelefone(achado)) continue;
      texto(inicio);
      const digitos = achado.replace(/\D/g, '');
      trechos.push({
        tipo: 'telefone',
        texto: achado,
        alvo: `tel:${achado.trimStart().startsWith('+') ? '+' : ''}${digitos}`,
      });
    }
    cursor = inicio + achado.length;
  }
  texto(notas.length);
  return trechos;
}
