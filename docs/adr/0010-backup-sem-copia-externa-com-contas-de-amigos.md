# ADR-0010: Backup sem cópia externa, mesmo com contas de amigos

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (registro)

## Contexto

A §6.7 da [especificação](../especificacao-tecnica-v1.md) dispensou a cópia fora da máquina
enquanto o Compasso tivesse uma conta só, e avisou que isso mudaria com os amigos: o dado passa a
ser de quem não escolheu esse nível de risco. O [roadmap](../roadmap.md) listava na F10 o "backup
fora da máquina" como deixando de ser opcional.

## Decisão

**Não haverá cópia fora do servidor doméstico.** Continua o dump diário local (`scripts/backup.sh`,
sete dias retidos) no próprio servidor. Decisão do autor em 2026-09-23.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Cópia criptografada num armazenamento de objetos (B2, R2) | Serviço externo e credencial para manter; recusada pelo autor |
| Cópia para outro disco ou máquina da casa | Recusada pelo autor nesta fase |

## Consequências

- O risco aceito é o da §6.7: perda ou corrupção do servidor inteiro. As outras duas camadas
  continuam — lixeira de 30 dias e cópia completa em cada aparelho (offline-first). Um amigo que
  perca o servidor ainda tem os dados no próprio celular, desde que não tenha saído da conta.
- Quem recebe um convite deveria saber disso. O texto do convite é do administrador; a
  especificação registra o risco.
- Reabrir a questão é barato: `backup.sh` já gera o arquivo, falta só copiá-lo para fora.
