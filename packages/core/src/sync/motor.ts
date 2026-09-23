import { esquemaItem, type ItemWire, type RespostaPull, type RespostaPush } from '../item';

/** Como o motor fala com o servidor: `fetch` no app, `app.request` nos testes. */
export interface Transporte {
  push(itens: ItemWire[]): Promise<RespostaPush>;
  pull(cursor: string | null): Promise<RespostaPull>;
}

export interface MetadadosSync {
  cursor: string | null;
  ultimaSync: number | null;
  retencaoDias: number | null;
}

/** O que o motor precisa do banco local. Implementado por `RepositorioLocal`. */
export interface ArmazemLocal {
  sujos(): ItemWire[];
  confirmar(enviados: { id: string; updatedAt: string }[]): void;
  aplicar(recebidos: ItemWire[]): number;
  reconciliar(idsNoServidor: string[]): number;
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
    // 1. Push
    const invalidos: string[] = [];
    const validos: ItemWire[] = [];
    for (const item of this.armazem.sujos()) {
      if (esquemaItem.safeParse(item).success) validos.push(item);
      else invalidos.push(item.id);
    }
    for (let i = 0; i < validos.length; i += LOTE_PUSH) {
      const lote = validos.slice(i, i + LOTE_PUSH);
      const r = await this.transporte.push(lote);
      // Ignorado também limpa: o servidor tem versão igual ou mais nova, que chega no pull.
      const tratados = new Set([...r.aplicados, ...r.ignorados]);
      this.armazem.confirmar(
        lote.filter((l) => tratados.has(l.id)).map((l) => ({ id: l.id, updatedAt: l.updatedAt })),
      );
    }

    // 2. Pull
    const meta = this.armazem.lerMetadados();
    const retencao = meta.retencaoDias ?? RETENCAO_PADRAO_DIAS;
    const agora = this.agora();
    const completo =
      meta.cursor === null ||
      (meta.ultimaSync !== null && agora - meta.ultimaSync > retencao * DIA_MS);

    const resposta = await this.transporte.pull(completo ? null : meta.cursor);
    const aplicados = this.armazem.aplicar(resposta.itens);
    if (completo && meta.cursor !== null) {
      this.armazem.reconciliar(resposta.itens.map((i) => i.id));
    }
    this.armazem.gravarMetadados({
      cursor: resposta.cursor,
      ultimaSync: agora,
      retencaoDias: resposta.retencaoDias,
    });

    // 3. Purga local dos tombstones já confirmados
    const purgados = this.armazem.purgar(new Date(agora - resposta.retencaoDias * DIA_MS));

    return {
      enviados: validos.length,
      recebidos: resposta.itens.length,
      aplicados,
      invalidos,
      completo,
      purgados,
    };
  }
}
