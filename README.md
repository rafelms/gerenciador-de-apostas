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

- `sync-resultados` (cron 22h30 e 9h BRT, ou "Sincronizar agora" no admin) busca na API pública da CAIXA o último concurso de cada modalidade e os concursos que as apostas precisam, grava em `concursos` e confere as apostas. Falhas ficam no log (`/admin/resultados`) e o job não quebra. Se a API cair, o admin lança o resultado à mão na mesma tela.
- `conferir-apostas` grava conferência, prêmio (bruto, IR e líquido, com o snapshot da regra) e a divisão entre os participantes, e notifica o usuário (Realtime). É idempotente. O front a chama depois de criar ou editar uma aposta.
- IR, isenção, base do IR (cota/aposta), interpretação do rateio da API (bruto/líquido), prazo de resgate e preços ficam em `/admin/configuracoes`.

## Regras do projeto

- Todo SQL entra por **migration** em `supabase/migrations/` — nunca direto no painel.
- Dinheiro sempre em **centavos inteiros** (`bigint` no banco, `number` inteiro no TS).
- Toda tabela de `public` tem RLS; o teste `supabase/tests/001_rls_cobertura.test.sql` falha se alguma ficar sem.
- `packages/shared` não importa nada além de `zod` (roda também no Deno).
- Fixtures de teste são **sempre fictícias**. Nunca commite comprovantes reais.
- Front-end: antes de mexer em telas, consulte a skill `ui-ux-pro-max` (spec, seção 0).

## Deploy (quando for para produção)

1. **Supabase:** crie o projeto, desative o cadastro público (Auth → Sign In / Providers → _Allow new users to sign up_ desligado), habilite MFA TOTP e ajuste _Site URL_ e _Redirect URLs_ para o domínio da Vercel. Copie os templates de `supabase/templates/` para os e-mails de convite e recuperação.
2. **GitHub secrets:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SUPABASE_FUNCTIONS_URL`. O workflow `deploy-supabase.yml` aplica migrations e publica as functions a cada push na `main`.
3. **Supabase secrets** (functions): `supabase secrets set ALLOWED_ORIGIN=https://seu-dominio.vercel.app CRON_SECRET=...` (o mesmo `CRON_SECRET` do GitHub; `SUPABASE_FUNCTIONS_URL` = `https://<ref>.supabase.co/functions/v1`). `CAIXA_API_URL` é opcional e só serve para apontar para outra fonte de resultados.
4. **Vercel:** importe o repositório com _Root Directory_ = `apps/web` e defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (chave **pública**; nunca a secret/service role).
5. **Primeiro admin:** crie o usuário em Auth → Users → _Invite user_ e promova pelo SQL Editor:

   ```sql
   update public.profiles set papel = 'admin' where id = (select id from auth.users where email = 'seu@email.com');
   ```

   No primeiro acesso, ative o MFA em Configurações → Segurança.
