# Compasso — inventário de telas para redesign

Levantamento do app mobile (`apps/mobile`, F0–F8 e F10), atualizado com o redesign "Compasso em
códice" (seção 2). As seções 4 e 5 descrevem o comportamento; o visual segue a seção 2.
Serve de briefing para redesenhar a interface: o que cada tela mostra, o que dá para fazer nela,
os estados que precisa cobrir e as regras de produto que o design **não pode** quebrar.

App React Native / Expo, só celular, offline-first, em português, todo horário em hora de São Paulo.

---

## 1. Regras de produto que o visual precisa preservar

Estas vêm da especificação (§4 e §7) e são o motivo de várias escolhas atuais:

1. **Compromisso × pontuável.** Item sem esforço (compromisso: "algo que acontece com você") é
   **contorno**. Item com esforço ("algo que você faz") é **preenchido**. Essa distinção aparece em
   todo lugar onde um item é desenhado.
2. **Aula não é tarefa.** Aulas nunca têm caixa de marcar e ficam visualmente separadas dos itens.
3. **Sem punição.** Item pontuável que passou sem ser concluído é "não cumprido": tracejado, cinza,
   **nunca vermelho de erro**. Adiar mostra um contador neutro ("adiada 2 vezes"), sem julgamento.
4. **Captura em menos de 3 segundos.** O botão `+` é acessível de qualquer aba, a um toque.
5. **Séries sempre perguntam o alcance** ao editar/excluir: "só esta" ou "esta e as futuras".
6. **Offline é normal, não erro.** Indicadores de "sem rede" são informativos, discretos.
7. **Quatro abas, não cinco.** Semestre fica no cabeçalho do Calendário; configurações ficam no Perfil.
8. **Não existe nível global**, só nível por atributo.

## 2. Design system — "Compasso em códice" (redesign, `feat/redesign`)

Implementado a partir do projeto do Claude Design "Compasso - Telas RPG". Pergaminho, tinta,
capitulares em Cinzel e dourado com avareza. **Tema único**: o tema escuro saiu (temas estão fora do
escopo, especificação §3); `app.json` fixa `userInterfaceStyle: light`.

### Tipografia (`src/ui/Texto.tsx`)

- **Cinzel** (400–700): títulos, capitulares dos rótulos ("ESFORÇO", "QUANDO"), números (horas,
  esforço, preços, saldo), abas.
- **Archivo** (400–700 e itálico): texto corrido, campos, listas.
- Carregadas com `expo-font` em `app/_layout.tsx`. `Texto`/`Entrada` trocam `fontWeight` pela
  família do peso (no Android fonte própria não tem negrito sintético confiável).

### Cores (`src/tema.ts`)

| Grupo | Tokens principais |
|---|---|
| Superfícies | `fundo #EFE3CC`, `cabecalho #E7D8BB`, `faixa #E9DCC2`, `folha #F3E7CC` (modais), `cartao #F7EEDC`, `campo #FBF4E4`, `painel #EBDFC0` |
| Linhas | `borda #CDBB98`, `bordaCampo #C9B693`, `linha #D6C6A8`, `divisoria #DFD0B3`, `grade #E0D0B2` |
| Tinta | `texto #241C12` → `texto2/3`, `sutil #6B5B45`, `rotulo #7A6647`, `apagado #8C7B60` |
| Dourado | `ouro #96742A` (ação principal, aba ativa), `ouroEscuro`, `ouroClaro #C2A85F`, `moeda #C9A33F` |
| Item | `pontuavel #E3CF9E` (preenchido), `compromisso #8C7B60` (contorno), `naoCumprido #A89A80` (tracejado) |
| Avisos | `hoje #9A4B26` (dia atual, agora, sala trocada, preço pendente), `perigo #8C2F3A` (excluir, saldo negativo) |
| Atributos (`COR_DO_ATRIBUTO`) | Corpo `#9E3B2E`, Mente `#2F4E7A`, Ofício `#8A5A2B`, Casa `#46653F`, Social `#6A4573` — escudo, radar, faixas, histórico, seletor |

A paleta de cores de disciplina continua a do core (`PALETA_DESTAQUE`), que também deriva a cor do
avatar.

### Componentes

| Componente | O que é |
|---|---|
| `Cabecalho.tsx` | `CabecalhoInterno` ("← Calendário" + título Cinzel, faixa na cor da disciplina), `CabecalhoModal` ("Fechar · TÍTULO · SALVAR"), `Folha` (folha de pergaminho sobre o véu: captura, aula, recompensa — `transparentModal`) |
| `Campos.tsx` | `Rotulo`, `Secao` (rótulo + fio), `Campo`, `Chip`, `Botao` (`primario` / `contorno` / `perigo` / `neutro`), `Segmentado`, `LinhaDeLista` |
| `Dialogo.tsx` | `useAlerta()` — mesma assinatura do `Alert.alert`, opções em cartões com `detalhe`, "CANCELAR" no rodapé; `{ serie: true }` põe o ícone de repetição (alcance da série). Substitui todos os `Alert` nativos |
| `Aviso.tsx` | barra escura com ação em Cinzel dourado ("DESFAZER") |
| `Icones.tsx` | moeda, escudo de atributo, traços de contagem do esforço, caixa de marcar, rosa dos ventos, setas |
| `EntradaItem` | linha: compromisso (contorno + bolinha), aberta (preenchida, caixa, traços do esforço e escudo do atributo), concluída (esmaecida, riscada, uma linha), não cumprida (tracejada, "–") |
| `SeletorEsforco` | grade `— 1 2 3 5 8`, régua em itálico com fio dourado, atributos principal/secundário com escudo |
| `CampoDataHora` / `CampoHora` | "Início · qua, 23/09 · 18:00"; `CampoHora` só a hora, com seletor (grade da disciplina) |

### Estados de um item (EntradaItem)

| Estado | Visual | Marcador |
|---|---|---|
| compromisso (sem esforço) | contorno `compromisso` 1,5 px, fundo transparente | bolinha vazada |
| aberta (pontuável) | preenchido `pontuavel`, borda `ouroClaro` | caixa vazia |
| concluída | preenchido com opacidade 0,55, título riscado | caixa com visto |
| não cumprida (ocorrência passada) | contorno tracejado `naoCumprido`, texto apagado, "não cumprido" | – |

Item ligado a disciplina ganha um **selo** com o código da disciplina na cor dela.


---

## 3. Mapa de navegação

```
Barra de abas (4) + botão flutuante "+"
├── Hoje
├── Calendário ── [Grade] → Semestre → Disciplina
│                 toque em aula → Aula (modal)
├── Recompensas ── [+ Nova] / toque no cartão → Recompensa (modal)
└── Perfil ── Configurações → Régua de esforço
          │                 → Lixeira
          │                 → Importar calendário
          │                 → Lembretes agendados (diagnóstico)
          │                 → Fuso e IDs do aparelho (diagnóstico)
          └── Ver agendados → Lembretes agendados

De qualquer aba:  "+"            → Captura rápida (modal)
De qualquer item: toque          → Detalhe do item (modal)
Notificação tocada               → Detalhe do item
```

Telas empilhadas desenham o próprio cabeçalho (`CabecalhoInterno`); o do Stack está desligado.
Diagnóstico de fuso saiu do Perfil e fica em Configurações, junto de Lembretes agendados.

---

## 4. Telas

### 4.0 Abertura do app — `app/_layout.tsx`

- **Carregando:** rosa dos ventos, "COMPASSO" e "Abrindo o Compasso…" (enquanto migra o banco
  local e carrega as fontes).
- **Erro:** "Falha ao migrar o banco local" + mensagem técnica.
- Sem onboarding. Na primeira abertura a pessoa cai na aba Hoje vazia e
  precisa ir ao Perfil para entrar (ver 4.4).

---

### 4.1 Aba Hoje — `app/(abas)/index.tsx`

**Propósito:** o que acontece hoje. É a tela mais usada.

**Conteúdo, de cima para baixo (ordem fixa pela especificação):**
1. Título do dia (ex.: "terça, 23 de setembro") à esquerda, **saldo de moedas** à direita
   (vermelho `perigo` se negativo).
2. Indicador de sincronização (texto discreto).
3. **Faixa de aulas do dia** (LinhaAula): horário, disciplina, sala, cor da disciplina. Reposição
   aparece como "· reposição". Toque → tela Aula.
4. **Itens do dia** (EntradaItem `linha`): caixa de marcar (só pontuáveis), título, selo de
   disciplina, linha de detalhe: "14:00–15:00 · repete · adiada 2 vezes" / "até 18:00" / "dia inteiro".

**Ações:**
- Tocar na caixa → conclui; aviso "+X Atributo · +Y moedas — Desfazer". Tocar de novo desfaz
  (aviso "Conclusão desfeita").
- Tocar no item → Detalhe do item.
- Segurar item pontuável simples e aberto → diálogo "Adiar para amanhã".
- Puxar para baixo → sincroniza.
- `+` → Captura rápida.

**Estados:** vazio sem aulas → "Dia livre." / "Nada marcado para hoje. Toque em + para registrar
algo."; com aulas e sem itens → só as aulas.

---

### 4.2 Aba Calendário — `app/(abas)/calendario.tsx` + `src/calendario/`

**Propósito:** ver e organizar o tempo em duas escalas.

**Barra superior (uma linha só):** `‹` · título do período (ex.: "20/09 – 26/09" ou "Setembro
2026", encolhe com fonte grande) · `›` · **Hoje** · alternância **Sem | Mês** (lembrada entre
aberturas) · **Grade** (→ Semestre).
> Observação: essa barra está apertada — seis controles numa linha.

#### Visão Semana — `Semana.tsx`

- Cabeçalho com 7 colunas: dia da semana abreviado + número; hoje em `hoje` e negrito.
- **Faixa superior**: itens de dia inteiro, de vários dias e tarefas com prazo (EntradaItem `mini`).
- **Grade de 24 h** (44 px por hora, rolagem vertical, abre às 7h), régua de horas à esquerda.
- **Aulas ao fundo**: bloco com a cor da disciplina translúcida e borda esquerda sólida, texto
  com o código. Toque → Aula. Canceladas não aparecem aqui.
- **Itens** como blocos (EntradaItem `bloco`), lado a lado quando se sobrepõem.
- **Linha do "agora"** em `hoje` na coluna do dia atual, atualiza a cada minuto.
- **Arrastar para agendar:** segurar (300 ms) uma tarefa da faixa superior e arrastar mostra um
  "fantasma" verde com o título e o horário-alvo ("qua 14:15" ou "solte na grade") e um retângulo
  tracejado de 1 h na grade. Soltar → vira bloco de 1 h (encaixe de 15 min), aviso
  "Agendada: qua 14:15–15:15 — Desfazer". Soltar fora cancela.
- Toque em item → Detalhe do item.

#### Visão Mês — `Mes.tsx`

- Grade de 5–6 semanas, nomes dos dias no topo.
- Cada célula: número do dia (hoje em destaque, outro mês esmaecido), **no máximo 3 itens**
  (`mini`) e "+N" para o excedente.
- Evento de vários dias repete em cada dia que ocupa.
- Tocar no dia → vai para a semana daquele dia.

---

### 4.3 Aba Recompensas — `app/(abas)/recompensas.tsx`

**Propósito:** gastar as moedas ganhas com recompensas reais.

**Conteúdo:**
1. **Saldo** grande (28px, negrito; `perigo` se negativo) + explicação quando negativo
   ("Saldo negativo por uma conclusão desfeita: nenhum resgate até voltar a zero.").
2. Botão **+ Nova recompensa**.
3. **Cartões de recompensa** (ativas primeiro, arquivadas com opacidade 0,5):
   - nome · preço vigente;
   - preço pendente em `hoje`: "passa a custar 120 em 29/09";
   - linha de estado: "cooldown de 7 dias · disponível" / "em carência: vale a partir de 29/09
     (segunda)" / "resgatada há pouco: de novo em 02/10" / "faltam 30 moedas" / "arquivada";
   - botão **Resgatar** (desativado quando não disponível; "Resgatando…" durante).
   - Toque no cartão → editar recompensa.
4. **Histórico de resgates**: "23/09 · Pizza · 80 moedas" + nota sobre preço pago na época e a
   regra da segunda-feira.

**Ações:** resgatar pede confirmação ("Resgatar Pizza? 80 moedas.") e **exige rede**; erros
explicam o motivo (servidor recusou / sem rede). Puxar para baixo sincroniza.

**Vazio:** "Cadastre recompensas reais — algo que você quer e vai comprar com o esforço feito."

---

### 4.4 Aba Perfil — `app/(abas)/perfil.tsx`

**Propósito:** quem eu sou e como estou indo (ordem definida na especificação).

1. **Cabeçalho:** avatar 88px (foto ou iniciais sobre a cor da conta), nome, "no Compasso desde
   dd/mm/aaaa". Tocar no avatar → "Escolher foto" / "Voltar às iniciais" / "Cancelar" (foto
   quadrada recortada, precisa de rede).
   Sem perfil: "Nenhum perfil gravado neste aparelho ainda."
2. **Formulário de acesso** (só quando não há sessão) — ver 4.4.1.
3. **Progresso:** Radar + Faixas de nível por atributo.
   Vazio: "Nenhum ponto ainda. Dê esforço a uma tarefa e conclua — o radar começa a mostrar onde
   o seu esforço está indo."
4. **Histórico:** gráfico de XP por mês + últimos 5 resgates.
5. **Lembretes:** estado da permissão — ativados / bloqueados (em `perigo`, com instrução) /
   indisponíveis no Expo Go / botão "Ativar lembretes". No Android 12, aviso e botão "Abrir Alarmes
   e lembretes". Link "Ver lembretes agendados".
6. **Configurações:** link para a tela de Configurações; "Atualizar do servidor" + estado + "última
   sincronização: …"; texto de depuração "Escala de esforço (do core): 1 · 2 · 3 · 5 · 8"; link
   "Diagnóstico de fuso e IDs".

> Observação: esta tela mistura botões nativos (`Button`) com o `Botao` do app, e tem dois itens
> de desenvolvimento visíveis (escala do core e diagnóstico).

#### 4.4.1 Formulário de acesso — `src/ui/FormularioAcesso.tsx` (embutido no Perfil)

- Título "Entrar" / "Criar conta"; chips **Já tenho conta** | **Tenho um convite**.
- Campos: endereço do servidor (validação http/https), [convite XXXX-XXXX-XXXX-XXXX, seu nome],
  e-mail, senha (mín. 8 no cadastro).
- Botão Entrar / Criar conta ("Enviando…"); erro em `perigo`.
- Rodapé: "Esqueceu a senha? Peça ao administrador do servidor uma senha temporária."

---

### 4.5 Captura rápida (modal) — `app/captura.tsx`

**Propósito:** registrar algo em menos de 3 segundos.

- Campo de título grande, **já com foco e teclado aberto**: "O que vai acontecer?". Enter salva.
- Resumo do quando: "hoje, 15:00" / "amanhã, dia inteiro" / "qui, 25 de setembro, 09:00".
  Padrão: próxima hora cheia de hoje, duração 1 h.
- Chips de um toque: **Hoje · Amanhã · −1h · +1h · Dia inteiro**.
- Seletor de esforço **compacto** (sem atributo secundário).
- Se escolheu esforço: chips **Evento (horário)** | **Tarefa (prazo)**.
- Botão **Salvar** preenchido (desativado sem título). Aplica o lembrete padrão das configurações.
- Todo o resto (notas, recorrência, disciplina…) fica no Detalhe do item.

---

### 4.6 Detalhe do item (modal) — `app/item/[id].tsx`

**Propósito:** edição completa de evento, tarefa ou ocorrência de série.

**Cabeçalho:** título "Evento" / "Tarefa" / "Ocorrência", **Salvar** à direita.

**Conteúdo, de cima para baixo:**
1. Erros de validação (em `perigo`, no topo).
2. Se ocorrência: "Série · ocorrência de terça, 23 de setembro (movida)".
3. Título (campo grande).
4. **Concluir** / **Concluir esta ocorrência** / **Desfazer conclusão** (contorno verde, só
   pontuáveis; não fecha a tela; mostra aviso com o XP/moedas).
5. **Adiar para amanhã** (só pontuável simples e aberto) + "Adiada N vezes."
6. **Esforço** (SeletorEsforco completo, ou congelado: "Esforço 3 · Mente + Corpo — Congelado: o
   item já entrou no dia…").
7. Evento (horário) | Tarefa (prazo), se tem esforço.
8. Quando:
   - Tarefa → **Prazo** (data + hora).
   - Evento → chave **Dia inteiro**; com ela, **De / Até** (só datas); sem ela, **Início / Fim**
     (mover o início leva o fim junto) ou "+ adicionar fim".
   - Aviso quando o fuso do aparelho não é o de São Paulo.
9. **Repetição** (EditorRecorrencia). Regra importada que não cabe no editor aparece descrita, com
   "Substituir por uma regra simples".
10. **Disciplina** (chips com a cor de cada disciplina do semestre ativo + "Nenhuma").
11. **Lembrete antes:** Nenhum · 5 min · 15 min · 30 min · 1 h · 1 dia (pede permissão na hora).
12. **Notas** (texto livre, multilinha).
13. **Excluir** (contorno `perigo`).

**Diálogos:**
- Sair com alterações → "Descartar alterações?" (Continuar editando / Descartar).
- Salvar ocorrência → "Aplicar a alteração a…" **Só esta** / **Esta e as futuras** / Cancelar
  (se mudou tipo, lembrete, disciplina, esforço ou repetição, só "esta e as futuras").
- Excluir item → "Ele vai para a lixeira por 30 dias."; excluir ocorrência → Só esta / Esta e as futuras.

**Estado de erro:** "Item não encontrado (talvez excluído)."

---

### 4.7 Semestre — `app/semestre.tsx`

**Propósito:** manutenção da grade acadêmica (uma vez por semestre).

- Cabeçalho: "Semestre 2026.2" + "01/08 a 20/12" + "· ainda não começou" / "· encerrado (férias)".
  Sem semestre: "Nenhum semestre ativo: a aba Hoje não mostra aulas."
- **Cartões de disciplina** (borda esquerda na cor dela): "Nome (CÓDIGO)" e uma linha por horário
  "seg 19:00–20:40 · sala B204", ou "sem horários". Toque → Disciplina.
- Botão **+ Disciplina**.
- **Criar semestre novo** → formulário inline: nome (sugere "2026.2"), início e fim como texto
  `AAAA-MM-DD`; "O novo vira o corrente; o atual fica arquivado, intacto."
- **Semestres arquivados**: lista; toque → "Tornar corrente?".

> Observação: datas digitadas como texto, sem seletor.

---

### 4.8 Disciplina — `app/disciplina.tsx`

**Propósito:** criar/editar disciplina e seus horários semanais.

- Campos: Nome, Código, Professor, Sala padrão, **Cor** (chips só de cor, da paleta), Notas.
- Botão **Criar disciplina** / **Salvar disciplina**.
- Só ao editar:
  - **Horários**: lista "seg 19:00–20:40 · sala B204" com "excluir" em `perigo` (confirma).
  - **Novo horário**: chips dom…sáb, Início/Fim como texto `HH:mm`, sala opcional, **+ Horário**.
  - **Excluir disciplina** (confirma: horários saem junto; provas ligadas ficam sem o selo).

> Observação: horas digitadas como texto, sem seletor.

---

### 4.9 Aula do dia (modal) — `app/aula.tsx`

**Propósito:** ver uma aula num dia específico e registrar exceções.

- Cabeçalho com barra na cor da disciplina: nome, "terça, 23 de setembro · 19:00–20:40",
  "Sala B204" (ou "(trocada neste dia)" em `hoje`), "Prof. Fulano", "Cancelada neste dia" em
  `perigo`, nota.
- Lista de exceções registradas ("Cancelamento", "Troca para C101", "Reposição") com "desfazer".
- Ações: **Cancelar a aula deste dia** (perigo) · campo "Sala só neste dia" + **Trocar sala neste
  dia** · **Sem aula nenhuma neste dia (feriado, recesso)** (confirma).
- Sem conclusão: aula não é tarefa.

---

### 4.10 Recompensa (modal) — `app/recompensa.tsx`

- Campos: Nome ("Pizza no sábado"), Preço (moedas), Cooldown (dias entre resgates).
- Texto da regra: nova → "só pode ser resgatada a partir de segunda, 29/09"; edição → "Um preço
  novo — para mais ou para menos — só vale a partir de segunda…".
- **Criar** / **Salvar**; ao editar, **Arquivar** (perigo) ou **Reativar**.

---

### 4.11 Configurações — `app/configuracoes.tsx`

- **Nome de exibição** + Salvar nome.
- **Lembrete padrão de itens novos**: chips Nenhum · 10 min · 30 min · 1 h · 1 dia.
  "Alterações salvas aqui; vão ao servidor na próxima conexão." quando pendente.
- **Fuso horário**: só explicação (sempre São Paulo).
- Links: **Régua de esforço** · **Lixeira** · **Importar calendário (.ics)**.
- **Trocar senha**: atual, nova (mín. 8), repetir; valida se as duas conferem; resultado informa
  quantos outros aparelhos precisarão entrar de novo.
- **Sair da conta** (perigo): avisa que apaga os dados do aparelho e quantas alterações ainda não
  foram enviadas.
- Sem conta: "Conecte ao servidor uma vez para editar o perfil."

---

### 4.12 Régua de esforço — `app/regua.tsx`

Só leitura. Texto explicando que a régua é fixa de propósito; uma linha por valor (1, 2, 3, 5, 8)
com o número grande, o resumo em negrito e exemplos.

---

### 4.13 Lixeira — `app/lixeira.tsx`

Lista dos excluídos nos últimos 30 dias: título, "excluído 20/09 14:00 · some em 27 dias · série",
ação **Restaurar**. Vazio: "Lixeira vazia."

---

### 4.14 Importar calendário — `app/importar.tsx`

- Instrução de como exportar do Google Calendar + aviso de que é a única tela que exige rede e que
  reimportar não duplica.
- Botão **Escolher arquivo .ics** (preenchido).
- Progresso: spinner + "Enviando e convertendo…" / "Trazendo para o aparelho…".
- **Resultado**: "12 criados · 3 atualizados · 40 já estavam iguais · 2 exceções de séries";
  caixa de aviso (borda `hoje`) "Repetições que o Compasso não sabe seguir" com a lista; lista
  "Não importados" com o motivo.
- Erro: "A importação falhou e nada foi gravado: …".

---

### 4.15 Lembretes agendados — `app/notificacoes.tsx` (diagnóstico)

"N de 60 (orçamento; o iOS aceita 64)", botão nativo **Reagendar agora**, lista de notificações pendentes (título,
data/hora, corpo). Tela técnica.

### 4.16 Diagnóstico de fuso — `app/diagnostico.tsx` (dev)

Resultado de testes de fuso ("Fusos OK" / "Fusos com FALHA"), fuso e localidade do aparelho, 3
UUIDv7 gerados. **Não usa o tema** (cores fixas, fundo branco no escuro). Candidata a sair da
navegação do usuário ou ficar escondida.

---

## 5. Pontos soltos que o redesign pode resolver

Achados na leitura do código, não decisões tomadas:

- **Ícones:** as abas têm ícones próprios (`src/ui/IconesAbas.tsx`); o resto do app usa texto e
  caracteres (`‹ › + ☐ ☑ ✓ – ━ ┅ ■`). Não há biblioteca de ícones.
- **Tipografia:** fonte do sistema, tamanhos soltos por tela (10–28 px), sem escala definida.
- **Botões inconsistentes:** `Botao` contornado, botões preenchidos feitos à mão (Captura,
  Importar) e `Button` nativo (Perfil, Lembretes agendados).
- **Chip duplicado:** existem três implementações quase iguais (Captura, EditorRecorrencia, Campos).
- **Confirmações** todas em `Alert` nativo — sem controle de estilo.
- **Entrada de data/hora como texto** em Semestre (`AAAA-MM-DD`) e Disciplina (`HH:mm`).
- **Barra do Calendário** com seis controles numa linha.
- **Primeira abertura** sem onboarding: o login está no meio da aba Perfil.
- **Itens de desenvolvimento** visíveis ao usuário no Perfil (escala do core, diagnóstico,
  lembretes agendados).
- `Vazio.tsx` e `diagnostico.tsx` usam cores fixas fora do tema.
- **Cores dos atributos** só existem no histórico de XP; o radar e as faixas usam `destaque`.
