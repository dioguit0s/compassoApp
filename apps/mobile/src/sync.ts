import {
  MotorDeSync,
  type RespostaPull,
  type RespostaPush,
  type ResultadoSync,
  type Transporte,
} from '@compasso/core';
import { RepositorioLocal } from '@compasso/core/local';
import { db } from './db';
import { chamarApi, lerConexao } from './servidor';

/** Repositório local único do app. Toda escrita da UI passa por ele. */
export const repositorio = new RepositorioLocal(db);

const transporte: Transporte = {
  async push(itens) {
    const conexao = await lerConexao();
    if (!conexao) throw new Error('sem conexão configurada');
    return chamarApi<RespostaPush>(conexao, '/sync/push', {
      method: 'POST',
      body: JSON.stringify({ itens }),
    });
  },
  async pull(cursor) {
    const conexao = await lerConexao();
    if (!conexao) throw new Error('sem conexão configurada');
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return chamarApi<RespostaPull>(conexao, `/sync/pull${q}`);
  },
};

const motor = new MotorDeSync(repositorio, transporte);

export type EstadoSync =
  | { tipo: 'ok'; resultado: ResultadoSync }
  | { tipo: 'sem-conexao' }
  | { tipo: 'falhou'; mensagem: string };

/**
 * Dispara push → pull. Nunca lança: sem rede, o que não foi confirmado continua sujo e vai na
 * próxima oportunidade (abertura do app ou puxar-para-atualizar). Chamadas simultâneas
 * compartilham a mesma execução.
 */
export async function sincronizarAgora(): Promise<EstadoSync> {
  if (!(await lerConexao())) return { tipo: 'sem-conexao' };
  try {
    return { tipo: 'ok', resultado: await motor.sincronizar() };
  } catch (erro) {
    return { tipo: 'falhou', mensagem: (erro as Error).message };
  }
}
