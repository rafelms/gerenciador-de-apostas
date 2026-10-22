# LotoGestor

Gerenciador pessoal de apostas das Loterias CAIXA (até 5 usuários). A especificação completa está em [docs/sdd-spec.md](docs/sdd-spec.md).

- **Front:** React + Vite (SPA), Tailwind v4, shadcn/ui, TanStack Query — `apps/web`
- **Regras puras:** TypeScript sem dependências além de `zod` — `packages/shared`
- **Backend:** Supabase (Postgres + RLS, Auth com MFA, Edge Functions em Deno) — `supabase/`

## Pré-requisitos

| Ferramenta     | Versão  | Observação                                         |
| -------------- | ------- | -------------------------------------------------- |
| Node.js        | 22+     |                                                    |
| pnpm           | 10      | `npm i -g pnpm@10` (ou `corepack enable`)          |
| Docker Desktop | recente | precisa estar **ligado** para o Supabase local     |
| Deno           | 2.x     | só para checar as Edge Functions (`npm i -g deno`) |

O Supabase CLI é instalado como dependência do projeto (`pnpm exec supabase ...`).

## Rodando localmente

```bash
pnpm install
pnpm db:start                 # sobe Postgres/Auth/Storage/Functions locais (1ª vez baixa as imagens)
cp apps/web/.env.example apps/web/.env.local
# preencha com API_URL e PUBLISHABLE_KEY mostrados por `pnpm exec supabase status`
pnpm dev                      # http://localhost:5173
```

Usuários de teste criados pelo seed (**somente local**):

| E-mail              | Senha        | Papel                                                                    |
| ------------------- | ------------ | ------------------------------------------------------------------------ |
| `admin@local.test`  | `Senha12345` | admin — ative o MFA em Configurações → Segurança para entrar em `/admin` |
| `membro@local.test` | `Senha12345` | membro                                                                   |

E-mails enviados pelo Auth local (convites, recuperação de senha) aparecem no Mailpit: http://127.0.0.1:54324.
O Studio do banco fica em http://127.0.0.1:54323.

## Scripts

| Comando                                        | O que faz                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                     | front em modo desenvolvimento                                                                    |
| `pnpm build`                                   | typecheck + build de produção                                                                    |
| `pnpm test`                                    | testes unitários (Vitest) do shared e do web                                                     |
| `pnpm test:coverage`                           | testes do shared com cobertura mínima de 90%                                                     |
| `pnpm --filter @lotogestor/web test:e2e`       | Playwright (360×800 e 1280×800) contra o Supabase local                                          |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | qualidade                                                                                        |
| `pnpm db:reset`                                | recria o banco local (migrations + seed)                                                         |
| `pnpm db:test`                                 | testes pgTAP (RLS, constraints, triggers)                                                        |
| `pnpm db:lint`                                 | lint do schema                                                                                   |
| `pnpm gen:types`                               | regenera `apps/web/src/types/database.ts` a partir do banco local                                |
| `pnpm sync:shared`                             | copia `packages/shared/src` para `supabase/functions/_shared/domain/` (rode após mudar o shared) |

Edge Functions (com o Supabase local no ar), em `supabase/functions/`:

- `deno check --config deno.json */index.ts tests/*.ts` — tipos
- `deno test --allow-net --allow-env --allow-read tests/` — sincronização e conferência com a API da CAIXA **simulada**

> As functions só são registradas no `supabase start`. Ao criar uma function nova, rode `pnpm exec supabase stop` e `pnpm db:start`.

## Resultados e conferência

- `sync-resultados` (cron 22h30 e 9h BRT, ou "Sincronizar agora" no admin) busca o último concurso de cada modalidade e os concursos que as apostas precisam, grava em `concursos` e confere as apostas. Falhas ficam no log (`/admin/resultados`) e o job não quebra.
- **Fontes, em ordem** (a CAIXA bloqueia a nuvem do Supabase, pendência P4 da spec): (1) respostas da CAIXA buscadas pelo próprio cron no runner do GitHub (`scripts/buscar-resultados-caixa.mjs`); (2) API da CAIXA, a partir da function; (3) API alternativa, um espelho comunitário da CAIXA (`fonte = 'api_alternativa'`). Só a CAIXA é oficial: o que vem de outra fonte é buscado de novo e substituído quando a CAIXA responder.
- Sem nenhuma fonte, o admin lança o resultado à mão em `/admin/resultados`, e qualquer usuário pode **informar o resultado** do concurso da própria aposta (fica marcado como não oficial).
- `conferir-apostas` grava conferência, prêmio (bruto, IR e líquido, com o snapshot da regra) e a divisão entre os participantes, e notifica o usuário (Realtime). É idempotente. O front a chama depois de criar ou editar uma aposta.
- IR, isenção, base do IR (cota/aposta), interpretação do rateio da API (bruto/líquido), prazo de resgate e preços ficam em `/admin/configuracoes`.

## Regras do projeto

- Todo SQL entra por **migration** em `supabase/migrations/` — nunca direto no painel.
- Dinheiro sempre em **centavos inteiros** (`bigint` no banco, `number` inteiro no TS).
- Toda tabela de `public` tem RLS; o teste `supabase/tests/001_rls_cobertura.test.sql` falha se alguma ficar sem.
- `packages/shared` não importa nada além de `zod` (roda também no Deno).
- Fixtures de teste são **sempre fictícias**. Nunca commite comprovantes reais.
- Front-end: antes de mexer em telas, consulte a skill `ui-ux-pro-max` (spec, seção 0).

## Deploy (produção)

A produção está no ar (Supabase + Vercel). Para montar de novo, nesta ordem (detalhes e problemas já vistos em [docs/sessao-2026-10-21.md](docs/sessao-2026-10-21.md), seção 11):

1. **Supabase:** crie o projeto, desative o cadastro público (Auth → Sign In / Providers → _Allow new users to sign up_ desligado), habilite MFA TOTP e ajuste _Site URL_ e _Redirect URLs_ para o domínio da Vercel. Se ligar a integração com o GitHub, deixe **desligados** o deploy automático e o _branching_ (quem publica é o `deploy-supabase.yml`).
2. **E-mail:** no plano Free, os templates só ficam editáveis com **SMTP próprio** (Resend, Brevo…), e o e-mail embutido só envia para membros da organização. Configure o SMTP e copie os templates de `supabase/templates/` para o convite e a recuperação de senha.
3. **GitHub** (environment `producao`, só a `main`): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (20 letras minúsculas, sem URL), `SUPABASE_DB_PASSWORD`, `CRON_SECRET` e `SUPABASE_FUNCTIONS_URL` (`https://<ref>.supabase.co/functions/v1`, sem `/` no fim). O `deploy-supabase.yml` aplica as migrations e publica as functions a cada push na `main` que mexe em `supabase/` ou no shared.
4. **Supabase secrets** (functions): `ALLOWED_ORIGIN=https://seu-dominio.vercel.app` e o mesmo `CRON_SECRET` do GitHub. Opcionais: `CAIXA_API_URL` e `API_ALTERNATIVA_URL`, para trocar as fontes de resultados sem deploy.
5. **Vercel:** importe o repositório com _Root Directory_ = `apps/web` e defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (chave **pública**; nunca a secret/service role) como variáveis do tipo **Config**. O Vite grava os valores no build: depois de criar ou mudar, faça um _Redeploy_.
6. **Primeiro deploy e cron:** rode **Actions → Deploy Supabase** e depois **Actions → Cron — resultados** à mão; o resumo do cron diz, por modalidade, de que fonte veio o último concurso.
7. **Primeiro admin** (sem depender de e-mail): Auth → Users → _Add user_ → _Create new user_, com senha e _Auto Confirm User_; depois promova pelo SQL Editor:

   ```sql
   update public.profiles set papel = 'admin' where id = (select id from auth.users where email = 'seu@email.com');
   ```

   No primeiro acesso, ative o MFA em Configurações → Segurança.
