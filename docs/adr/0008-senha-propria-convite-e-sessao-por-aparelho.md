# ADR-0008: Senha própria, cadastro por convite e sessão por aparelho

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)

## Contexto

A F10 do [roadmap](../roadmap.md) abre o Compasso para alguns amigos próximos (menos de dez
contas, §2 da [especificação](../especificacao-tecnica-v1.md)). Até a F8 as contas eram criadas
por script, que imprimia um token de aparelho; não havia e-mail, senha nem cadastro. A §10 da
especificação deixou em aberto o modelo de autenticação (senha própria, link mágico ou login
social) e o roadmap listou o cadastro, hoje manual. O roadmap previa esperar o M5 mais um mês de
uso; o autor validou o app no aparelho real e decidiu começar a F10 em 2026-09-23.

## Decisões

**1. Senha própria.** E-mail e senha, sem serviço externo. Link mágico exigiria provedor de envio
de e-mail com domínio e credencial; login social, credenciais OAuth e, no iOS, conta de
desenvolvedor. Para menos de dez pessoas conhecidas, nenhum dos dois paga a infraestrutura.

**2. Hash com scrypt da biblioteca padrão do Node** (N=2^17, r=8, p=1, recomendação da OWASP),
gravado como `scrypt$17$8$1$<sal>$<hash>`. Argon2id seria a primeira escolha da OWASP, mas no
Node 22 exige dependência nativa compilada no servidor doméstico; scrypt está na biblioteca padrão
e os parâmetros viajam com o hash, então trocar de custo depois não invalida senhas gravadas.
E-mail desconhecido confere contra um hash fictício: mesmo tempo e mesma resposta
("e-mail ou senha incorretos") de uma senha errada.

**3. Credencial fora de `users`.** Tabela `credentials` (userId, e-mail normalizado e único, hash).
`GET /me` e o RLS de `users` nunca tocam no hash. Uma conta criada por script pode existir sem
credencial: entra só pelo token do script até o administrador rodar `conta:acesso`.

**4. Sessão = token por aparelho em `api_tokens`.** Entrar e cadastrar emitem um token aleatório de
32 bytes, gravado só como SHA-256 — o mesmo formato do token de script, então o middleware não
muda. Sem JWT nem par access/refresh: cada requisição já consulta o banco (`resolver_token`), a
revogação é imediata, e o app é offline-first — um token que expira sozinho deslogaria quem ficou
semanas sem rede. Sair revoga o token do aparelho; trocar a senha revoga todos os outros.

**5. Cadastro só com convite.** O administrador gera o código por script (`convite:criar`,
validade padrão de 7 dias, uso único) e manda para a pessoa. O código tem ~80 bits num alfabeto
sem ambíguos (`XXXX-XXXX-XXXX-XXXX`); só o hash fica no banco. Cadastro aberto exporia um servidor
doméstico com dado pessoal a qualquer um que descobrisse a URL.

**6. A API não ganha privilégio novo sobre contas e sessões.** Criar conta, emitir e revogar token
são funções `SECURITY DEFINER` (`cadastrar_conta`, `emitir_token`, `revogar_tokens`), no mesmo
desenho de `resolver_token` ([ADR-0002](0002-ferramentas-e-convencoes-da-fundacao.md)):
`api_tokens` continua invisível para o papel da API, que também não tem `INSERT` em `users` nem
acesso a `invites`. `emitir_token` e `revogar_tokens` agem só na conta de `app.user_id`.
`cadastrar_conta` trava o convite (`FOR UPDATE`), cria conta, credencial e token e marca o convite
numa transação; e-mail repetido desfaz tudo, inclusive o consumo do convite.

**7. Limite de tentativas em memória, em três camadas.** Cinco senhas erradas em 15 minutos
bloqueiam o e-mail (ou a conta, na troca de senha) até a janela passar, com `429` e `Retry-After`.
Vinte falhas em 15 minutos bloqueiam o IP (`CF-Connecting-IP` atrás do túnel, o da conexão na rede
local), para quem troca de e-mail a cada tentativa. E no máximo dois hashes scrypt rodam ao mesmo
tempo (os outros esperam na fila), para uma enxurrada não ocupar memória e o pool de threads do
Node. Reiniciar a API zera a contagem; com uma instância e poucas contas, uma tabela não se paga.

**8. Esqueci a senha → administrador.** `conta:acesso <e-mail>` gera uma senha temporária, que a
pessoa troca no app. Redefinição por e-mail traria de volta o provedor de envio da decisão 1.

**9. Distribuição por APK de release gerado localmente.** Sem loja e sem EAS (exige conta na Expo, e
o build `--local` não roda no Windows): `npm run apk -w @compasso/mobile` faz o prebuild e o
`assembleRelease` na máquina do autor. Um config plugin (`plugins/apk-release.js`) injeta a
assinatura com a chave própria, lida do `~/.gradle/gradle.properties` — a mesma chave sempre, senão
o Android recusa instalar a atualização por cima. O release só aceita HTTPS; um APK de teste
contra a API local sai com `COMPASSO_PERMITIR_HTTP=1` e não deve ser distribuído.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Link mágico por e-mail | Provedor de envio, domínio e credencial para menos de dez pessoas |
| Login social (Google/Apple) | Credenciais OAuth, configuração nativa e conta de desenvolvedor Apple |
| Argon2id (`argon2` do npm) | Dependência nativa; o scrypt nativo do Node é aceito pela OWASP |
| JWT com refresh token | Revogação só com lista negra; expiração desloga quem fica offline |
| Cadastro aberto | Qualquer um com a URL cria conta num servidor doméstico |
| `GRANT` em `api_tokens` com RLS | Contraria o ADR-0002; as funções expõem só a operação |
| EAS Build | Conta externa e build na nuvem; o build local já funciona |

## Consequências

- Rotas públicas novas: `POST /auth/cadastro` e `POST /auth/entrar`. Com sessão: `POST /auth/sair`
  e `PUT /me/senha` (senha atual errada é `403`, não `401`, porque o app lê `401` como sessão
  encerrada).
- Migrações 0015 (`credentials`, `invites`) e 0016 (funções e grants).
- Scripts novos: `convite:criar`, `convite:listar`, `conta:acesso`. `conta:criar` e `conta:token`
  continuam (desenvolvimento e a conta do autor).
- No app, o Perfil troca "URL + token" por entrar / criar conta com convite. Um `401` apaga só o
  token (URL e dados locais ficam) e o indicador mostra "sessão encerrada"; entrar de novo na
  mesma conta envia o que estava pendente. Entrar em outra conta apaga os dados locais antes, para
  nada de uma conta subir para a outra.
- A conta do autor, criada por script, continua funcionando com o token atual; para entrar com
  senha em outro aparelho, basta `conta:acesso <userId> <e-mail>` uma vez.
