import {
  ESQUEMAS_SYNC,
  linhasVazias,
  TABELAS_SYNC,
  type LinhasSync,
  type RespostaPull,
  type RespostaPush,
  type TabelaSync,
} from '../item';

/** Como o motor fala com o servidor: `fetch` no app, `app.request` nos testes. */
export interface Transporte {
  push(lote: LinhasSync): Promise<RespostaPush>;
  pull(cursor: string | null): Promise<RespostaPull>;
}

export interface MetadadosSync {
  cursor: string | null;
  ultimaSync: number | null;
  retencaoDias: number | null;
}

export type Linhas = LinhasSync;

export interface Confirmacao {
  id: string;
  updatedAt: string;
}

export type Confirmacoes = Record<TabelaSync, Confirmacao[]>;

/** O que o motor precisa do banco local. Implementado por `RepositorioLocal`. */
export interface ArmazemLocal {
  sujos(): Linhas;
  confirmar(enviados: Confirmacoes): void;
  aplicar(recebidos: Linhas): number;
  reconciliar(noServidor: Record<TabelaSync, string[]>): number;
  purgar(limite: Date): number;
  lerMetadados(): MetadadosSync;
  gravarMetadados(m: { cursor: string; ultimaSync: number; retencaoDias: number }): void;
}

export interface ResultadoSync {
  enviados: number;
  recebidos: number;
  aplicados: number;
  /** Linhas sujas que não passaram na validação e ficaram de fora do push. */
  invalidos: string[];
  completo: boolean;
  purgados: number;
}

const DIA_MS = 86_400_000;
const LOTE_PUSH = 500;
/** Usado só antes do primeiro pull, quando o servidor ainda não informou a retenção. */
export const RETENCAO_PADRAO_DIAS = 30;

/**
 * Motor de sincronização (especificação §6.6): push das linhas sujas, depois pull desde o cursor.
 *
 * - Nunca roda duas vezes ao mesmo tempo: uma chamada durante outra recebe a mesma promessa.
 * - Falha de rede no meio não perde nada: o que não foi confirmado continua sujo, e o cursor só
 *   avança depois de o pull ser aplicado.
 * - Ausência maior que a retenção: o servidor já pode ter purgado tombstones que este aparelho
 *   nunca viu. O pull vira completo (sem cursor) e as linhas limpas que o servidor não tem mais
 *   saem daqui também, em vez de ficarem como fantasmas.
 */
export class MotorDeSync {
  private emAndamento: Promise<ResultadoSync> | null = null;

  constructor(
    private readonly armazem: ArmazemLocal,
    private readonly transporte: Transporte,
    private readonly agora: () => number = Date.now,
  ) {}

  sincronizar(): Promise<ResultadoSync> {
    if (!this.emAndamento) {
      this.emAndamento = this.rodar().finally(() => {
        this.emAndamento = null;
      });
    }
    return this.emAndamento;
  }

  private async rodar(): Promise<ResultadoSync> {
    // 1. Push — cada tabela depois das que ela referencia (TABELAS_SYNC já está nessa ordem).
    const invalidos: string[] = [];
    const sujos = this.armazem.sujos();
    let enviados = 0;
    for (const tabela of TABELAS_SYNC) {
      const esquema = ESQUEMAS_SYNC[tabela];
      const validas = (sujos[tabela] as { id: string; updatedAt: string }[]).filter((l) => {
        if (esquema.safeParse(l).success) return true;
        invalidos.push(l.id);
        return false;
      });
      enviados += validas.length;
      for (let i = 0; i < validas.length; i += LOTE_PUSH) {
        const fatia = validas.slice(i, i + LOTE_PUSH);
        const lote = linhasVazias();
        (lote[tabela] as unknown[]) = fatia;
        const r = await this.transporte.push(lote);
        // Ignorado também limpa: o servidor tem versão igual ou mais nova, que chega no pull.
        const confirmacoes = Object.fromEntries(
          TABELAS_SYNC.map((t) => [t, []]),
        ) as unknown as Confirmacoes;
        confirmacoes[tabela] = tratados(fatia, r[tabela]);
        this.armazem.confirmar(confirmacoes);
      }
    }

    // 2. Pull
    const meta = this.armazem.lerMetadados();
    const retencao = meta.retencaoDias ?? RETENCAO_PADRAO_DIAS;
    const agora = this.agora();
    const completo =
      meta.cursor === null ||
      (meta.ultimaSync !== null && agora - meta.ultimaSync > retencao * DIA_MS);

    const resposta = await this.transporte.pull(completo ? null : meta.cursor);
    const aplicados = this.armazem.aplicar(resposta);
    if (completo && meta.cursor !== null) {
      this.armazem.reconciliar(
        Object.fromEntries(
          TABELAS_SYNC.map((t) => [t, (resposta[t] as { id: string }[]).map((l) => l.id)]),
        ) as Record<TabelaSync, string[]>,
      );
    }
    this.armazem.gravarMetadados({
      cursor: resposta.cursor,
      ultimaSync: agora,
      retencaoDias: resposta.retencaoDias,
    });

    // 3. Purga local dos tombstones já confirmados
    const purgados = this.armazem.purgar(new Date(agora - resposta.retencaoDias * DIA_MS));

    return {
      enviados,
      recebidos: TABELAS_SYNC.reduce((n, t) => n + resposta[t].length, 0),
      aplicados,
      invalidos,
      completo,
      purgados,
    };
  }
}

function tratados(
  enviados: { id: string; updatedAt: string }[],
  r: { aplicados: string[]; ignorados: string[] },
): Confirmacao[] {
  const ok = new Set([...r.aplicados, ...r.ignorados]);
  return enviados.filter((l) => ok.has(l.id)).map((l) => ({ id: l.id, updatedAt: l.updatedAt }));
}
