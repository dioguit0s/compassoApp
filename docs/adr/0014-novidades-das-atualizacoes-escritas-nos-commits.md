# ADR-0014: Novidades das atualizações escritas à mão nos commits

- **Data:** 2026-10-06
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)
- **Complementa:** [ADR-0013](0013-atualizacoes-do-app-pelo-proprio-servidor.md)

## Contexto

Desde o ADR-0013 as atualizações chegam sozinhas: OTA a cada push na `main` e APK pelo
`apk:publicar`. A página de download (raiz da API) só mostrava a versão do APK e as `--notas`
dele. As atualizações OTA, que são a maioria, não deixavam texto nenhum. Também não havia
histórico: as publicações OTA antigas são apagadas e o `android.json` é sobrescrito. Quem usa
o app não ficava sabendo o que mudou.

O autor quer que o site mostre as novidades sozinho a cada atualização. Também quer que o texto
para o público seja **escrito à mão**, e não derivado do assunto técnico do commit.

## Decisões

**1. O texto mora no commit, num trailer `Novidade:`.** Todo commit que muda o app
(`apps/mobile`, `packages/core`) traz uma ou mais linhas `Novidade: <texto para quem usa>`, ou
`Novidade: -` quando não há nada visível. O texto é escrito à mão no momento do commit, quando o
contexto está fresco. Nada de arquivo separado para lembrar de editar. A regra está no
`CLAUDE.md`. Commits sem o trailer simplesmente não aparecem.

**2. Uma novidade por publicação, num arquivo próprio.** O `ota.mjs` (runner) e o
`publicar-apk.mjs` (máquina do autor) juntam os trailers dos commits do app desde a publicação
anterior e gravam `releases/novidades/<instante>-<ota|apk>-<commit|versionCode>.json`, com
`tipo`, `publicadoEm`, `versao`, `versionCode`, `runtime`, `commit` e `itens`. A publicação
anterior é a novidade mais recente: o `commit` dela marca de onde partir.

- Um arquivo por publicação, e não um histórico único. Assim o runner e o `scp` da máquina do
  autor nunca disputam o mesmo arquivo, e cada um mantém o padrão de nome provisório + `mv`.
- A pasta fica fora de `ota/`, que a limpeza poda (5 por runtime). O histórico não se perde.
- A novidade é gravada depois do bundle ou do APK. O site nunca anuncia o que ainda não dá para
  baixar.
- Uma publicação sem trailers grava a novidade com `itens: []`. Ela fica fora da lista, mas
  marca de onde a próxima parte.
- Commits que não geraram OTA (bundle igual ou mudança nativa) continuam no intervalo e entram na
  próxima publicação, OTA ou APK.
- O `ota:reverter` move a novidade da publicação revertida para `novidades-revertidas/`. Os
  trailers dela voltam na publicação seguinte, que sai com a correção.
- No `apk:publicar`, o `--notas` passa a ser opcional e substitui os trailers. Sem nenhum dos
  dois, o script recusa publicar. As `notas` do `android.json` (o diálogo do app) saem do mesmo
  texto.

**3. A API mostra a mesma lista em três lugares**, lida a cada pedido (sem rebuild e sem cache):

- **Página de download** (`GET /`): seção "Novidades" com as 10 mais recentes, data, etiqueta
  ("Chega sozinha" ou "Versão X · instale pelo app") e itens. O cartão da versão diz "atualizada
  em …" quando há OTA mais novo que o APK.
- **Feed Atom** (`GET /novidades.xml`), para quem quiser acompanhar num leitor de feeds.
- **JSON** (`GET /novidades.json`, até 20), que o app usa.

Rotas públicas, como as de atualização. Arquivo ilegível ou fora do formato é pulado.

**4. O app mostra as novidades uma vez, depois que a atualização entra.** Na abertura, se não
houve diálogo de APK, o app busca a lista e mostra as publicações que já rodam no aparelho e
ainda não foram mostradas: APK com `versionCode` até o instalado, ou OTA do mesmo runtime com
`publicadoEm` até o `createdAt` do bundle em uso. Um OTA baixado e não aplicado só aparece quando
entrar. O instante da mais recente vista fica nas preferências do aparelho. Na primeira vez
aparece só a mais recente. A lista inteira fica em Configurações → Novidades.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Texto gerado do assunto dos commits `feat:`/`fix:` | O autor preferiu escrever à mão; o assunto é técnico e às vezes interno |
| Arquivo `novidades.md` editado à mão no repositório | Mais um lugar para lembrar de atualizar; o trailer nasce junto com a mudança |
| Histórico único (`historico.json`) | Runner e `scp` escreveriam o mesmo arquivo; precisaria de trava ou merge remoto |
| Texto dentro da pasta da publicação OTA | A limpeza apaga as antigas; o histórico sumiria |
| Push (FCM) avisando das novidades | A especificação recusa push do servidor (§6.2): credenciais externas para pouco ganho |

## Consequências

- O job `publicar-ota` faz checkout com `fetch-depth: 0`. Sem o histórico, o intervalo entre as
  publicações não existe e só o último commit contaria.
- Esquecer o trailer não quebra nada: o commit só não aparece. Um texto errado já publicado se
  corrige à mão no arquivo de `releases/novidades/` no servidor.
- A primeira publicação depois desta mudança não tem novidade anterior. Ela conta só o próprio
  commit (ou, no `apk:publicar`, desde o `commit` gravado no `android.json`, que passa a existir
  agora).
- O repositório é público. O texto da novidade não diz nada que os commits já não digam.
