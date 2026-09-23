import { esquemaItem, type ItemWire, type RespostaPull, type RespostaPush } from '../item';
import { esquemaOcorrencia, type OcorrenciaWire } from '../ocorrencia';

/** Como o motor fala com o servidor: `fetch` no app, `app.request` nos testes. */
export interface Transporte {
  push(lote: { itens: ItemWire[]; ocorrencias: OcorrenciaWire[] }): Promise<RespostaPush>;
  pull(cursor: string | null): Promise<RespostaPull>;
}

export interface MetadadosSync {
  cursor: string | null;
  ultimaSync: number | null;
  retencaoDias: number | null;
}

export interface Linhas {
  itens: ItemWire[];
  ocorrencias: OcorrenciaWire[];
}

export interface Confirmacao {
  id: string;
  updatedAt: string;
}

/** O que o motor precisa do banco local. Implementado por `RepositorioLocal`. */
export interface ArmazemLocal {
  sujos(): Linhas;
  confirmar(enviados: { itens: Confirmacao[]; ocorrencias: Confirmacao[] }): void;
  aplicar(recebidos: Linhas): number;
  reconciliar(noServidor: { itens: string[]; ocorrencias: string[] }): number;
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
    // 1. Push — itens antes das ocorrências, que dependem deles.
    const invalidos: string[] = [];
    const sujos = this.armazem.sujos();
    const itens = sujos.itens.filter((i) => valido(esquemaItem, i, invalidos));
    const ocorrencias = sujos.ocorrencias.filter((o) => valido(esquemaOcorrencia, o, invalidos));
    const lotes: Linhas[] = [];
    for (let i = 0; i < itens.length; i += LOTE_PUSH) {
      lotes.push({ itens: itens.slice(i, i + LOTE_PUSH), ocorrencias: [] });
    }
    for (let i = 0; i < ocorrencias.length; i += LOTE_PUSH) {
      lotes.push({ itens: [], ocorrencias: ocorrencias.slice(i, i + LOTE_PUSH) });
    }
    for (const lote of lotes) {
      const r = await this.transporte.push(lote);
      // Ignorado também limpa: o servidor tem versão igual ou mais nova, que chega no pull.
      this.armazem.confirmar({
        itens: tratados(lote.itens, r.itens),
        ocorrencias: tratados(lote.ocorrencias, r.ocorrencias),
      });
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
      this.armazem.reconciliar({
        itens: resposta.itens.map((i) => i.id),
        ocorrencias: resposta.ocorrencias.map((o) => o.id),
      });
    }
    this.armazem.gravarMetadados({
      cursor: resposta.cursor,
      ultimaSync: agora,
      retencaoDias: resposta.retencaoDias,
    });

    // 3. Purga local dos tombstones já confirmados
    const purgados = this.armazem.purgar(new Date(agora - resposta.retencaoDias * DIA_MS));

    return {
      enviados: itens.length + ocorrencias.length,
      recebidos: resposta.itens.length + resposta.ocorrencias.length,
      aplicados,
      invalidos,
      completo,
      purgados,
    };
  }
}

function valido<T extends { id: string }>(
  esquema: { safeParse(v: unknown): { success: boolean } },
  linha: T,
  invalidos: string[],
): boolean {
  if (esquema.safeParse(linha).success) return true;
  invalidos.push(linha.id);
  return false;
}

function tratados(
  enviados: { id: string; updatedAt: string }[],
  r: { aplicados: string[]; ignorados: string[] },
): Confirmacao[] {
  const ok = new Set([...r.aplicados, ...r.ignorados]);
  return enviados.filter((l) => ok.has(l.id)).map((l) => ({ id: l.id, updatedAt: l.updatedAt }));
}
