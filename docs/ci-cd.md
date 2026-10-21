# CI/CD e versionamento

Contexto para agentes e pessoas que mexem no repositório: como o código sai de um branch e chega à produção, o que cada workflow faz e quais regras não podem ser quebradas. A visão de produto e a arquitetura estão em [sdd-spec.md](sdd-spec.md) (seções 3, 13 e 15).

> Este documento **não** lista nomes nem valores de variáveis, chaves, secrets ou identificadores de projeto. Eles ficam fora do repositório: nos secrets do GitHub, nos secrets das Edge Functions e no painel da Vercel. Nunca escreva segredos em código, docs, commits, logs ou na saída de workflows.

---

## 1. Visão geral

```
branch de trabalho ──PR──▶ CI (ci.yml) ──verde──▶ merge na main
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     ▼                              ▼                              ▼
           Deploy Supabase                  Vercel (front)                Cron de resultados
        (deploy-supabase.yml)            integração Git própria         (cron-resultados.yml)
     migrations + Edge Functions        preview em PR, prod na main       2×/dia, independente
```

| Peça                            | Onde roda                | Gatilho                                                                      |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| CI                              | GitHub Actions           | todo PR e todo push na `main`                                                |
| Deploy do banco e das functions | GitHub Actions           | push na `main` que mexe em `supabase/**` ou `packages/shared/src/**`; manual |
| Deploy do front                 | Vercel (fora do Actions) | integração Git: preview por PR, produção na `main`                           |
| Sincronização de resultados     | GitHub Actions           | agendado (22h30 e 09h00, horário de Brasília); manual                        |

**Situação atual:** a produção existe (Supabase e Vercel, montadas em 21/10) e os três workflows funcionam. O cron roda, mas a API da CAIXA responde **HTTP 403** às Edge Functions na nuvem (pendência P4 da spec): até isso ser resolvido, os resultados entram pelo admin ou pelos próprios usuários (ver [sessao-2026-10-21.md](sessao-2026-10-21.md), seção 11).

---

## 2. Versionamento

### 2.1 Branches

- `main` é o único branch de longa duração e representa o que vai (ou irá) para produção.
- Todo trabalho acontece em um branch próprio, nomeado pelo tipo: `feat/fase-3`, `fix/…`, `docs/…`, `chore/…`.
- Nada é commitado nem enviado direto na `main`. Isso é bloqueado pelo ruleset (seção 4).

### 2.2 Commits

- Use **Conventional Commits** em português: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`. Um escopo opcional pode indicar a tarefa ou área, por exemplo `feat(f3.1): parser de planilha`.
- Faça **commits em blocos**: um commit por tarefa do plano (`Fx.y`) ou por mudança coesa. Cada commit precisa passar sozinho em lint, formatação, tipos, testes unitários, `sync:shared:check` e `deno check`.
- Agentes só commitam quando o usuário pede, e **não** fazem push, abrem PR ou mergeiam sem pedido explícito.
- Encerre a mensagem com a linha de coautoria quando o commit for feito por um agente.

### 2.3 Pull requests e merge

- O PR é obrigatório para entrar na `main`, e o check `ci` precisa estar verde com o branch atualizado em relação à `main`.
- Os métodos de merge permitidos são **Rebase and merge** (o preferido, porque preserva os commits em blocos) e **Squash**. O histórico da `main` é linear, sem merge commits.
- As conversas do PR precisam estar resolvidas. Nenhuma aprovação é exigida, porque o projeto tem um único mantenedor.

### 2.4 Versões de ferramentas

| Ferramenta     | Como é fixada                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm           | `packageManager` no `package.json` raiz; o `pnpm/action-setup` lê dali                                                               |
| Node           | `engines.node >= 22`; o CI usa 22, e o desenvolvimento local, 24                                                                     |
| Dependências   | `pnpm-lock.yaml` versionado; o CI instala com `--frozen-lockfile`                                                                    |
| Supabase CLI   | devDependency do projeto (CI e local); o workflow de deploy usa a `latest` do `supabase/setup-cli` (ponto de atenção: pode divergir) |
| Deno           | major 2 (CI: `v2.x`; `deno_version = 2` no `config.toml`)                                                                            |
| GitHub Actions | fixadas por major (`@v4`, `@v2`, `@v1`)                                                                                              |

Ao atualizar uma dessas versões, faça isso em um commit `chore:` próprio e confira se o CI continua verde.

---

## 3. Workflows (`.github/workflows/`)

### 3.1 `ci.yml`: integração contínua

Roda em todo PR e em todo push na `main`. Uma nova execução no mesmo ref cancela a anterior. É um job único chamado **`ci`**, que é o nome exigido pelo ruleset: **não renomeie o job** sem atualizar o ruleset.

Etapas, em ordem (uma falha interrompe as seguintes):

1. **Dependências:** `pnpm install --frozen-lockfile`.
2. **Qualidade estática:** `pnpm lint`, `pnpm format:check` e `pnpm typecheck`. Em seguida, `pnpm sync:shared:check` confere se a cópia de `packages/shared/src` em `supabase/functions/_shared/domain/` está em dia, e `deno check` valida as Edge Functions e seus testes.
3. **Testes unitários:** Vitest do `packages/shared`, com cobertura mínima de 90% das linhas, e do `apps/web`.
4. **Banco:** sobe o Supabase local e roda `supabase db reset` (migrations + seed), os testes pgTAP (`supabase test db`) e o lint do schema. Depois vêm os testes Deno das Edge Functions, com a API da CAIXA **simulada**.
5. **Tipos gerados:** `pnpm gen:types` não pode alterar `apps/web/src/types/database.ts`. Se você mudar o schema, gere e commite os tipos.
6. **Build:** `pnpm build`, seguido de duas guardas: o bundle inicial precisa ficar abaixo de 250 KB gzip (`scripts/tamanho-bundle.mjs`), e nenhuma chave secreta ou referência ao papel de serviço pode aparecer no `dist`.
7. **E2E:** Playwright em 360×800 e 1280×800 contra o Supabase local. Em caso de falha, o `test-results` é publicado como artefato por 7 dias.

O CI **não usa secrets**. Tudo roda contra o Supabase local, com as chaves públicas de desenvolvimento que o próprio CLI gera. Por isso é seguro rodar o CI em PRs de forks, que ainda assim precisam de aprovação manual.

### 3.2 `deploy-supabase.yml`: banco e Edge Functions

- **Gatilho:** push na `main` que altere `supabase/**` ou `packages/shared/src/**`, ou execução manual.
- **Environment:** `producao` (só a `main` pode usá-lo). As credenciais vêm dos secrets desse environment.
- **Passos:** confere a cópia do shared, liga o CLI ao projeto de produção, roda `supabase db push` (aplica as migrations novas) e `supabase functions deploy` (publica todas as functions).
- Os deploys não rodam em paralelo (`concurrency` sem cancelamento).
- **Limitação conhecida:** o workflow não espera o CI da `main` terminar. A meta, ainda pendente, é encadear o deploy do banco e o do front depois do CI verde.

### 3.3 `cron-resultados.yml`: sincronização agendada

- Roda às 01h30 e às 12h00 UTC (22h30 e 09h00 em Brasília) e também pode ser disparado à mão.
- Faz uma chamada HTTP autenticada à Edge Function `sync-resultados`, que busca os concursos na API da CAIXA, confere as apostas e processa os prazos de prêmios.
- Também evita que o projeto Supabase gratuito pause por inatividade.
- Falha em uma modalidade não derruba o job (fica registrada no log de sincronização). O job só falha em erro geral, quando a resposta não é 200. Por isso um job **verde** pode ter todas as modalidades com erro: confira o resumo no log do job ou a tabela `sync_logs`.
- Resultados lançados à mão (admin) ou informados por usuários não são definitivos: o cron busca esses concursos de novo e os substitui pelo oficial assim que a API responder.
- A resposta impressa no log contém só o resumo por modalidade, sem dados de usuários.

> O cron não é o único caminho para conferir. A conferência sob demanda (`conferir-apostas` com `aposta_id`, botão "Conferir agora") busca na hora o resultado que falta (spec, seção 10.2).

### 3.4 Deploy do front (Vercel)

Fica fora do GitHub Actions: a Vercel observa o repositório, publica um preview por PR e a produção a cada push na `main`. O Root Directory é `apps/web`. O `vercel.json` define os headers de segurança (CSP etc.) e os rewrites da SPA, e o e2e `headers-producao` verifica esses headers quando há uma URL de produção.

---

## 4. Proteção da `main` (ruleset)

A definição versionada fica em `.github/rulesets/protecao-main.json`. O GitHub **não** aplica o arquivo sozinho: ele é importado na interface. Ao mudar uma regra pela interface, exporte o ruleset e atualize o arquivo no mesmo PR.

| Regra                         | Efeito                                        |
| ----------------------------- | --------------------------------------------- |
| Sem exclusão / sem force-push | o histórico da `main` não é reescrito         |
| Histórico linear              | só rebase ou squash, sem merge commits        |
| PR obrigatório                | 0 aprovações; conversas resolvidas            |
| Check `ci` obrigatório        | verde e com o branch atualizado (modo strict) |
| Sem bypass                    | nem o administrador pula as regras            |

---

## 5. Ambientes

| Ambiente | Banco/functions                                  | Front              | Dados                            |
| -------- | ------------------------------------------------ | ------------------ | -------------------------------- |
| Local    | Supabase CLI via Docker (`pnpm db:start`)        | `pnpm dev`         | seed fictício, usuários de teste |
| CI       | Supabase CLI no runner, recriado a cada execução | build + Playwright | seed fictício                    |
| Produção | projeto Supabase gerenciado                      | Vercel             | reais, só por convite            |

Diferenças intencionais entre o local e a produção:

- O seed (concursos fictícios e usuários de teste) existe **só** no local e no CI.
- No local, a busca de resultados sob demanda fica desligada (`[edge_runtime.secrets]` em `supabase/config.toml`) para que os e2e não dependam da API real da CAIXA. Na produção, ela fica ligada.
- Configurações do local, como os secrets das functions em `config.toml`, **não** vão para a produção: os secrets de produção são cadastrados no painel ou no CLI do Supabase, fora do repositório.

---

## 6. Checklist para quem muda algo

- **Mudou o schema** → crie uma migration nova (nunca edite uma já aplicada), adicione ou ajuste o pgTAP, rode `pnpm gen:types` e commite os tipos.
- **Mudou `packages/shared/src`** → rode `pnpm sync:shared` e commite a cópia em `supabase/functions/_shared/domain/`.
- **Mudou uma Edge Function** → rode `deno check` e os testes Deno com o Supabase local no ar. Se for uma function nova, reinicie o Supabase local para o runtime enxergá-la.
- **Adicionou uma dependência pesada no front** → use `import()` sob demanda e confira o limite de 250 KB do bundle inicial.
- **Mudou um workflow** → mantenha o job `ci` com esse nome, não exponha secrets em `run:` ou em logs e prefira `concurrency` para evitar execuções duplicadas.
- **Antes do PR** → rode `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm db:test` e o e2e local.
