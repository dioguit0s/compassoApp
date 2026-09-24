/**
 * Limite de tentativas de senha, em memória (ADR-0008). Com menos de dez contas e uma instância
 * só da API, não vale uma tabela: reiniciar a API zera a contagem, o que só devolve ao atacante
 * as tentativas de uma janela.
 *
 * Duas instâncias em `app.ts`: uma por conta (e-mail ao entrar, userId ao trocar a senha), que
 * protege a senha de alguém; outra por IP, mais folgada, que pega quem troca de e-mail a cada
 * tentativa. O custo de CPU e memória de cada tentativa já tem teto em `senha.ts`.
 */
export class LimiteDeTentativas {
  private readonly falhas = new Map<string, number[]>();

  constructor(
    private readonly maximo = 5,
    private readonly janelaMs = 15 * 60 * 1000,
    private readonly agora: () => number = Date.now,
  ) {}

  private recentes(chave: string): number[] {
    const limite = this.agora() - this.janelaMs;
    const lista = (this.falhas.get(chave) ?? []).filter((t) => t > limite);
    if (lista.length) this.falhas.set(chave, lista);
    else this.falhas.delete(chave);
    return lista;
  }

  /** Segundos até poder tentar de novo; 0 = pode tentar agora. */
  bloqueadoPor(chave: string): number {
    const lista = this.recentes(chave);
    if (lista.length < this.maximo) return 0;
    return Math.ceil((lista[0]! + this.janelaMs - this.agora()) / 1000);
  }

  registrarFalha(chave: string): void {
    // Chaves só são limpas quando consultadas; e-mails inventados nunca voltam. Varre as vencidas
    // antes que o mapa cresça sem limite.
    if (this.falhas.size >= 1000) for (const k of [...this.falhas.keys()]) this.recentes(k);
    this.falhas.set(chave, [...this.recentes(chave), this.agora()]);
  }

  /** Para teste. */
  get tamanho(): number {
    return this.falhas.size;
  }

  limpar(chave: string): void {
    this.falhas.delete(chave);
  }
}
