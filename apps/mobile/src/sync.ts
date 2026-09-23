import {
  MotorDeSync,
  type RespostaPull,
  type RespostaPush,
  type ResultadoSync,
  type Transporte,
} from '@compasso/core';
import * as tabelasLocais from '@compasso/core/local';
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

const tabelas = [
  tabelasLocais.items,
  tabelasLocais.itemOccurrences,
  tabelasLocais.completions,
  tabelasLocais.xpEntries,
  tabelasLocais.coinEntries,
  tabelasLocais.semesters,
  tabelasLocais.courses,
  tabelasLocais.classSlots,
  tabelasLocais.classExceptions,
  tabelasLocais.rewards,
  tabelasLocais.redemptions,
  tabelasLocais.metadados,
  tabelasLocais.perfil,
];

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
  if (!(await lerConexao())) return publicar({ tipo: 'sem-conexao' });
  publicar(null);
  try {
    return publicar({ tipo: 'ok', resultado: await motor.sincronizar() });
  } catch (erro) {
    return publicar({ tipo: 'falhou', mensagem: (erro as Error).message });
  }
}

// ---- estado observável, para o indicador discreto das telas (issue #88) -----------------------

type Ouvinte = (e: EstadoSync | null) => void;
const ouvintes = new Set<Ouvinte>();
let ultimo: EstadoSync | null | undefined;

/** `null` = sincronizando agora. */
function publicar<T extends EstadoSync | null>(e: T): T {
  ultimo = e;
  for (const o of ouvintes) o(e);
  return e;
}

export function observarSync(o: Ouvinte): () => void {
  ouvintes.add(o);
  if (ultimo !== undefined) o(ultimo);
  return () => ouvintes.delete(o);
}

/** "Sair da conta": apaga todos os dados deste aparelho (o token é apagado à parte). */
export function apagarDadosLocais(): void {
  db.transaction((tx) => {
    for (const t of Object.values(tabelas)) tx.delete(t).run();
  });
}
