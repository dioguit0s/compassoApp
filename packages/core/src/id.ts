/**
 * UUIDv7 (RFC 9562), gerado no client. Implementação própria em vez de biblioteca porque:
 * - o core não pode depender de Node nem de React Native, e bibliotecas de UUID costumam
 *   buscar `crypto.getRandomValues` global — que o Hermes não tem sem polyfill;
 * - o algoritmo cabe em poucas linhas e o formato é decidido uma vez só.
 *
 * A fonte de aleatoriedade é injetada por quem roda o core: `expo-crypto` no app,
 * `globalThis.crypto` no Node. `Math.random` nunca é usado.
 *
 * Monotonicidade (RFC 9562 §6.2, método 1): dentro do mesmo milissegundo, os 12 bits de
 * `rand_a` funcionam como contador, então IDs gerados em sequência saem em ordem.
 */

export type FonteAleatoria = (bytes: Uint8Array) => void;

let fonte: FonteAleatoria | null = null;
let ultimoMs = -1;
let contador = 0;

export function configurarAleatoriedade(nova: FonteAleatoria): void {
  fonte = nova;
}

function preencherAleatorio(bytes: Uint8Array): void {
  if (fonte) {
    fonte(bytes);
    return;
  }
  const cripto = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => void } }).crypto;
  if (cripto?.getRandomValues) {
    cripto.getRandomValues(bytes);
    return;
  }
  throw new Error(
    'Nenhuma fonte de aleatoriedade configurada: chame configurarAleatoriedade() na inicialização.',
  );
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Gera um UUIDv7 a partir de um instante em ms. Exportado para testes. */
export function uuidv7(agoraMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  preencherAleatorio(bytes);

  let ms = agoraMs;
  if (ms <= ultimoMs) {
    // Mesmo milissegundo (ou relógio que voltou): incrementa o contador sobre o último instante.
    ms = ultimoMs;
    contador += 1;
    if (contador > 0xfff) {
      ms += 1;
      contador = 0;
    }
  } else {
    // Contador reinicia com semente aleatória na metade inferior, deixando folga para incrementos.
    contador = ((bytes[6]! & 0x07) << 8) | bytes[7]!;
  }
  ultimoMs = ms;

  // 48 bits de timestamp big-endian. Divisão em vez de shift: shift em JS é 32 bits.
  const alto = Math.floor(ms / 0x100000000);
  const baixo = ms >>> 0;
  bytes[0] = (alto >>> 8) & 0xff;
  bytes[1] = alto & 0xff;
  bytes[2] = (baixo >>> 24) & 0xff;
  bytes[3] = (baixo >>> 16) & 0xff;
  bytes[4] = (baixo >>> 8) & 0xff;
  bytes[5] = baixo & 0xff;
  // versão 7 + 12 bits de contador
  bytes[6] = 0x70 | ((contador >>> 8) & 0x0f);
  bytes[7] = contador & 0xff;
  // variante 10xx
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  let s = '';
  for (let i = 0; i < 16; i++) {
    s += HEX[bytes[i]!];
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-';
  }
  return s;
}

/** Identificador definitivo de qualquer linha criada pelo Compasso. */
export function novoId(): string {
  return uuidv7();
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && REGEX_UUID.test(valor);
}
