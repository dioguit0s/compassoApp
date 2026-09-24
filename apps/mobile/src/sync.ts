import {
  MotorDeSync,
  type RespostaPull,
  type RespostaPush,
  type ResultadoSync,
  type Transporte,
} from '@compasso/core';
import { sql } from 'drizzle-orm';
import * as tabelasLocais from '@compasso/core/local';
import { RepositorioLocal } from '@compasso/core/local';
import { db } from './db';
import { chamarApi, ErroHttp, lerConexao, lerUrl } from './servidor';

/** Repositório local único do app. Toda escrita da UI passa por ele. */
export const repositorio = new RepositorioLocal(db);

const transporte: Transporte = {
  async push(lote) {
    const conexao = await lerConexao();
    if (!conexao) throw new Error('sem conexão configurada');
    // O corpo é o lote inteiro (esquemaPush): { semestres, disciplinas, …, itens, ocorrencias }.
    return chamarApi<RespostaPush>(conexao, '/sync/push', {
      method: 'POST',
      body: JSON.stringify(lote),
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
  // Há servidor, mas não há token: o servidor recusou a sessão (401) e é preciso entrar de novo.
  | { tipo: 'sessao-encerrada' }
  // semRede: não houve resposta (offline, servidor fora). Com resposta de erro (HTTP 4xx/5xx) é
  // outra coisa: o indicador não pode dizer "sem rede" quando o servidor recusou o envio.
  | { tipo: 'falhou'; mensagem: string; semRede: boolean };

/**
 * Dispara push → pull. Nunca lança: sem rede, o que não foi confirmado continua sujo e vai na
 * próxima oportunidade (abertura do app ou puxar-para-atualizar). Chamadas simultâneas
 * compartilham a mesma execução.
 */
export async function sincronizarAgora(): Promise<EstadoSync> {
  if (!(await lerConexao())) {
    return publicar({ tipo: (await lerUrl()) ? 'sessao-encerrada' : 'sem-conexao' });
  }
  publicar(null);
  try {
    return publicar({ tipo: 'ok', resultado: await motor.sincronizar() });
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 401) {
      return publicar({ tipo: 'sessao-encerrada' });
    }
    return publicar({
      tipo: 'falhou',
      mensagem: (erro as Error).message,
      semRede: !(erro instanceof ErroHttp),
    });
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
    // Com WHERE, o SQLite não usa a otimização de truncate — que pula o update hook — e as
    // consultas vivas e o observador de lembretes ficam sabendo da remoção.
    for (const t of Object.values(tabelas))
      tx.delete(t)
        .where(sql`1`)
        .run();
  });
}
