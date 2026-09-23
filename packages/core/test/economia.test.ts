import { describe, expect, it } from 'vitest';
import {
  alterarPreco,
  estadoDaRecompensa,
  instanteDeParede,
  normalizarPrecos,
  precoVigente,
  precosDaNova,
  proximaSegunda,
} from '../src';

// Setembro de 2026: dom 20, seg 21, ter 22, … dom 27, seg 28.
describe('carência até a segunda-feira seguinte (#78)', () => {
  it('próxima segunda: de domingo é amanhã; de segunda é a da outra semana', () => {
    expect(proximaSegunda('2026-09-20')).toBe('2026-09-21');
    expect(proximaSegunda('2026-09-21')).toBe('2026-09-28');
    expect(proximaSegunda('2026-09-23')).toBe('2026-09-28');
    expect(proximaSegunda('2026-09-26')).toBe('2026-09-28');
    expect(proximaSegunda('2026-12-29')).toBe('2027-01-04');
  });

  it('criar no domingo vale na segunda (amanhã); criar na segunda vale na outra', () => {
    const dom = precosDaNova(100, '2026-09-20');
    expect(precoVigente(dom, '2026-09-20')).toBeNull();
    expect(precoVigente(dom, '2026-09-21')).toBe(100);
    const seg = precosDaNova(100, '2026-09-21');
    expect(precoVigente(seg, '2026-09-27')).toBeNull();
    expect(precoVigente(seg, '2026-09-28')).toBe(100);
  });

  it('baixar o preço não vale até a segunda; subir também espera', () => {
    const r = precosDaNova(100, '2026-09-01'); // vale desde 07/09
    const baixou = alterarPreco(r, 20, '2026-09-23');
    expect(precoVigente(baixou, '2026-09-27')).toBe(100);
    expect(precoVigente(baixou, '2026-09-28')).toBe(20);
    const subiu = alterarPreco(r, 300, '2026-09-23');
    expect(precoVigente(subiu, '2026-09-27')).toBe(100);
    expect(precoVigente(subiu, '2026-09-28')).toBe(300);
  });

  it('duas alterações na mesma semana: vale a última, na mesma segunda', () => {
    const r = precosDaNova(100, '2026-09-01');
    const duas = alterarPreco(alterarPreco(r, 80, '2026-09-22'), 60, '2026-09-24');
    expect(duas).toMatchObject({ price: 100, pendingPrice: 60, pendingFrom: '2026-09-28' });
  });

  it('alterar ainda na carência da criação substitui o preço inicial', () => {
    const r = alterarPreco(precosDaNova(10, '2026-09-23'), 15, '2026-09-23');
    expect(r).toEqual({
      price: 15,
      priceEffectiveFrom: '2026-09-28',
      pendingPrice: null,
      pendingFrom: null,
    });
  });

  it('pendente que já venceu é promovido antes de uma nova alteração', () => {
    const r = alterarPreco(precosDaNova(100, '2026-09-01'), 80, '2026-09-22'); // 80 a partir de 28/09
    const depois = alterarPreco(r, 50, '2026-09-30');
    expect(depois).toMatchObject({
      price: 80,
      priceEffectiveFrom: '2026-09-28',
      pendingPrice: 50,
      pendingFrom: '2026-10-05',
    });
  });
});

describe('normalização no servidor (#78, anti-antecipação)', () => {
  it('recompensa nova com preço pendente não perde a alteração', () => {
    const recebido = {
      price: 10,
      priceEffectiveFrom: '2026-09-28',
      pendingPrice: 15,
      pendingFrom: '2026-09-28',
    };
    expect(normalizarPrecos(null, recebido, '2026-09-23')).toMatchObject({
      price: 15,
      pendingPrice: null,
    });
    const servidor = precosDaNova(10, '2026-09-23');
    const novo = alterarPreco(servidor, 15, '2026-09-24');
    expect(normalizarPrecos(servidor, novo, '2026-09-24')).toEqual({
      price: 15,
      priceEffectiveFrom: '2026-09-28',
      pendingPrice: null,
      pendingFrom: null,
    });
  });

  it('recompensa nova com vigência no passado é empurrada para a próxima segunda do servidor', () => {
    const r = normalizarPrecos(
      null,
      { price: 10, priceEffectiveFrom: '2026-01-01', pendingPrice: null, pendingFrom: null },
      '2026-09-23',
    );
    expect(r.priceEffectiveFrom).toBe('2026-09-28');
  });

  it('preço vigente alterado direto vira pendente', () => {
    const servidor = precosDaNova(100, '2026-09-01');
    const r = normalizarPrecos(servidor, { ...servidor, price: 5 }, '2026-09-23');
    expect(r).toMatchObject({ price: 100, pendingPrice: 5, pendingFrom: '2026-09-28' });
  });

  it('pendente com data antecipada é corrigido; alteração legítima passa', () => {
    const servidor = precosDaNova(100, '2026-09-01');
    const trapaca = normalizarPrecos(
      servidor,
      { ...servidor, pendingPrice: 5, pendingFrom: '2026-09-23' },
      '2026-09-23',
    );
    expect(trapaca.pendingFrom).toBe('2026-09-28');
    const legitimo = alterarPreco(servidor, 5, '2026-09-23');
    expect(normalizarPrecos(servidor, legitimo, '2026-09-23')).toEqual(legitimo);
  });
});

describe('estado da recompensa (#79, #80)', () => {
  const agora = instanteDeParede(2026, 9, 23, 12, 0);
  const r = { ...precosDaNova(50, '2026-09-01'), active: true, cooldownDays: 7 };

  it('disponível, sem saldo, cooldown, carência e arquivada', () => {
    expect(estadoDaRecompensa(r, 60, null, agora)).toEqual({ tipo: 'disponivel', preco: 50 });
    expect(estadoDaRecompensa(r, 20, null, agora)).toEqual({
      tipo: 'sem-saldo',
      preco: 50,
      faltam: 30,
    });
    expect(estadoDaRecompensa(r, 500, instanteDeParede(2026, 9, 20, 9, 0), agora)).toEqual({
      tipo: 'cooldown',
      preco: 50,
      disponivelEm: '2026-09-27',
    });
    expect(
      estadoDaRecompensa(
        { ...precosDaNova(50, '2026-09-23'), active: true, cooldownDays: 0 },
        500,
        null,
        agora,
      ),
    ).toEqual({ tipo: 'carencia', disponivelEm: '2026-09-28' });
    expect(estadoDaRecompensa({ ...r, active: false }, 500, null, agora)).toEqual({
      tipo: 'arquivada',
    });
  });

  it('cooldown vale mesmo com saldo sobrando; saldo negativo não resgata', () => {
    expect(estadoDaRecompensa(r, 10_000, instanteDeParede(2026, 9, 22, 9, 0), agora).tipo).toBe(
      'cooldown',
    );
    expect(estadoDaRecompensa(r, -5, null, agora)).toEqual({
      tipo: 'sem-saldo',
      preco: 50,
      faltam: 55,
    });
  });
});
