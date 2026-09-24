import { randomBytes } from 'node:crypto';
import { hashDoToken } from './auth';

/**
 * Código de convite (F10, ADR-0008): 16 caracteres de um alfabeto sem ambíguos, em grupos de 4
 * (`K7QM-2XRA-…`), ~80 bits. Vai por mensagem para o amigo, que copia ou digita no app.
 * Só o hash fica no banco; a comparação é sobre a forma normalizada, então caixa, espaços e
 * hífens digitados de outro jeito não importam.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos: sem 0/O, 1/I

export function gerarCodigoDeConvite(): string {
  const simbolos = Array.from(randomBytes(16), (b) => ALFABETO[b % ALFABETO.length]).join('');
  return simbolos.match(/.{4}/g)!.join('-');
}

export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashDoConvite(codigo: string): string {
  return hashDoToken(normalizarCodigo(codigo));
}
