# Compasso

Calendário principal + registrador de esforço, num único app. Compasso junta o compromisso que
você tem que cumprir e a tarefa pela qual você ganha pontos na mesma tela, disputando as mesmas
horas — porque um app de tarefa que ignora a agenda mente sobre o tempo disponível.

## O que é

- **Calendário primário**, não um complemento ao Google Calendar.
- **Camada de medição**: toda tarefa carrega uma estimativa de esforço declarada antes da execução,
  distribuída entre 5 atributos de vida — **Corpo, Mente, Ofício, Casa, Social**.
- **Camada econômica**: concluir tarefas gera moeda; a moeda compra recompensas reais cadastradas
  pelo próprio usuário.
- **Sem punição**: sem decaimento de atributo, sem streak, sem penalidade por atraso. A única
  consequência de não fazer algo é não ganhar nada por aquilo.

## Status

📋 **Fase de especificação.** Ainda não existe código — este repositório documenta o que vai ser
construído antes de começar a construir.

## Estrutura

```
compasso/
└── docs/
    └── especificacao-tecnica-v1.md   # especificação técnica completa (escopo, modelo de dados,
                                        # arquitetura, regras de gamificação, decisões e questões
                                        # em aberto)
```

## Stack prevista

- **Client**: React Native / Expo, SQLite local (offline-first)
- **API**: Node.js
- **Banco**: MongoDB (replica set, para transações)
- **Infra**: servidor doméstico, exposto via Cloudflare Tunnel

## Pilares de design

1. **Não-punitivo** — progresso medido por janela de 30 dias, não por streak.
2. **Moeda lastreada em esforço**, não em tempo.
3. **Radar de 5 atributos** como resposta visual a "estou negligenciando alguma área?".
4. Estética de fantasia medieval / D&D (tavernas, exploradores, cartógrafos) como camadas de
   apresentação sobre as mesmas regras.

## Onde ler primeiro

A especificação em [`docs/especificacao-tecnica-v1.md`](docs/especificacao-tecnica-v1.md) é a
fonte de verdade atual. Ela é dividida em seções normativas (marcadas `DECIDIDO`) e propostas
sujeitas a revisão (marcadas `PROPOSTA`), além de uma seção final de questões em aberto — vale
começar por ali para saber o que ainda está em jogo antes de qualquer decisão de código.

## Próximos passos

- Calibrar a curva de nível e a régua de esforço com uso real
- Confirmar offline-first como decisão de arquitetura definitiva
- Iniciar a implementação a partir da camada de dados (`items`, `xpEntries`, `coinEntries`)
