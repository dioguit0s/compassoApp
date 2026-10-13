import { describe, expect, it } from 'vitest';
import { primeiraLinhaDaNota, trechosDaNota } from '../src';

describe('primeiraLinhaDaNota', () => {
  it.each([
    [null, null],
    ['', null],
    ['   \n \n', null],
    ['Levar exames', 'Levar exames'],
    ['\n\n  Levar   exames  \nRua A, 10', 'Levar exames'],
    ['Linha 1\r\nLinha 2', 'Linha 1'],
  ])('%j → %j', (nota, esperado) => expect(primeiraLinhaDaNota(nota)).toBe(esperado));

  it('corta a linha longa com reticências', () => {
    const r = primeiraLinhaDaNota('a'.repeat(200), 20)!;
    expect(r).toHaveLength(20);
    expect(r.endsWith('…')).toBe(true);
  });
});

describe('trechosDaNota', () => {
  const tocaveis = (nota: string) =>
    trechosDaNota(nota)
      .filter((t) => t.tipo !== 'texto')
      .map((t) => [t.tipo, t.texto, 'alvo' in t ? t.alvo : null]);

  it('texto sem nada tocável volta inteiro', () => {
    expect(trechosDaNota('Levar exames\ne o cartão')).toEqual([
      { tipo: 'texto', texto: 'Levar exames\ne o cartão' },
    ]);
    expect(trechosDaNota('')).toEqual([]);
  });

  it('preserva o texto original, pedaço por pedaço', () => {
    const nota =
      'Reunião: https://meet.example.com/abc-defg.\nDúvidas: (11) 91234-5678 ou ana@ex.com';
    expect(
      trechosDaNota(nota)
        .map((t) => t.texto)
        .join(''),
    ).toBe(nota);
  });

  it('link: com e sem protocolo, sem a pontuação do fim da frase', () => {
    expect(tocaveis('Entre em https://meet.example.com/abc?x=1, às 10h.')).toEqual([
      ['link', 'https://meet.example.com/abc?x=1', 'https://meet.example.com/abc?x=1'],
    ]);
    expect(tocaveis('(veja www.clinica.com.br)')).toEqual([
      ['link', 'www.clinica.com.br', 'https://www.clinica.com.br'],
    ]);
  });

  it('e-mail vira mailto', () => {
    expect(tocaveis('Enviar para secretaria@ufabc.edu.br.')).toEqual([
      ['email', 'secretaria@ufabc.edu.br', 'mailto:secretaria@ufabc.edu.br'],
    ]);
  });

  it.each([
    ['(11) 91234-5678', 'tel:11912345678'],
    ['(11) 3333-4444', 'tel:1133334444'],
    ['11 91234-5678', 'tel:11912345678'],
    ['11912345678', 'tel:11912345678'],
    ['+55 11 91234-5678', 'tel:+5511912345678'],
    ['3333-4444', 'tel:33334444'],
  ])('telefone %s', (numero, alvo) => {
    expect(tocaveis(`Ligar para ${numero} antes.`)).toEqual([['telefone', numero, alvo]]);
  });

  it.each([
    'Protocolo 12345678',
    'Sala 204, bloco B',
    'Dia 2026-10-12 às 14:30',
    'CPF 123.456.789-09',
    'Boleto 23793381286000000012345678901234',
    'R$ 1234,50',
  ])('não inventa telefone em "%s"', (nota) => expect(tocaveis(nota)).toEqual([]));

  it('número dentro do link pertence ao link', () => {
    expect(tocaveis('https://wa.me/5511912345678')).toEqual([
      ['link', 'https://wa.me/5511912345678', 'https://wa.me/5511912345678'],
    ]);
  });
});
