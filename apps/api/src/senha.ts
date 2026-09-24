import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';

/**
 * Hash de senha com scrypt, da biblioteca padrão do Node — sem dependência nativa para compilar
 * no servidor doméstico (ADR-0008). Parâmetros da recomendação da OWASP para scrypt
 * (N=2^17, r=8, p=1): ~128 MB e algumas centenas de milissegundos por hash.
 *
 * Formato gravado: `scrypt$<log2 N>$<r>$<p>$<sal>$<hash>` (base64url). Os parâmetros vão junto,
 * então subir o custo depois não invalida as senhas já gravadas.
 */
const LOG_N = 17;
const R = 8;
const P = 1;
const TAMANHO = 32;

/**
 * No máximo dois hashes ao mesmo tempo, os outros esperam na fila. Sem isso, uma enxurrada em
 * `/auth/entrar` (com e-mails inventados, que o limite por e-mail não pega) ocuparia as 4 threads
 * do libuv com ~128 MB cada — e o mesmo pool atende leitura de arquivo (fotos de perfil).
 */
const MAX_SIMULTANEOS = 2;
let emAndamento = 0;
const fila: (() => void)[] = [];

async function comVaga<T>(fn: () => Promise<T>): Promise<T> {
  if (emAndamento >= MAX_SIMULTANEOS) await new Promise<void>((ok) => fila.push(ok));
  else emAndamento++;
  try {
    return await fn();
  } finally {
    // Passa a vaga direto para o próximo da fila; sem fila, libera.
    const proximo = fila.shift();
    if (proximo) proximo();
    else emAndamento--;
  }
}

function derivar(senha: string, sal: Buffer, logN: number, r: number, p: number) {
  const opcoes: ScryptOptions = { N: 2 ** logN, r, p, maxmem: 256 * 1024 * 1024 };
  return comVaga(
    () =>
      new Promise<Buffer>((ok, falha) =>
        scrypt(senha.normalize('NFC'), sal, TAMANHO, opcoes, (erro, chave) =>
          erro ? falha(erro) : ok(chave),
        ),
      ),
  );
}

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal, LOG_N, R, P);
  return ['scrypt', LOG_N, R, P, sal.toString('base64url'), chave.toString('base64url')].join('$');
}

export async function conferirSenha(senha: string, gravado: string): Promise<boolean> {
  const partes = gravado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [logN, r, p] = partes.slice(1, 4).map(Number) as [number, number, number];
  if (![logN, r, p].every(Number.isInteger) || logN < 10 || logN > 20) return false;
  const esperado = Buffer.from(partes[5]!, 'base64url');
  if (esperado.length !== TAMANHO) return false;
  const chave = await derivar(senha, Buffer.from(partes[4]!, 'base64url'), logN, r, p);
  return timingSafeEqual(chave, esperado);
}

/**
 * Hash de uma senha que ninguém tem. Entrar com e-mail desconhecido confere contra ele, para a
 * resposta levar o mesmo tempo de um e-mail cadastrado com senha errada.
 */
let hashFicticio: Promise<string> | undefined;
export function hashDeSenhaFicticio(): Promise<string> {
  hashFicticio ??= gerarHashDeSenha(randomBytes(16).toString('hex'));
  return hashFicticio;
}

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/**
 * E-mail normalizado (sem espaços, minúsculo) e validado. Um esquema só para a API e o script
 * `conta:acesso`: um e-mail aceito pelo script e recusado na entrada deixaria a conta sem acesso.
 */
export const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'e-mail inválido' }).max(254));

/** Senha temporária do script de administração: 16 caracteres sem ambíguos (0/O, 1/l/I). */
export function senhaTemporaria(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(16), (b) => alfabeto[b % alfabeto.length]).join('');
}
