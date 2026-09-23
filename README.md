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

🚧 **Em construção — F0 (Fundação) e F1 (Sincronização) implementadas.** API com PostgreSQL, RLS e
token por aparelho; app Expo com SQLite local, CRUD offline e sincronização push/pull com
last-write-wins. Os critérios de saída das duas fases (#14 e #25) ainda precisam ser executados no
aparelho real e no servidor doméstico. O plano está no [roadmap](docs/roadmap.md): dez fases, marco
de migração no fim da F4, v1 completa no fim da F8.

## Estrutura

```
compasso/
├── apps/
│   ├── api/                          # API Node (Hono + Drizzle + PostgreSQL)
│   └── mobile/                       # app Expo (development build) com SQLite local
├── packages/
│   └── core/                         # lógica pura compartilhada: IDs, invariantes, sync, datas
├── deploy/                           # units do systemd e exemplo do cloudflared
├── CLAUDE.md                         # instruções do Claude Code: quando continuar e quando parar
├── TASKS.md                          # checklist persistente para tarefas longas do Claude
├── .claude/commands/                 # comandos do projeto: /revisar-diff, /auditoria
└── docs/
    ├── especificacao-tecnica-v1.md   # o que vai ser construído: escopo, modelo de dados,
    │                                 # arquitetura, regras de gamificação e decisões
    ├── roadmap.md                    # em que ordem construir: fases, critérios de saída
    ├── desenvolvimento.md            # como rodar, testar e evoluir o schema
    ├── sincronizacao.md              # como a F1 implementou o protocolo da §6.6
    ├── deploy.md                     # deploy em quatro comandos, backup e restauração
    ├── guia-opus-5-5.md              # como pedir, revisar e usar comandos com o Opus 5.5
    └── adr/                          # decisões isoladas e datadas, com as alternativas
```

## Stack

- **Client**: React Native / Expo SDK 57 (development build), Expo Router, SQLite local via
  `expo-sqlite` + Drizzle (offline-first)
- **API**: Node.js 22, Hono, zod
- **Banco**: PostgreSQL com Drizzle, migrações versionadas e Row-Level Security
  ([ADR-0001](docs/adr/0001-postgresql-em-vez-de-mongodb.md), [ADR-0002](docs/adr/0002-ferramentas-e-convencoes-da-fundacao.md))
- **Infra**: servidor doméstico, exposto via Cloudflare Tunnel

## Começar

```sh
npm install
npm run lint && npm run typecheck && npm test   # os testes sobem um PostgreSQL descartável sozinhos
```

O resto — banco de desenvolvimento, conta, app no aparelho — está em
[`docs/desenvolvimento.md`](docs/desenvolvimento.md).

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

As decisões que foram revistas depois da especificação inicial vivem em
[`docs/adr/`](docs/adr/), uma por arquivo, com as alternativas descartadas e o motivo. Quando um ADR
e a especificação divergirem, o ADR é mais recente.

## Próximos passos

- Executar os critérios de saída da F0 e da F1 no aparelho e no servidor (#14, #25)
- Decidir o comportamento de fuso ao viajar (#26), que abre a F2
