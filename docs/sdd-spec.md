# SDD-SPEC — LotoGestor (Gerenciador pessoal de apostas das Loterias CAIXA)

> **Versão:** 1.0 — 21/10/2026
> **Dono do produto:** Rafael
> **Público deste documento:** agente de desenvolvimento (e humanos revisando o trabalho dele).
> **Idioma do produto e do código:** interface e comentários em **PT-BR**; identificadores de código em português sem acento (`apostas`, `concursos`, `valorCota`), exceto termos técnicos consagrados (`user_id`, `created_at`).

---

## 0. Como o agente deve usar esta spec

1. Trabalhe **fase por fase** (seção 14). Não comece uma fase antes de todos os critérios de aceite da anterior estarem verdes.
2. Cada tarefa `Fx.y` vira **um PR/commit pequeno** (Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`).
3. **Regras de negócio são a fonte da verdade** (seções 5, 9, 10, 11). Se o código e a spec divergirem, a spec vence — ou abra uma pendência na seção 18.
4. Toda regra de cálculo (custo, combinatória, conferência, rateio, IR) **deve ter teste unitário** antes de ser usada na UI.
5. Todo SQL entra por **migration** (`supabase/migrations/`), nunca editado direto no painel.
6. **Nada de dados reais em fixtures.** PDFs e planilhas de teste devem ser fictícios (ver Apêndice A).
7. Estilo de código: simples e didático. Comentários explicativos em PT-BR nas partes de regra de negócio (o "porquê", não o "o quê"). Funções pequenas, nomes claros, sem abstrações prematuras.
8. Quando algo estiver marcado **[PENDÊNCIA]**, implemente de forma **configurável** (seção 11.6) e não "chumbe" o valor no código.
9. **Front-end → skill obrigatória.** Antes de qualquer tarefa que crie ou altere front-end (telas, componentes, layout, estilos, tokens, responsividade, acessibilidade, gráficos ou PWA), carregue e analise a skill `/ui-ux-pro-max` e siga suas diretrizes durante toda a tarefa.
   - Faça isso **a cada nova tarefa de front**, mesmo que já tenha usado a skill antes na mesma sessão.
   - **Em caso de conflito**, esta spec prevalece: cores-base `#282B4A` e `#EEEBDA`, tokens da seção 12.2, mobile-first, rotas e componentes definidos aqui. Use a skill para decidir o que a spec não define (hierarquia visual, espaçamento, microinterações, estados, padrões de componente) e registre a divergência como pendência na seção 18.
   - **Se a skill não estiver disponível**, avise antes de começar e siga apenas a seção 12.

---

## 1. Visão do produto

Sistema web **pessoal** (até 5 usuários) para registrar e acompanhar apostas feitas nas Loterias CAIXA:

- registrar apostas simples, bolões e teimosinhas (manual, Excel ou PDF de comprovante);
- conferir automaticamente com os resultados oficiais;
- calcular prêmios, IR e divisão do prêmio entre pessoas (bruto x líquido);
- mostrar balanço: gasto, recuperado, saldo, ROI e quais apostas valeram a pena;
- dashboard, gráficos, calendário, orçamento mensal, analisador de jogos e notificações internas.

### 1.1 Objetivos
- Usabilidade excelente no **celular** (mobile-first), funcionando bem no desktop.
- **Custo zero** de hospedagem (Vercel Hobby + Supabase Free).
- Segurança: acesso **somente com credenciais**, isolamento total entre usuários, sem cadastro público.

### 1.2 Fora de escopo
- Comprar apostas, integração de pagamento ou com a conta Loterias CAIXA do usuário.
- Relatório para declaração de IRPF (decisão do dono: **não implementar**).
- Notificações por e-mail/push externo (somente **dentro da plataforma**).
- Bolões compartilhados entre usuários do sistema (cada membro vê só o seu; ver 2.3).
- "Previsão" de números. O analisador mostra estatísticas descritivas, sem prometer aumento de chance.

---

## 2. Perfis e permissões

### 2.1 Papéis
| Papel | Quem | Pode |
|---|---|---|
| `admin` | Rafael | Tudo do membro + convidar/desativar usuários + ver **métricas agregadas** de todos + lançar resultado manual de concurso + editar configurações globais (IR, preços) |
| `membro` | Demais (até 4) | CRUD dos **próprios** dados apenas |

### 2.2 Regra de visibilidade (inegociável)
- Membro **só** lê/escreve linhas com `user_id = auth.uid()`.
- Admin vê de outros usuários **apenas métricas agregadas** (gasto, recuperado, saldo, ROI, nº de apostas, última atividade, distribuição por modalidade). Admin **não** vê dezenas, comprovantes, observações nem participantes de outros usuários. Isso é entregue por função `SECURITY DEFINER` (seção 8.3), nunca por RLS aberta.
- Resultados de concursos (`concursos`) e catálogo de modalidades são **leitura para qualquer autenticado**; escrita só por Edge Function (service role) ou admin.

### 2.3 Divisão entre pessoas
"Dividir uma aposta com X pessoas" é feito **dentro da aposta do usuário**, com participantes que são apenas **nomes** (não são usuários do sistema). Ex.: Rafael comprou 2 cotas de um bolão e dividiu com 3 amigos → a aposta é do Rafael e os amigos aparecem como participantes do rateio.

---

## 3. Decisões de arquitetura (ADRs)

### ADR-01 — Supabase como backend (BaaS), sem servidor próprio
- **Decisão:** Postgres + Auth + Storage + Realtime + Edge Functions do Supabase. Sem Spring Boot, Express ou FastAPI.
- **Motivo:** hospedagem gratuita confiável, segurança via RLS, menos peças para manter.
- **Consequência:** a lógica fica em três lugares: **SQL** (constraints, RLS, agregações), **Edge Functions** (integrações e jobs) e **pacote compartilhado** TS (regras puras).

### ADR-02 — TypeScript ponta a ponta
- Front (React), Edge Functions (Deno) e regras compartilhadas em TS. Python foi descartado: exigiria hospedagem separada.

### ADR-03 — Monorepo único
- Um repositório com `pnpm workspaces`. Schema, functions e front evoluem juntos; os tipos do banco são gerados em um lugar só.

### ADR-04 — SPA com Vite (não Next.js)
- Não há SEO nem SSR necessário; todo dado é privado e vem do Supabase. A SPA é mais simples e cabe no Vercel Hobby.

### ADR-05 — Processamento de arquivos no navegador
- Excel (SheetJS) e PDF (pdf.js) são lidos **no cliente**. O arquivo original não sai do aparelho; só os dados revisados vão ao banco. Isso é bom para privacidade, porque o comprovante contém nome e CPF.

### ADR-06 — Dinheiro em centavos inteiros
- Todo valor monetário é `bigint` em **centavos** no banco e `number` inteiro no TS. Nunca usar float para dinheiro. Formatação só na borda (UI).

### ADR-07 — Jobs agendados via GitHub Actions
- Um cron do GitHub Actions chama a Edge Function `sync-resultados`. Isso sincroniza os resultados **e** mantém o projeto Supabase ativo (o plano Free pausa projetos sem atividade por 7 dias).

---

## 4. Stack

| Camada | Tecnologia | Observações |
|---|---|---|
| Linguagem | TypeScript (strict) | `noUncheckedIndexedAccess: true` |
| Front | React + Vite | versão estável mais recente no momento da implementação |
| Rotas | React Router | rotas protegidas por guarda de sessão |
| Estilo | Tailwind CSS v4 + shadcn/ui | tokens da seção 12 |
| Ícones | lucide-react | |
| Estado servidor | TanStack Query | cache, invalidação após mutações |
| Formulários | React Hook Form + Zod | mesmos schemas no front e nas functions |
| Gráficos | Recharts | |
| Datas | date-fns + date-fns-tz | fuso `America/Sao_Paulo` |
| Excel | SheetJS (instalar pelo CDN oficial `cdn.sheetjs.com`, não pelo npm, que está desatualizado) | |
| PDF | pdfjs-dist | Web Worker; fallback OCR com tesseract.js (fase 3, opcional) |
| PWA | vite-plugin-pwa | instalável, cache do shell |
| Backend | Supabase (Postgres 15+, Auth, Storage, Realtime, Edge Functions/Deno) | |
| Testes | Vitest, Testing Library, Playwright, pgTAP (`supabase test db`) | |
| Qualidade | ESLint, Prettier, `tsc --noEmit` | |
| CI/CD | GitHub Actions + integração Git da Vercel | |
| Gerenciador | pnpm | |

---

## 5. Domínio

### 5.1 Glossário
| Termo | Significado |
|---|---|
| **Modalidade** | Tipo de loteria (Mega-Sena, Lotofácil, Quina…) |
| **Concurso** | Sorteio numerado de uma modalidade, com data e dezenas sorteadas |
| **Aposta** | Registro do usuário: uma compra (simples, bolão ou teimosinha) com 1+ jogos |
| **Jogo** | Um conjunto de dezenas marcadas (ex.: 7 dezenas na Mega) |
| **Aposta simples** | Compra individual de 1+ jogos |
| **Bolão CAIXA** | Aposta coletiva oficial com N cotas; o comprovante indica quantas cotas o recibo tem |
| **Cota** | Fração de um bolão. Ex.: "1 cota de 38" |
| **Tarifa de serviço** | Valor adicional cobrado no bolão (até 35% do valor da cota). Entra no **gasto** |
| **Teimosinha** | Mesmos jogos repetidos em N concursos consecutivos |
| **Faixa** | Categoria de prêmio (sena, quina, quadra; 15, 14, 13, 12, 11 pontos…) |
| **Participante** | Pessoa (só nome) com quem o usuário divide sua parte da aposta |
| **Peso** | Proporção do participante no rateio (padrão 1) |
| **Gasto** | Quanto o usuário pagou (sua parte): valor das cotas/jogos + tarifa |
| **Recuperado** | Prêmio líquido que cabe ao usuário |
| **Saldo** | Recuperado − Gasto |
| **ROI** | Saldo ÷ Gasto |

### 5.2 Modalidades
As regras ficam em **duas fontes sincronizadas**: tabela `modalidades` (dados, editáveis pelo admin) e `packages/shared/src/regras/` (comportamento: conferência e combinatória).

**MVP (fases 1–5):** Mega-Sena, Lotofácil, Quina.
**Fase 6:** Dupla Sena, Lotomania, Dia de Sorte, Timemania, Super Sete, +Milionária.

| Campo | Mega-Sena | Lotofácil | Quina |
|---|---|---|---|
| `slug` | `megasena` | `lotofacil` | `quina` |
| Universo | 1–60 | 1–25 | 1–80 |
| Dezenas sorteadas | 6 | 15 | 5 |
| Base da aposta simples (`p`) | 6 | 15 | 5 |
| Mín/máx marcadas | 6 / 20 | 15 / 20 | 5 / 15 |
| Faixas (acertos) | 6, 5, 4 | 15, 14, 13, 12, 11 | 5, 4, 3, 2 |
| Preço aposta simples* | R$ 6,00 | R$ 3,50 | R$ 3,00 |
| Bolão: cotas | 2–100 | [PENDÊNCIA] | [PENDÊNCIA] |

\* Preços vigentes desde 09/07/2025 (último reajuste conhecido). Ficam em `modalidade_precos` **com vigência**, porque a CAIXA reajusta periodicamente. A conferência do PDF de exemplo bate com R$ 6,00 (ver Apêndice A).

> O agente deve validar os limites de dezenas e os valores de bolão no site oficial da CAIXA antes de criar o seed. Divergências viram pendência.

### 5.3 Custo de um jogo
Para modalidades de combinação (Mega, Lotofácil, Quina, Dupla, Dia de Sorte):

```
custoJogo(n) = precoSimples × C(n, p)
```
- `n` = dezenas marcadas, `p` = base da aposta simples, `C` = combinação.
- Ex.: Mega com 7 dezenas = 6,00 × C(7,6) = 6,00 × 7 = **R$ 42,00**.

Custo de uma aposta simples = Σ custoJogo × nº de concursos (teimosinha).

Bolão: o comprovante já traz **valor da cota** e **tarifa**. O sistema guarda o que foi pago e usa a fórmula acima apenas para **validar** (Apêndice A.3).

---

## 6. Estrutura do repositório

```
lotogestor/
├── apps/
│   └── web/                          # SPA React (deploy Vercel, Root Directory = apps/web)
│       ├── public/
│       ├── src/
│       │   ├── app/                  # providers, router, layout
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── apostas/
│       │   │   ├── importacao/       # excel/ e pdf/
│       │   │   ├── conferencia/
│       │   │   ├── dashboard/
│       │   │   ├── calendario/
│       │   │   ├── orcamento/
│       │   │   ├── analisador/
│       │   │   ├── notificacoes/
│       │   │   ├── configuracoes/
│       │   │   └── admin/
│       │   ├── components/ui/        # shadcn/ui
│       │   ├── components/           # componentes do app (BolaDezena, MoneyText…)
│       │   ├── lib/                  # supabase client, formatadores, query keys
│       │   ├── styles/               # tokens.css
│       │   └── types/database.ts     # gerado por `supabase gen types`
│       ├── vercel.json
│       └── vite.config.ts
├── packages/
│   └── shared/                       # regras puras (sem React, sem Supabase)
│       ├── src/
│       │   ├── dinheiro.ts           # centavos, arredondamento, rateio
│       │   ├── combinatoria.ts
│       │   ├── regras/               # megasena.ts, lotofacil.ts, quina.ts, index.ts
│       │   ├── conferencia.ts
│       │   ├── premio.ts             # IR, bruto/líquido, divisão
│       │   ├── analisador.ts
│       │   ├── parsers/
│       │   │   ├── comprovante-pdf.ts  # recebe TEXTO, devolve dados estruturados
│       │   │   └── planilha.ts         # recebe linhas, devolve apostas + erros
│       │   └── schemas/              # Zod
│       └── test/
│           └── fixtures/             # textos/planilhas FICTÍCIOS
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/                        # pgTAP (RLS e constraints)
│   └── functions/
│       ├── deno.json                 # import map: "zod" -> "npm:zod@3", "@shared/" -> "../../packages/shared/src/"
│       ├── _shared/                  # cors, auth helpers, supabase admin client
│       ├── sync-resultados/
│       ├── conferir-apostas/
│       └── admin-usuarios/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-supabase.yml
│   └── cron-resultados.yml
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
└── README.md
```

**Código compartilhado no Deno:** `packages/shared` não pode ter dependências além de `zod`, e os imports internos usam extensão `.ts` (`allowImportingTsExtensions`) para funcionar no Node/Vite e no Deno. Se o deploy da function não resolver caminhos fora de `supabase/functions`, crie o script `pnpm sync:shared` que copia `packages/shared/src` para `supabase/functions/_shared/domain/`. O CI deve falhar se a cópia estiver desatualizada.

---

## 7. Modelo de dados

Convenções: `id uuid default gen_random_uuid()`, `created_at`/`updated_at timestamptz default now()` (trigger de `updated_at`), dinheiro em `bigint` centavos com sufixo `_centavos`, dezenas em `smallint[]` ordenado.

### 7.1 Diagrama lógico
```
auth.users 1─1 profiles
modalidades 1─N modalidade_precos
modalidades 1─N concursos
profiles 1─N apostas N─1 modalidades
apostas 1─N aposta_jogos
apostas 1─N aposta_concursos N─1 concursos    (1 linha p/ simples/bolão; N p/ teimosinha)
aposta_jogos × aposta_concursos → conferencias (acertos por jogo por concurso)
apostas 1─N premios (por concurso)
apostas 1─N participantes
premios 1─N premio_divisoes (snapshot do rateio)
profiles 1─N orcamentos
profiles 1─N notificacoes
apostas 1─N anexos (storage)
configuracoes (singleton global)
importacoes (log)
```

### 7.2 DDL (referência; o agente transforma em migrations)

```sql
-- Tipos
create type papel_usuario   as enum ('admin', 'membro');
create type tipo_aposta     as enum ('simples', 'bolao', 'teimosinha');
create type origem_aposta   as enum ('manual', 'excel', 'pdf');
create type status_aposta   as enum ('aguardando', 'conferida', 'premiada', 'nao_premiada', 'cancelada');
create type status_premio   as enum ('a_resgatar', 'resgatado', 'expirado');
create type tipo_notificacao as enum ('resultado', 'premio', 'premio_expirando', 'orcamento', 'sistema');

-- Perfis
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 80),
  papel papel_usuario not null default 'membro',
  ativo boolean not null default true,
  preferencias jsonb not null default '{}'::jsonb,   -- tema, modalidade padrão etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catálogo
create table modalidades (
  id smallserial primary key,
  slug text unique not null,                 -- 'megasena', usado na API da CAIXA
  nome text not null,
  universo_min smallint not null,
  universo_max smallint not null,
  qtd_sorteadas smallint not null,
  base_aposta smallint not null,             -- p
  min_marcadas smallint not null,
  max_marcadas smallint not null,
  faixas jsonb not null,                     -- [{ "acertos": 6, "nome": "Sena" }, ...]
  bolao_min_cotas smallint,
  bolao_max_cotas smallint,
  cor_hex text,                              -- cor de identificação na UI
  ativa boolean not null default true
);

create table modalidade_precos (
  id serial primary key,
  modalidade_id smallint not null references modalidades(id),
  preco_simples_centavos bigint not null check (preco_simples_centavos > 0),
  vigente_desde date not null,
  unique (modalidade_id, vigente_desde)
);

-- Resultados oficiais
create table concursos (
  id bigserial primary key,
  modalidade_id smallint not null references modalidades(id),
  numero int not null check (numero > 0),
  data_sorteio date not null,
  dezenas smallint[],                        -- null enquanto não sorteado
  rateio jsonb,                              -- [{ "acertos": 6, "ganhadores": 0, "valor_centavos": 0 }, ...]
  acumulado boolean,
  data_proximo date,
  valor_estimado_proximo_centavos bigint,
  fonte text not null default 'api_caixa',   -- 'api_caixa' | 'manual' (admin) | 'usuario' (não oficial)
  sincronizado_em timestamptz,
  unique (modalidade_id, numero)
);

-- Apostas
create table apostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  modalidade_id smallint not null references modalidades(id),
  tipo tipo_aposta not null,
  origem origem_aposta not null default 'manual',
  concurso_inicial int not null,
  qtd_concursos smallint not null default 1 check (qtd_concursos between 1 and 24),
  data_aposta date not null,
  -- Bolão
  bolao_total_cotas smallint,
  bolao_cotas_usuario smallint,
  bolao_numero_cota smallint,                -- "Cota: 35/38" -> 35 (informativo)
  valor_cota_centavos bigint,
  tarifa_centavos bigint not null default 0 check (tarifa_centavos >= 0),
  -- Valores
  valor_pago_centavos bigint not null check (valor_pago_centavos >= 0),  -- total pago pelo usuário (inclui tarifa)
  -- Rastreio / dedup
  comprovante_hash text,                     -- SHA-256 do código do recibo; NUNCA o código puro
  local_compra text,                         -- 'app', 'lotérica', 'internet banking' (livre)
  observacao text check (char_length(observacao) <= 500),
  status status_aposta not null default 'aguardando',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bolao_campos check (
    (tipo <> 'bolao') or
    (bolao_total_cotas >= 2 and bolao_cotas_usuario between 1 and bolao_total_cotas)
  ),
  constraint teimosinha_qtd check ((tipo = 'teimosinha') = (qtd_concursos > 1)),
  unique (user_id, comprovante_hash)
);
create index on apostas (user_id, data_aposta desc);
create index on apostas (user_id, modalidade_id);
create index on apostas (modalidade_id, concurso_inicial);

create table aposta_jogos (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),  -- denormalizado para RLS simples
  ordem smallint not null,                   -- "Jogo 1", "Jogo 2"
  dezenas smallint[] not null,
  unique (aposta_id, ordem)
);
-- Trigger obrigatório: validar_dezenas() -> dezenas únicas, ordenadas, dentro do universo,
-- quantidade entre min_marcadas e max_marcadas da modalidade da aposta.

create table aposta_concursos (               -- expansão da teimosinha
  aposta_id uuid not null references apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  modalidade_id smallint not null,
  numero_concurso int not null,
  primary key (aposta_id, numero_concurso)
);
-- Trigger: ao inserir/alterar aposta, (re)gera linhas concurso_inicial .. +qtd_concursos-1.

create table conferencias (
  aposta_jogo_id uuid not null references aposta_jogos(id) on delete cascade,
  concurso_id bigint not null references concursos(id),
  user_id uuid not null,
  acertos smallint not null,
  dezenas_acertadas smallint[] not null,
  premios_por_faixa jsonb not null,          -- { "6": 0, "5": 1, "4": 6 } (qtd de combinações premiadas)
  conferido_em timestamptz not null default now(),
  primary key (aposta_jogo_id, concurso_id)
);

create table premios (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references apostas(id) on delete cascade,
  user_id uuid not null,
  concurso_id bigint not null references concursos(id),
  bruto_aposta_centavos bigint not null,     -- prêmio bruto da aposta inteira (todas as cotas)
  bruto_usuario_centavos bigint not null,    -- parte do usuário (cotas dele)
  ir_usuario_centavos bigint not null,
  liquido_usuario_centavos bigint not null,
  regra_ir jsonb not null,                   -- snapshot da configuração usada no cálculo
  valor_informado_manual boolean not null default false,
  status status_premio not null default 'a_resgatar',
  prazo_resgate date not null,               -- data_sorteio + 90 dias
  resgatado_em date,
  unique (aposta_id, concurso_id)
);

create table participantes (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nome text not null check (char_length(nome) between 1 and 60),
  peso numeric(6,2) not null default 1 check (peso > 0),
  eh_usuario boolean not null default false, -- exatamente 1 por aposta quando houver participantes
  contribuicao_centavos bigint               -- null = proporcional ao peso
);

create table premio_divisoes (               -- snapshot do rateio no momento do cálculo
  premio_id uuid not null references premios(id) on delete cascade,
  participante_id uuid not null references participantes(id) on delete cascade,
  user_id uuid not null,
  liquido_centavos bigint not null,
  primary key (premio_id, participante_id)
);

create table orcamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),  -- 1º dia do mês
  limite_centavos bigint not null check (limite_centavos > 0),
  modalidade_id smallint references modalidades(id),     -- null = geral
  unique nulls not distinct (user_id, mes, modalidade_id)
);

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  tipo tipo_notificacao not null,
  titulo text not null,
  corpo text,
  link text,                                 -- rota interna, ex.: /apostas/<id>
  chave_dedup text,                          -- evita notificação duplicada
  lida_em timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, chave_dedup)
);

create table anexos (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  storage_path text not null,                -- comprovantes/{user_id}/{aposta_id}/{uuid}.webp
  mime text not null,
  tamanho_bytes int not null check (tamanho_bytes <= 5242880)
);

create table importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  origem origem_aposta not null,
  nome_arquivo text,
  qtd_apostas int not null,
  qtd_erros int not null,
  created_at timestamptz not null default now()
);

create table configuracoes (                 -- singleton (id = 1)
  id smallint primary key default 1 check (id = 1),
  aliquota_ir_bps int not null default 3000,               -- 30,00%
  limite_isencao_ir_centavos bigint not null default 225920, -- R$ 2.259,20
  base_calculo_ir text not null default 'cota' check (base_calculo_ir in ('cota','aposta')),
  valor_rateio_api_eh text not null default 'bruto' check (valor_rateio_api_eh in ('bruto','liquido')),
  prazo_resgate_dias smallint not null default 90,
  updated_at timestamptz not null default now()
);
```

### 7.3 Views e funções de leitura (SQL)
- `vw_apostas_resumo` (`security_invoker = true`): por aposta → modalidade, tipo, concursos, `gasto_usuario`, `recuperado_usuario`, `saldo`, `melhor_acerto`, status. Respeita RLS do chamador.
- `fn_dashboard(p_inicio date, p_fim date, p_modalidade smallint default null)` → totais, série mensal, por modalidade, por tipo, top apostas. `security invoker`.
- `fn_admin_metricas(p_inicio date, p_fim date)` → ver 8.3.

**Parte do usuário (gasto/recuperado) quando há participantes:**
```
fracaoUsuario = contribuicao_usuario / valor_pago     (se contribuicoes informadas)
              = peso_usuario / Σ pesos               (caso contrário)
gastoUsuario      = valor_pago × fracaoUsuario
recuperadoUsuario = Σ premio_divisoes.liquido do participante eh_usuario
```
Sem participantes: fração = 1.

---

## 8. Segurança

### 8.1 Autenticação
- Supabase Auth, e-mail + senha, fluxo **PKCE**.
- **Cadastro público DESLIGADO** (`enable_signup = false` em `config.toml` e no painel).
- Novos usuários só por **convite do admin** (Edge Function `admin-usuarios`).
- Senha: mínimo 10 caracteres, com letras e números (validação Zod + política do Auth).
- **MFA TOTP:** obrigatório para `admin`; opcional (recomendado na UI) para membros. Ações de admin exigem `aal2`.
- Recuperação de senha por e-mail (template em PT-BR).
- Sessão: renovação automática do supabase-js; logout limpa o cache do TanStack Query.
- Usuário com `profiles.ativo = false`: RLS bloqueia tudo (helper `eh_ativo()`) e o front desloga.
- Atenção: o SMTP padrão do Supabase tem limite baixo de envio. Para 5 usuários basta; se falhar, configurar SMTP próprio gratuito (ex.: Brevo/Resend) — [PENDÊNCIA opcional].

### 8.2 RLS (Row Level Security)
**Toda tabela do schema `public` tem RLS habilitada.** Um teste pgTAP falha se alguma tabela ficar sem RLS ou sem política.

Helpers (`security definer`, `search_path = ''`, `stable`):
```sql
create function public.eh_admin() returns boolean ... -- papel = 'admin' and ativo
create function public.eh_ativo() returns boolean ... -- ativo = true
create function public.aal2() returns boolean as $$ select coalesce(auth.jwt()->>'aal','') = 'aal2' $$ ...
```

Padrão para tabelas do usuário (`apostas`, `aposta_jogos`, `aposta_concursos`, `participantes`, `orcamentos`, `anexos`, `importacoes`):
```sql
alter table apostas enable row level security;
create policy "dono_select" on apostas for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_insert" on apostas for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_update" on apostas for update to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo())
  with check (user_id = (select auth.uid()));
create policy "dono_delete" on apostas for delete to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
```
- Tabelas filhas validam também que a aposta pai pertence ao usuário (`exists (select 1 from apostas a where a.id = aposta_id and a.user_id = auth.uid())`).
- `conferencias`, `premios`, `premio_divisoes`: **select** do dono; insert/update somente via service role (Edge Function), **exceto** `premios` com `valor_informado_manual = true`, que o dono pode inserir/editar.
- `notificacoes`: select e update (só `lida_em`) pelo dono; insert só via service role/trigger.
- `modalidades`, `modalidade_precos`, `concursos`: select para `authenticated`; insert/update só `eh_admin() and aal2()` ou service role.
- `configuracoes`: select para `authenticated`; update só `eh_admin() and aal2()`.
- `profiles`: select do próprio; admin seleciona `id, nome, papel, ativo` de todos via função; update do próprio apenas `nome` e `preferencias` (coluna `papel`/`ativo` protegida por trigger ou grant de coluna).
- **Nenhum** acesso para `anon` em nenhuma tabela.

### 8.3 Métricas do admin
```sql
create function public.fn_admin_metricas(p_inicio date, p_fim date)
returns table (user_id uuid, nome text, qtd_apostas int, gasto_centavos bigint,
               recuperado_centavos bigint, saldo_centavos bigint, roi numeric,
               ultima_aposta date, por_modalidade jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.eh_admin() and public.aal2()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  -- retorna SOMENTE agregados; nunca dezenas, observações, participantes ou anexos
  ...
end $$;
revoke all on function public.fn_admin_metricas from public, anon;
grant execute on function public.fn_admin_metricas to authenticated;
```

### 8.4 Storage
- Bucket **privado** `comprovantes`; caminho `{user_id}/{aposta_id}/{uuid}.{ext}`.
- Política: o usuário só lê/escreve onde `(storage.foldername(name))[1] = auth.uid()::text`.
- Tipos aceitos: `image/jpeg`, `image/png`, `image/webp`. Máx. 5 MB. O front comprime para WebP (largura máx. 1600 px).
- Acesso por **URL assinada** de curta duração (60 s).
- **O PDF importado NÃO é armazenado** por padrão (contém nome, CPF e código do recibo).

### 8.5 Dados pessoais do comprovante
- O parser **descarta** Nome e CPF imediatamente: não persiste, não loga, não envia.
- O código alfanumérico do recibo é usado apenas para **deduplicação**: o front calcula `SHA-256(codigo)` e salva só o hash.
- Logs (front e functions) nunca imprimem conteúdo de arquivos importados.

### 8.6 Chaves e segredos
- No front, só `VITE_SUPABASE_URL` e a **chave pública** (publishable/anon). Ela é pública por design; a proteção é a RLS.
- `service_role`/secret key **somente** nos secrets das Edge Functions. Nunca em `.env` commitado, nunca no front.
- `CRON_SECRET` para a function chamada pelo GitHub Actions (comparação em tempo constante).
- `.env*` no `.gitignore`; `.env.example` sem valores.

### 8.7 Front-end
- `vercel.json` com headers:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
- Proibido `dangerouslySetInnerHTML`. Todo texto vindo de arquivo é tratado como texto puro.
- Rewrites da SPA: tudo para `/index.html`.

### 8.8 Edge Functions
- Validam o JWT (`verify_jwt = true`), exceto `sync-resultados`, que aceita **ou** `CRON_SECRET` **ou** JWT de admin com `aal2`.
- Entrada validada com Zod; erro 400 com mensagem genérica.
- CORS restrito ao domínio da Vercel (e `localhost` em dev).
- Limite simples de taxa por usuário nas functions de admin (ex.: 10 req/min, guardado em tabela).

### 8.9 Integridade no banco
- Constraints e triggers das seções 7.2 validam dezenas, cotas e valores. **O banco é a última barreira**: nada depende só do front.

---

## 9. Regras de cálculo (packages/shared)

### 9.1 Dinheiro
- `type Centavos = number` (inteiro). Funções: `deReais("11,93") → 1193`, `formatarBRL(1193) → "R$ 11,93"`.
- Arredondamento: **half-up** para o centavo.
- **Rateio sem perder centavo** (método do maior resto):
  1. `parte_i = floor(total × peso_i / Σpesos)`;
  2. `sobra = total − Σ parte_i`;
  3. distribuir 1 centavo para as `sobra` partes com maior resto fracionário (desempate: ordem de cadastro).
  - Garantia testada: `Σ partes == total`, sempre.

### 9.2 Combinatória
- `C(n, k)` com inteiros (BigInt se necessário).
- **Prêmios de um jogo com `n` dezenas marcadas e `k` acertos**, para cada faixa com `j` acertos em aposta base `p`:
```
combinacoesPremiadas(j) = C(k, j) × C(n − k, p − j)
```
  - Ex.: Mega, 7 marcadas, 6 acertos → sena: C(6,6)×C(1,0)=1; quina: C(6,5)×C(1,1)=6; quadra: C(6,4)×C(1,2)=0.
  - Ex.: Mega, 7 marcadas, 5 acertos → quina: C(5,5)×C(2,1)=2; quadra: C(5,4)×C(2,2)=5.
- Teste de propriedade: `Σ_j C(k,j)·C(n−k,p−j)` sobre todos os `j` (0..p) = `C(n,p)`.

### 9.3 Conferência
```
conferirJogo(regra, dezenasJogo, dezenasSorteadas) →
  { acertos, dezenasAcertadas, premiosPorFaixa: Record<acertos, qtdCombinacoes> }
```
- Interface `RegraModalidade` (uma implementação por modalidade): `validarJogo`, `custoJogo`, `conferir`, `faixas`.
- Dupla Sena (fase 6) confere contra 2 sorteios; Lotomania premia 0 acertos; +Milionária tem trevos; Super Sete tem colunas. A interface precisa permitir isso (resultado com estrutura extensível), mas o MVP implementa só as 3 modalidades do MVP.

### 9.4 Prêmio bruto da aposta
```
brutoAposta = Σ_jogos Σ_faixas premiosPorFaixa[faixa] × valorFaixa(concurso.rateio)
```
- Se `configuracoes.valor_rateio_api_eh = 'liquido'`, o sistema converte para bruto antes (`bruto = liquido / (1 − aliquota)` quando acima do limite). [PENDÊNCIA P1]
- Bolão: `brutoUsuario = brutoAposta × bolao_cotas_usuario / bolao_total_cotas` (half-up).
- Simples/teimosinha: `brutoUsuario = brutoAposta`.

### 9.5 Imposto de Renda
Regra vigente conhecida: prêmios de loteria acima de **R$ 2.259,20** (1ª faixa da tabela mensal do IRPF) sofrem **30%** de IR **retido na fonte**, de forma definitiva. Prêmios até esse valor são isentos.

```
calcularIR(base, cfg):
  se base > cfg.limite_isencao_ir_centavos:
      ir = round_half_up(base × cfg.aliquota_ir_bps / 10000)
  senão: ir = 0
  liquido = base − ir
```
- `base` é o bruto **por cota** (`base_calculo_ir = 'cota'`, padrão) ou da aposta inteira (`'aposta'`). [PENDÊNCIA P2]
- Para bolão com `base_calculo_ir = 'cota'`: `irUsuario = calcularIR(brutoAposta / total_cotas, cfg) × cotas_usuario` (cota a cota, depois multiplica).
- O resultado salva `regra_ir` (snapshot da configuração) no prêmio, para que mudanças futuras não alterem prêmios antigos.

### 9.6 Divisão entre participantes
- Entrada: `liquidoUsuario` e a lista de participantes (pesos).
- Saída: `premio_divisoes` pelo método do maior resto (9.1).
- A tela mostra a tabela: participante, peso, %, bruto proporcional, IR proporcional, **líquido**.
- **Modo simulação** (sem salvar): o usuário informa um valor e escolhe se é **bruto** ou **líquido**, informa o nº de cotas e as pessoas/pesos, e o sistema devolve a divisão. Útil antes de o resultado sair.

### 9.7 Status da aposta
- `aguardando` → nenhum concurso da aposta sorteado ainda.
- `conferida` → teimosinha com parte dos concursos conferidos.
- `premiada` / `nao_premiada` → todos os concursos conferidos.
- Prêmio `a_resgatar` vira `expirado` automaticamente após `prazo_resgate` (job diário); o usuário marca `resgatado`.

---

## 10. Edge Functions

### 10.1 `sync-resultados`
- **Gatilho:** GitHub Actions (cron) com header `x-cron-secret`, ou botão "Sincronizar agora" do admin.
- **Fonte:** `https://servicebus2.caixa.gov.br/portaldeloterias/api/{slug}/{numero?}` (API pública **não oficial** do portal). Sem número = último concurso.
- **Algoritmo:**
  1. Para cada modalidade ativa: buscar o último concurso.
  2. Calcular os concursos **necessários** = números em `aposta_concursos` sem resultado **oficial** completo em `concursos` (sem dezenas/rateio ou com `fonte` diferente de `api_caixa`) e ≤ último número. A API tem prioridade: resultado lançado à mão (admin ou usuário) é buscado de novo e substituído pelo oficial.
  3. Buscar cada concurso necessário (máx. 30 por execução, com 300 ms de intervalo).
  4. Normalizar a resposta para o formato de `concursos` (dezenas ordenadas; rateio → `valor_centavos`) e fazer `upsert`.
  5. Para cada concurso novo/alterado, chamar `conferir-apostas` (invocação interna). Se o oficial **corrigiu** um resultado não oficial já conferido, as notificações `resultado:{concurso_id}` são reescritas e voltam como não lidas.
  6. Marcar prêmios vencidos como `expirado` e gerar notificações `premio_expirando` (7 dias e 1 dia antes).
- **Resiliência:** timeout de 10 s por chamada; 3 tentativas com backoff; se a API falhar, registrar o erro e **não** quebrar o job. O admin pode lançar o resultado manualmente na UI (`fonte = 'manual'`) e qualquer usuário pode informar o de um concurso da própria aposta (`fonte = 'usuario'`). As chamadas usam cabeçalhos de navegador (User-Agent, Origin e Referer do portal). [PENDÊNCIA P4]
- **Resposta:** `{ modalidades: [{ slug, ultimo, inseridos, conferidos, erro? }] }`.
- **Ações manuais** (mesma function):
  - `POST /sync-resultados/manual` (admin com `aal2`): lança ou corrige o resultado (`fonte = 'manual'`) e confere as apostas.
  - `POST /sync-resultados/informar` (JWT de qualquer usuário ativo, 10 chamadas/min): `{ apostaId, ...resultado }` para um concurso **da própria aposta**. Grava com `fonte = 'usuario'` e confere as apostas de **todos** (o concurso é um só). Recusa (409) se o concurso já tem resultado oficial ou do admin; um resultado de usuário pode ser corrigido por outro usuário. Registra em `sync_logs` com `origem = 'usuario'`.

### 10.2 `conferir-apostas`
- **Entrada:** `{ concurso_id }` (somente service role).
- Para cada `aposta_concursos` do concurso: confere cada jogo (9.3), grava `conferencias`, calcula prêmio (9.4–9.5), grava `premios`, recalcula `premio_divisoes` (9.6) e atualiza `status` da aposta.
- **Idempotente:** rodar duas vezes gera o mesmo resultado (upserts).
- **Conferência sob demanda** (`{ aposta_id }` com o JWT do **dono**): roda ao salvar/editar a aposta (em segundo plano), ao informar prêmio à mão e no botão **"Conferir agora"** do detalhe. Antes de conferir, busca na API **só** os resultados que faltam à aposta (sem dezenas/rateio no banco): 1 chamada ao último concurso e, se preciso, os já sorteados (≤ último, máx. 30). Concursos futuros não geram chamadas extras, e nenhuma chamada é feita se o banco já tem tudo. Concurso novo é conferido para **todos** os usuários (igual ao cron). API fora do ar → confere com o que há no banco e avisa. No ambiente local fica desligada (`RESULTADOS_SOB_DEMANDA = "desligado"` em `config.toml`) para os e2e não dependerem da API real.
- Notificação por usuário e concurso (`chave_dedup = 'resultado:{concurso_id}'`):
  - premiada: "🎉 Sua aposta na Mega-Sena 3070 foi premiada: R$ X líquidos";
  - não premiada: "Resultado da Mega-Sena 3070 conferido: melhor jogo com 3 acertos".

### 10.3 `admin-usuarios`
- Requer JWT com `eh_admin()` e `aal2`.
- `POST /convidar { email, nome }` → `auth.admin.inviteUserByEmail` + cria `profiles` (papel `membro`). Limite total de **5 usuários ativos** (inclui o admin).
- `POST /desativar { user_id }` → `profiles.ativo = false` + `auth.admin.signOut(user_id)` (revoga sessões).
- `POST /reativar { user_id }`.
- O admin não pode desativar a si mesmo.

### 10.4 Jobs (GitHub Actions `cron-resultados.yml`)
- `30 1 * * *` (22h30 BRT) e `0 12 * * *` (09h00 BRT): `curl -X POST` em `sync-resultados` com `x-cron-secret`.
- Isso também evita a pausa do projeto Free por inatividade.

---

## 11. Funcionalidades (especificação funcional)

### 11.1 Autenticação e conta
- Telas: Login, MFA (código TOTP), Esqueci a senha, Redefinir senha, Aceitar convite (definir senha + nome).
- Configurações → Segurança: ativar/desativar MFA (QR code), trocar senha, sair de todos os dispositivos.
- Mensagens de erro genéricas no login ("E-mail ou senha inválidos"), sem revelar se o e-mail existe.

### 11.2 Apostas (CRUD)
**Nova aposta** (formulário em etapas no mobile, página única no desktop):
1. Modalidade (chips com cor da modalidade).
2. Tipo: simples / bolão / teimosinha.
3. Concurso inicial (sugere o próximo concurso via `concursos.data_proximo`) e qtd. de concursos (teimosinha).
4. Jogos: **volante numérico** (grade de bolinhas clicáveis, mostra contador `7/6–20` e custo do jogo em tempo real). Botões: adicionar jogo, duplicar, colar dezenas ("02 09 24 28 44 48 49" ou com `|`, `-`, `,`).
5. Valores: simples → custo calculado (editável, com aviso se divergir); bolão → total de cotas, cotas do usuário, valor da cota, tarifa (valida ≤ 35% da cota), total pago.
6. Divisão (opcional): participantes com nome e peso; "eu" incluído por padrão.
7. Data da aposta, local, observação, anexo (foto do comprovante).

**Lista de apostas:**
- Filtros: modalidade, tipo (simples/bolão/teimosinha), status, período, origem, "só premiadas"; busca por nº do concurso.
- Ordenação: data, valor pago, saldo.
- Card mobile: modalidade (cor), concurso(s), tipo, nº de jogos, pago, prêmio, badge de status, melhor acerto.
- Paginação infinita (20 por página).
- Ações em massa: excluir, exportar selecionadas.

**Detalhe da aposta:** jogos com dezenas como bolinhas (acertadas destacadas em dourado), resultado do concurso, acertos por jogo, prêmio (bruto/IR/líquido), tabela de divisão, anexos e linha do tempo (criada → sorteio → conferida → resgatada).

Editar: permitido; se já conferida, refaz a conferência automaticamente. Excluir: confirmação com nome da modalidade + concurso.

### 11.3 Importação/Exportação Excel
**Modelo** (download pelo app, `modelo-apostas.xlsx`, aba `Apostas`). **Uma linha por jogo**; jogos da mesma aposta compartilham o `grupo`:

| Coluna | Obrig. | Exemplo | Regra |
|---|---|---|---|
| `grupo` | sim | `A1` | agrupa linhas na mesma aposta |
| `modalidade` | sim | `Mega-Sena` | aceita nome ou slug, sem distinção de acento/maiúscula |
| `tipo` | sim | `bolao` | simples / bolao / teimosinha |
| `concurso` | sim | `3070` | inteiro |
| `qtd_concursos` | não | `1` | padrão 1 |
| `data_aposta` | sim | `11/10/2026` | dd/mm/aaaa ou data Excel |
| `dezenas` | sim | `02 09 24 28 44 48 49` | separadores: espaço, `-`, `,`, `;`, `\|` |
| `total_cotas` | bolão | `38` | |
| `cotas_usuario` | bolão | `1` | |
| `valor_cota` | bolão | `8,84` | |
| `tarifa` | não | `3,09` | |
| `valor_pago` | sim* | `11,93` | *repetir só na 1ª linha do grupo; nas demais pode ficar vazio |
| `participantes` | não | `Eu:1; João:1; Ana:2` | nome:peso |
| `observacao` | não | | |

**Fluxo:** upload → leitura no navegador → validação linha a linha → **prévia** (apostas válidas, linhas com erro destacadas e mensagem clara, ex.: "Linha 7: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5") → o usuário confirma → RPC `importar_apostas(p_apostas jsonb)` insere **tudo em uma transação** (tudo ou nada) → registro em `importacoes`.
- Duplicidade: mesma modalidade + concurso + mesmas dezenas já existentes → aviso "possível duplicata" com opção de pular.
- Limite: 2.000 linhas por arquivo.

**Exportação:** respeita os filtros ativos. Gera `.xlsx` com abas `Apostas` (formato do modelo, reimportável), `Prêmios` e `Resumo` (totais por modalidade e mês). Também CSV simples.

### 11.4 Importação por PDF (comprovante de bolão/aposta)
**Formato confirmado:** "Comprovante de Aposta Bolão" gerado pelo app Loterias CAIXA (PDF com texto, 1 página). Ver estrutura e fixture no **Apêndice A**.

**Fluxo:**
1. O usuário seleciona **1 ou vários PDFs** (ou compartilha para o PWA no celular, fase 5).
2. pdf.js extrai o texto (Web Worker). Se a página não tiver texto (escaneado/foto) → mensagem "Este PDF não tem texto selecionável" e, na fase 3b, oferta de OCR.
3. `parseComprovante(texto)` (packages/shared) devolve `{ dados, avisos, erros }`.
4. **Tela de revisão** por arquivo: campos preenchidos e editáveis, jogos como bolinhas, avisos (ex.: "tarifa acima de 35% da cota") e erros que bloqueiam.
5. Confirmar → salva com `origem = 'pdf'` e `comprovante_hash`. Se o hash já existir → "Este comprovante já foi importado em dd/mm" e não duplica.

**Campos extraídos:** modalidade, tipo (bolão se o título contém "Bolão"), concurso, data da aposta, data do sorteio, data/hora da compra, valor total, valor da cota, tarifa, cota (nº/total), qtd. de cotas do recibo ("PARTICIPA COM 01 COTA DO TOTAL DE 38 COTAS"), canal (`Subcanal da compra`), jogos e código do recibo (→ hash).

**Campos descartados:** Nome, CPF, Código E. Lotérico, Terminal.

**Mapeamento para a aposta:**
- `bolao_total_cotas` = total do texto "DO TOTAL DE N COTAS";
- `bolao_cotas_usuario` = "PARTICIPA COM N COTA(S)";
- `bolao_numero_cota` = número antes da barra em "Cota: 35/38";
- `valor_pago_centavos` = valor total da aposta (cota + tarifa);
- `data_aposta` = data da compra (data em que o usuário pagou); a "Data da aposta" do recibo (registro do bolão pela lotérica) vai para a observação.

**Validações:** ver Apêndice A.3.

**Extensibilidade:** parsers registrados por "assinatura" do título (`Comprovante de Aposta Bolão <Modalidade>`, `Comprovante de Aposta <Modalidade>`…). Outros formatos (aposta simples, Lotofácil, Quina) entram quando houver amostras. [PENDÊNCIA P3]

### 11.5 Conferência e resultados
- Página "Resultados": último concurso por modalidade (dezenas, acumulou?, próximo sorteio e estimativa) e lista de concursos com apostas do usuário.
- Cada aposta mostra o resultado assim que o concurso é sincronizado. Não é preciso esperar o cron: aposta registrada depois do sorteio é conferida ao salvar, e o detalhe tem o botão **"Conferir agora"** enquanto algum concurso estiver aguardando (10.2).
- Se o resultado não sincronizar (API fora): o admin lança dezenas e rateio manualmente; os membros veem "Aguardando resultado oficial" e podem **informar o resultado** do concurso da aposta (botão no detalhe), se já o souberem. Esse resultado aparece como "informado por um usuário, não oficial" (no detalhe) e "Não oficial" (página Resultados), pode ser corrigido por qualquer usuário com aposta no concurso e é substituído pelo oficial da API assim que ele for sincronizado (10.1).
- Prêmio manual: o usuário pode informar o prêmio recebido (`valor_informado_manual`), útil para faixas sem rateio disponível.

### 11.6 Configurações globais (admin)
Tela "Configurações do sistema": alíquota de IR, limite de isenção, base do IR (cota/aposta), interpretação do valor da API (bruto/líquido), prazo de resgate e preços por modalidade **com vigência**. Toda alteração pede confirmação e registra `updated_at`.

### 11.7 Dashboard
Período padrão: mês atual; seletor (mês, 3 meses, ano, tudo, personalizado) e filtro de modalidade.
- **KPIs (cards):** Gasto, Recuperado, Saldo (verde/vermelho), ROI %, nº de apostas, taxa de apostas premiadas.
- **Gráficos:**
  - linha: gasto x recuperado por mês, mais saldo acumulado;
  - barras: gasto por modalidade e por tipo (simples/bolão/teimosinha);
  - barras: distribuição de acertos (quantos jogos fizeram 11, 12, 13… pontos);
  - progresso do orçamento do mês.
- **"Apostas que valeram a pena":**
  - top 5 por saldo;
  - top 5 por acertos;
  - **"Quase lá"**: jogos a 1 acerto da faixa máxima (ex.: 14 na Lotofácil, quina na Mega).
- **ROI por modalidade e por tipo** (tabela com gasto, recuperado, saldo e ROI).
- Card "Próximos sorteios com apostas suas".

### 11.8 Calendário
- Visão mensal (desktop) e lista por semana (mobile).
- Eventos: apostas feitas (data), sorteios com apostas do usuário, prêmios a resgatar e **vencimento do prazo de 90 dias**.
- Legenda com cores; tocar no dia abre a lista; heatmap opcional de gasto por dia.

### 11.9 Orçamento e alertas
- Orçamento mensal geral e, opcionalmente, por modalidade.
- Barra de progresso no dashboard e no formulário de nova aposta ("Você usou R$ 80 de R$ 100 este mês").
- Notificação interna ao atingir **80%** e **100%** (`chave_dedup = 'orcamento:{mes}:{modalidade}:{80|100}'`), gerada por trigger ao inserir aposta.
- Não bloqueia o cadastro; apenas avisa (tom neutro, de jogo responsável).

### 11.10 Analisador de jogos
Ferramenta para os jogos de uma aposta ou para um conjunto colado/digitado. Foco inicial: **Lotofácil**; genérico para as demais.
- Distribuição por **faixas configuráveis** (padrão Lotofácil: baixos 01–08, médios 09–17, altos 18–25; editável e salva em `preferencias`).
- Pares/ímpares, primos, soma das dezenas, moldura/miolo (Lotofácil), sequências consecutivas.
- Repetidas do último concurso.
- **Sobreposição entre jogos:** matriz N×N de dezenas em comum, com destaque para pares com sobreposição acima de um limite configurável; média de sobreposição.
- **Cobertura:** quais dezenas do universo aparecem em quantos jogos.
- **Frequência histórica:** quantas vezes cada dezena saiu nos últimos X concursos sincronizados (depende do histórico em `concursos`; job opcional de backfill de N concursos).
- Rodapé fixo: "Estatísticas descritivas; todos os jogos têm a mesma probabilidade de sair."

### 11.11 Notificações internas
- Sino no topo com badge de não lidas; página/lista com filtro e "marcar todas como lidas".
- Atualização via **Supabase Realtime** (canal filtrado por `user_id`), com fallback de refetch a cada 60 s.
- Tipos: resultado, prêmio, prêmio expirando, orçamento e sistema.
- Retenção: apagar notificações lidas com mais de 90 dias (job).

### 11.12 Anexos (foto do comprovante)
- Até 3 imagens por aposta; câmera no mobile (`capture="environment"`).
- Compressão no cliente para WebP; visualização em lightbox via URL assinada.

### 11.13 Admin
- **Usuários:** listar (nome, e-mail, papel, ativo, último acesso), convidar, desativar e reativar. Limite de 5.
- **Métricas:** tabela e gráfico por usuário a partir de `fn_admin_metricas` (somente agregados) e totais gerais.
- **Resultados:** sincronizar agora, ver log da última sincronização, lançar/editar resultado manual.
- **Configurações:** seção 11.6.
- Toda a área exige MFA (`aal2`); sem ele, redireciona para ativar MFA.

### 11.14 PWA
- Manifest (nome, ícones, `theme_color #282B4A`, `background_color #EEEBDA`), instalável.
- Cache do shell; offline mostra a última versão em cache **somente leitura** com o aviso "sem conexão".
- (Opcional) Web Share Target para receber PDF compartilhado do app da CAIXA.

---

## 12. UI/UX e Design System

### 12.1 Princípios
- Mobile-first (base 360 px), breakpoints Tailwind `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Áreas de toque ≥ 44 px; navegação com o polegar.
- Valores sempre com `tabular-nums`; dinheiro alinhado à direita em tabelas.
- Estados obrigatórios em toda tela: carregando (skeleton), vazio (com ação sugerida), erro (com "tentar de novo").
- Acessibilidade: contraste AA, foco visível, `aria-label` em ícones, formulários com label e erro associados, respeito a `prefers-reduced-motion`.
- Formatos BR: `R$ 1.234,56`, `dd/mm/aaaa`, fuso `America/Sao_Paulo`.

### 12.2 Cores (tokens)
Cores-base do produto: **`#282B4A`** (azul-marinho) e **`#EEEBDA`** (creme).

```css
/* apps/web/src/styles/tokens.css — Tailwind v4 @theme */
@theme {
  /* Marinho */
  --color-marinho-950: #1A1C33;
  --color-marinho-900: #282B4A;   /* BASE */
  --color-marinho-800: #343860;
  --color-marinho-700: #444977;
  --color-marinho-500: #6A6F9E;
  --color-marinho-300: #A9ACCB;
  --color-marinho-100: #DCDDEA;

  /* Creme */
  --color-creme-50:  #F8F6EE;
  --color-creme-100: #EEEBDA;     /* BASE */
  --color-creme-200: #E3DEC4;
  --color-creme-300: #CFC8A6;
  --color-creme-500: #A39B76;

  /* Destaque (prêmio) */
  --color-ouro-500: #C9A227;      /* fundos, bordas, bolinhas acertadas */
  --color-ouro-700: #8A6D12;      /* texto dourado sobre creme (AA) */

  /* Semânticas */
  --color-sucesso-600: #2E7D4F;
  --color-perigo-600:  #B23A2B;
  --color-alerta-600:  #A8660F;
  --color-info-600:    #3A5A9B;
}
```

| Papel | Claro | Escuro |
|---|---|---|
| Fundo da página | `creme-100` | `marinho-950` |
| Superfície (cards) | `creme-50` | `marinho-900` |
| Borda | `creme-300` | `marinho-700` |
| Texto principal | `marinho-900` | `creme-100` |
| Texto secundário | `marinho-700` | `marinho-300` |
| Primário (botões, nav ativa) | `marinho-900` + texto `creme-100` | `creme-100` + texto `marinho-900` |
| Destaque/prêmio | `ouro-500` (texto `ouro-700`) | `ouro-500` |
| Lucro / prejuízo | `sucesso-600` / `perigo-600` | versões 400 equivalentes |

- Tema claro/escuro/sistema nas Configurações (salvo em `preferencias`).
- **Cor por modalidade** só em detalhes (chip, borda esquerda do card), nunca como fundo de área grande. Valores em `modalidades.cor_hex`.
- O agente deve checar o contraste de todos os pares texto/fundo (AA ≥ 4.5:1) e ajustar tons se necessário, mantendo as duas bases.

### 12.3 Tipografia
- Fonte: **Inter** (variável, self-hosted via `@fontsource-variable/inter`, sem Google Fonts para respeitar a CSP).
- Escala: 12 / 14 / 16 (base) / 18 / 20 / 24 / 30. KPIs em 24–30, peso 700.

### 12.4 Componentes próprios
- `BolaDezena` (estados: neutra, marcada, acertada [ouro], sorteada).
- `VolanteNumerico` (grade 5×N responsiva, contador e custo ao vivo).
- `MoneyText` (formatação BRL + cor do sinal).
- `KpiCard`, `ModalidadeChip`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `FiltroSheet` (bottom sheet no mobile, popover no desktop).

### 12.5 Navegação
- **Mobile:** bottom nav com 5 itens — Início, Apostas, **[+] Nova** (botão central destacado), Calendário, Mais (Resultados, Analisador, Importar, Orçamento, Configurações, Admin).
- **Desktop (≥ lg):** sidebar fixa à esquerda com os mesmos itens; topo com seletor de período, sino e avatar.

### 12.6 Rotas
| Rota | Tela | Acesso |
|---|---|---|
| `/login`, `/mfa`, `/esqueci-senha`, `/redefinir-senha`, `/convite` | Auth | público |
| `/` | Dashboard | autenticado |
| `/apostas`, `/apostas/nova`, `/apostas/:id`, `/apostas/:id/editar` | Apostas | autenticado |
| `/importar` (abas Excel / PDF), `/exportar` | Importação/Exportação | autenticado |
| `/resultados` | Resultados | autenticado |
| `/calendario` | Calendário | autenticado |
| `/analisador` | Analisador | autenticado |
| `/simulador-rateio` | Simulação de divisão (9.6) | autenticado |
| `/orcamento` | Orçamento | autenticado |
| `/notificacoes` | Notificações | autenticado |
| `/configuracoes` | Perfil, segurança, tema | autenticado |
| `/admin`, `/admin/usuarios`, `/admin/resultados`, `/admin/configuracoes` | Admin | admin + aal2 |

---

## 13. Ambiente, CI/CD e deploy

### 13.1 Variáveis
| Onde | Variável |
|---|---|
| Vercel / `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `ANON_KEY`, conforme o painel) |
| Supabase secrets | `CRON_SECRET`, `ALLOWED_ORIGIN` (a service role já é injetada nas functions) |
| GitHub secrets | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SUPABASE_FUNCTIONS_URL` |

### 13.2 Desenvolvimento local
- `supabase start` (Docker) sobe Postgres/Auth/Storage locais; `pnpm dev` sobe o front.
- `supabase db reset` aplica migrations + seed. O seed cria modalidades, preços, configurações e 2 usuários de teste locais (`admin@local.test`, `membro@local.test`) **somente no ambiente local**.
- `pnpm gen:types` → `supabase gen types typescript --local > apps/web/src/types/database.ts`.

> Funcionamento e versionamento do CI/CD em detalhe: [ci-cd.md](ci-cd.md).

### 13.3 CI (`ci.yml`, em todo PR)
1. `pnpm install --frozen-lockfile`
2. `pnpm lint` e `pnpm typecheck`
3. `pnpm test` (Vitest: shared + web)
4. `supabase start` → `supabase db reset` → `supabase test db` (pgTAP) → `supabase db lint`
5. Verificar que os tipos gerados estão atualizados (diff vazio)
6. `pnpm build`
7. Playwright (smoke) em viewport mobile e desktop contra o Supabase local

### 13.4 Deploy
- **Front:** integração Git da Vercel (preview em PR, produção na `main`). Root Directory `apps/web`.
- **Banco/functions** (`deploy-supabase.yml`, na `main`): `supabase db push` e `supabase functions deploy`.
- O primeiro admin é criado manualmente no painel do Supabase e promovido via SQL (`update profiles set papel = 'admin' ...`), documentado no README.

---

## 14. Plano de implementação em fases

> Cada fase termina com: CI verde, deploy de preview funcionando e checklist de aceite marcado.

### FASE 0 — Fundação (infra, auth, segurança base)
| ID | Tarefa |
|---|---|
| F0.1 | Monorepo pnpm, tsconfig base strict, ESLint, Prettier, scripts raiz (`dev`, `build`, `test`, `lint`, `typecheck`, `gen:types`) |
| F0.2 | `supabase init`; `config.toml` com signup desabilitado, MFA TOTP habilitado, redirect URLs |
| F0.3 | Migration: tipos enum, `profiles`, `configuracoes`, helpers `eh_admin/eh_ativo/aal2`, trigger `updated_at`, trigger que cria `profiles` ao criar usuário |
| F0.4 | RLS de `profiles` e `configuracoes` + teste pgTAP "toda tabela pública tem RLS" |
| F0.5 | App Vite + React + Tailwind v4 + shadcn/ui; `tokens.css`; tema claro/escuro; fonte Inter |
| F0.6 | Layout responsivo (bottom nav / sidebar), páginas vazias de todas as rotas, guarda de rota e de admin |
| F0.7 | Telas de auth: login, MFA, esqueci/redefinir senha, aceitar convite; logout |
| F0.8 | Edge Function `admin-usuarios` (convidar/desativar/reativar) + tela `/admin/usuarios` |
| F0.9 | `vercel.json` (headers, CSP, rewrites); deploy Vercel + projeto Supabase de produção |
| F0.10 | CI `ci.yml` completo; README com setup |

**Aceite F0:**
- [ ] Não é possível criar conta pela API pública (`signUp` retorna erro).
- [ ] Usuário convidado define a senha e entra; o admin só acessa `/admin` com MFA.
- [ ] Usuário desativado perde a sessão e não lê nada (teste pgTAP + e2e).
- [ ] Headers de segurança presentes na produção (verificados em teste automatizado de resposta).
- [ ] Layout navegável a 360 px e a 1280 px sem rolagem horizontal.

### FASE 1 — Núcleo de apostas
| ID | Tarefa |
|---|---|
| F1.1 | `packages/shared`: `dinheiro.ts`, `combinatoria.ts`, `regras/` (Mega, Lotofácil, Quina), schemas Zod — com testes |
| F1.2 | Migrations: `modalidades`, `modalidade_precos`, `concursos`, `apostas`, `aposta_jogos`, `aposta_concursos`, `participantes`, `anexos` + RLS + triggers (`validar_dezenas`, expansão de teimosinha) + seed |
| F1.3 | pgTAP: usuário A não lê/edita/exclui dados de B em **todas** as tabelas; dezenas inválidas são rejeitadas |
| F1.4 | Componentes `BolaDezena`, `VolanteNumerico`, `MoneyText`, `ModalidadeChip`, `StatusBadge` |
| F1.5 | Formulário de nova/editar aposta (simples, bolão, teimosinha, participantes) |
| F1.6 | Lista com filtros, busca, ordenação e paginação; detalhe; exclusão |
| F1.7 | Dashboard v1: KPIs de gasto (recuperado = 0 até a fase 2) + lista das últimas apostas |

**Aceite F1:**
- [ ] Custo de Mega 7 dezenas = R$ 42,00; Lotofácil 16 = R$ 56,00 (com preços do seed).
- [ ] Bolão do Apêndice A cadastrado manualmente salva os valores exatos (R$ 8,84 + R$ 3,09 = R$ 11,93).
- [ ] Teimosinha de 3 concursos cria 3 linhas em `aposta_concursos`.
- [ ] Filtros por modalidade/tipo/status funcionam e persistem na URL (query string).
- [ ] Testes do pacote shared com cobertura ≥ 90% das linhas.

### FASE 2 — Resultados, conferência, prêmios, rateio e notificações
| ID | Tarefa |
|---|---|
| F2.1 | `conferencia.ts` e `premio.ts` (combinações premiadas, IR, bruto/líquido, maior resto) com testes de tabela |
| F2.2 | Migrations: `conferencias`, `premios`, `premio_divisoes`, `notificacoes` + RLS |
| F2.3 | Edge Function `sync-resultados` (normalização da API, backfill dos necessários, resiliência) |
| F2.4 | Edge Function `conferir-apostas` (idempotente) + notificações |
| F2.5 | Workflow `cron-resultados.yml` |
| F2.6 | UI: resultados, conferência no detalhe da aposta, prêmio com bruto/IR/líquido, tabela de divisão, marcar como resgatado |
| F2.7 | `/simulador-rateio` (bruto ou líquido, cotas, pessoas e pesos) |
| F2.8 | Notificações: sino, lista, Realtime, marcar como lida; job de expiração de prêmios e avisos de prazo |
| F2.9 | Admin: sincronizar agora, log, lançar resultado manual; tela de configurações globais (11.6) |

**Aceite F2:**
- [ ] Teste: jogo Mega de 7 dezenas com 6 acertos gera 1 sena + 6 quinas.
- [ ] Teste: prêmio de R$ 2.259,20 → IR 0; prêmio de R$ 2.259,21 → IR de 30% sobre o total (com a configuração padrão).
- [ ] Teste: R$ 100,00 dividido por pesos 1/1/1 → 33,34 + 33,33 + 33,33 (soma exata).
- [ ] Rodar `conferir-apostas` duas vezes não duplica prêmios nem notificações.
- [ ] Com a API indisponível (mock), o job termina sem erro fatal e o admin consegue lançar o resultado manualmente, disparando a conferência.
- [ ] O membro recebe a notificação em até 5 s com a tela aberta (Realtime).

### FASE 3 — Importação/Exportação (Excel e PDF)
| ID | Tarefa |
|---|---|
| F3.1 | `parsers/planilha.ts` (normalização, agrupamento, validação, mensagens por linha) + testes com planilhas fictícias |
| F3.2 | RPC `importar_apostas(jsonb)` transacional (`security invoker`, valida tudo de novo no banco) |
| F3.3 | UI de importação Excel: upload, prévia, erros, duplicatas, confirmação; download do modelo |
| F3.4 | Exportação `.xlsx`/CSV com filtros (abas Apostas, Prêmios, Resumo); arquivo exportado reimportável |
| F3.5 | `parsers/comprovante-pdf.ts` conforme Apêndice A + testes com a fixture fictícia e variações (quebras de linha, valores com milhar, 1 e 2 dígitos de cota) |
| F3.6 | Extração de texto com pdf.js em Web Worker; seleção múltipla; tela de revisão; hash do código; deduplicação |
| F3.7 (opcional, 3b) | Fallback OCR (tesseract.js, carregado sob demanda) para PDFs sem texto e fotos |

**Aceite F3:**
- [ ] Planilha com 1 linha inválida em 50 → a prévia mostra 49 ok + 1 erro com linha e motivo; ao confirmar, importa as 49 (o usuário escolhe "importar válidas").
- [ ] Exportar → reimportar em conta limpa → mesmos totais.
- [ ] A fixture do Apêndice A gera exatamente: Mega-Sena, bolão, concurso 3070, 8 jogos de 7 dezenas, 1 de 38 cotas, cota nº 35, valor cota 884, tarifa 309, total 1193.
- [ ] Nome e CPF não aparecem em estado persistido, rede (payload do insert) nem logs (teste automatizado inspecionando o payload).
- [ ] Importar o mesmo PDF duas vezes → a segunda é bloqueada como duplicata.

### FASE 4 — Dashboard avançado, calendário, orçamento e métricas do admin
| ID | Tarefa |
|---|---|
| F4.1 | `fn_dashboard` + views; testes SQL de totais |
| F4.2 | Gráficos (11.7), seletor de período, ROI por modalidade/tipo, "valeram a pena", "quase lá" |
| F4.3 | Calendário (11.8) |
| F4.4 | Orçamento: CRUD, barra de progresso, trigger de notificação 80/100% |
| F4.5 | `fn_admin_metricas` + tela de métricas |

**Aceite F4:**
- [ ] Os totais do dashboard batem com a soma manual da lista filtrada (teste e2e com dados semeados).
- [ ] Admin vê agregados de todos; **teste pgTAP prova que o admin não lê `aposta_jogos` de outro usuário**.
- [ ] Membro chamando `fn_admin_metricas` recebe erro 42501.
- [ ] Orçamento de R$ 100 → aposta que leva a R$ 85 gera 1 notificação de 80%; nova aposta até R$ 90 não gera outra.

### FASE 5 — Analisador, anexos, PWA e acabamento
| ID | Tarefa |
|---|---|
| F5.1 | `analisador.ts` + tela (11.10), faixas configuráveis, matriz de sobreposição, cobertura |
| F5.2 | Backfill opcional de histórico de concursos (admin escolhe N) para a frequência |
| F5.3 | Anexos: câmera, compressão WebP, Storage privado, URL assinada, lightbox |
| F5.4 | PWA (manifest, ícones nas cores do produto, cache do shell, modo offline somente leitura; Share Target opcional) |
| F5.5 | Auditoria de acessibilidade (axe no Playwright) e de performance (Lighthouse mobile ≥ 90 em Performance, Acessibilidade e Boas Práticas) |
| F5.6 | Revisão de segurança: checklist da seção 8 inteiro, `supabase db lint`, Security Advisor do painel sem alertas |

**Aceite F5:**
- [ ] Analisador: 3 jogos de Lotofácil mostram distribuição baixos/médios/altos correta e matriz 3×3 de sobreposição.
- [ ] Upload de anexo de 8 MB é comprimido abaixo de 5 MB ou recusado com mensagem clara.
- [ ] Outro usuário não acessa o anexo nem com o caminho exato (teste).
- [ ] App instalável no Android/iOS; abre offline com dados em cache e o aviso.

### FASE 6 — Modalidades adicionais
| ID | Tarefa |
|---|---|
| F6.1 | Dupla Sena (2 sorteios), Dia de Sorte (mês da sorte), Timemania (time do coração), Lotomania (0 acertos premia), Super Sete (colunas), +Milionária (trevos) — uma por PR, cada uma com regra, seed, testes e ajuste do volante |
| F6.2 | Parsers de PDF para outros comprovantes conforme surgirem amostras |

---

## 15. Estratégia de testes
| Nível | Ferramenta | O que cobre |
|---|---|---|
| Unitário | Vitest | todo `packages/shared` (dinheiro, combinatória, regras, conferência, IR, rateio, parsers) — testes de tabela e de propriedade |
| Banco | pgTAP | RLS (isolamento entre usuários, admin limitado, anon sem acesso), constraints, triggers, funções |
| Componentes | Testing Library | volante, formulários, validação, estados vazio/erro |
| E2E | Playwright | login + MFA, nova aposta, importar Excel/PDF, conferência simulada, dashboard; viewports 360×800 e 1280×800 |
| Acessibilidade | @axe-core/playwright | rotas principais sem violações sérias |

Dados de teste: **sempre fictícios**. Nunca commitar comprovantes reais.

---

## 16. Requisitos não funcionais
- **Performance:** LCP < 2,5 s em 4G; bundle inicial < 250 KB gzip (pdf.js, SheetJS, tesseract e Recharts carregados sob demanda com `import()`).
- **Disponibilidade:** dependente dos planos gratuitos; o cron evita a pausa do Supabase.
- **Capacidade:** até 5 usuários e dezenas de milhares de jogos, muito abaixo do limite de 500 MB do banco Free.
- **Backup:** o plano Free não garante backups utilizáveis → botão "Exportar tudo" (Excel) para cada usuário + workflow mensal opcional de `pg_dump` cifrado como artefato privado do GitHub. [PENDÊNCIA opcional P6]
- **Observabilidade:** logs das Edge Functions no painel; tabela `sync_logs` (data, modalidade, status, mensagem) visível no admin.
- **i18n:** só PT-BR, mas textos centralizados em um arquivo por feature.

---

## 17. Riscos
| Risco | Mitigação |
|---|---|
| API da CAIXA (não oficial) mudar ou bloquear | Normalizador isolado + resultado manual pelo admin + `sync_logs` |
| Formato do PDF mudar | Parser por assinatura, tela de revisão obrigatória, testes com fixture |
| Regra de IR/rateio interpretada errada | Configurável + snapshot `regra_ir` no prêmio + prêmio manual |
| Pausa do Supabase Free | Cron 2×/dia |
| Vazamento por RLS mal escrita | pgTAP obrigatório no CI + Security Advisor |
| Limite de e-mail do SMTP padrão | Poucos convites; SMTP próprio se necessário |

---

## 18. Pendências (decidir/validar durante a implementação)
| ID | Pendência | Padrão até decidir |
|---|---|---|
| P1 | O `valorPremio` do rateio da API é bruto ou líquido? Validar com um prêmio real recebido | `bruto` (configurável) |
| P2 | Em bolão, o IR é apurado por cota ou pela aposta inteira? | `cota` (configurável) |
| P3 | Amostras de comprovante de aposta simples e de bolão de Lotofácil/Quina | só o parser do Apêndice A |
| P4 | A API da CAIXA responde a partir do Deno (TLS/headers)? Testar na F2.3 | Local: responde (TLS ok). **Produção (21/10): HTTP 403** a partir das Edge Functions do Supabase, provavelmente bloqueio por IP de nuvem. Mitigações: cabeçalhos de navegador (a confirmar no próximo cron), resultado manual do admin e resultado informado pelo usuário. Se o 403 continuar: avaliar buscar a partir de outro lugar ou fonte alternativa |
| P5 | Limites de bolão (mín. de cotas, valor mínimo) de Lotofácil e Quina | colunas nulas, sem validar |
| P6 | Backup automático mensal | apenas "Exportar tudo" |

---

## Apêndice A — Comprovante de Bolão (formato confirmado)

### A.1 Texto extraído (FIXTURE FICTÍCIA — dados pessoais substituídos)
Ordem e quebras como o pdf.js tende a devolver (rótulos e valores de duas colunas intercalados). Salvar em `packages/shared/test/fixtures/bolao-megasena-01.txt`:

```
Dados da Aposta
ESTE RECIBO PARTICIPA COM 01 COTA DO TOTAL DE 38 COTAS
Validade do prêmio: 90 dias
0000AAAA1111BBBB2222CCCC3333DDDD4444
Loterias
Comprovante de Aposta Bolão Mega-Sena
Nome: FULANO DE TAL
DA SILVA CPF: 000.000.000-00
Data da aposta: 11/10/2026 Subcanal da compra: IOS
Hora da aposta: 15:59:01 Data da compra: 14/10/2026
Valor total da
aposta: R$ 11,93 Hora da compra: 12:53:11
Valor da cota: R$ 8,84 Data do sorteio: 14/10/2026
Valor tarifa de
serviço: R$ 3,09 Código E. Lotérico: 00.000000-0
Modalidade: Mega-Sena Terminal aposta: 00000
Cota: 35/38 Concurso: 3070
Seus Números:
Jogo 1
02 | 09 | 24 | 28 | 44 | 48 | 49
Jogo 2
02 | 06 | 28 | 41 | 44 | 49 | 53
Jogo 3
02 | 15 | 19 | 28 | 44 | 49 | 50
Jogo 4
12 | 14 | 36 | 38 | 44 | 51 | 56
Jogo 5
04 | 06 | 08 | 18 | 25 | 30 | 41
Jogo 6
03 | 06 | 11 | 18 | 30 | 47 | 56
Jogo 7
06 | 13 | 16 | 25 | 26 | 28 | 49
Jogo 8
02 | 14 | 22 | 24 | 35 | 45 | 48
0800 726 0101 4004 0104 0800 104 0104 0800 726 0207 0800 725 7474
SAC(Sugestões, reclamações e elogios) Alô CAIXA:(Regiões Metropolitanas) Alô CAIXA:(Demais
Regiões)
Atendimento CAIXA
Cidadão Ouvidoria
Página: 1 de 1
```

Criar também variações: texto com tudo em uma linha (espaços simples), texto com valores `R$ 1.234,56` e PDF com 2+ páginas de jogos.

### A.2 Regras de extração
Antes: normalizar o texto (NFC, trocar `\u00a0` por espaço, colapsar espaços **dentro** da linha e juntar linhas quebradas de rótulos conhecidos, ex.: `Valor total da\naposta:` → `Valor total da aposta:`).

| Campo | Expressão (referência; flags `i`, `u`) |
|---|---|
| Tipo/Modalidade (título) | `/Comprovante de Aposta\s+(Bol[aã]o\s+)?(.+?)\s*$/m` → bolão se o grupo 1 existir |
| Modalidade (campo) | `/Modalidade:\s*(.+?)(?=\s+Terminal aposta:|\s*$)/m` |
| Concurso | `/Concurso:\s*(\d+)/` |
| Cota nº/total | `/Cota:\s*(\d+)\s*\/\s*(\d+)/` |
| Cotas do recibo | `/PARTICIPA COM\s+(\d+)\s+COTAS?\s+DO TOTAL DE\s+(\d+)\s+COTAS/` |
| Valor total | `/Valor total da aposta:\s*R\$\s*([\d.]+,\d{2})/` |
| Valor da cota | `/Valor da cota:\s*R\$\s*([\d.]+,\d{2})/` |
| Tarifa | `/Valor tarifa de servi[cç]o:\s*R\$\s*([\d.]+,\d{2})/` |
| Data da aposta | `/Data da aposta:\s*(\d{2}\/\d{2}\/\d{4})/` |
| Data da compra | `/Data da compra:\s*(\d{2}\/\d{2}\/\d{4})/` |
| Hora da compra | `/Hora da compra:\s*(\d{2}:\d{2}:\d{2})/` |
| Data do sorteio | `/Data do sorteio:\s*(\d{2}\/\d{2}\/\d{4})/` |
| Canal | `/Subcanal da compra:\s*(\S+)/` |
| Jogos | `/Jogo\s+(\d+)\s+((?:\d{1,2}\s*\|\s*)+\d{1,2})/g` → `split('|')`, `parseInt`, ordenar |
| Código do recibo | `/^\s*([0-9A-F]{32,40})\s*$/m` → apenas `SHA-256` |
| **Ignorar** | `Nome:`, `CPF:`, `Código E. Lotérico:`, `Terminal aposta:` |

Mapeamento do nome da modalidade → slug: normalizar (sem acento, minúsculo, sem espaço/hífen): `megasena`, `lotofacil`, `quina`, `duplasena`, `lotomania`, `timemania`, `diadesorte`, `supersete`, `maismilionaria` (`+Milionária`).

### A.3 Validações do comprovante
| Regra | Tipo |
|---|---|
| Modalidade reconhecida e concurso > 0 | erro |
| Pelo menos 1 jogo; todos com a mesma quantidade de dezenas (regra de bolão) | erro |
| Dezenas únicas, no universo e dentro de min/max da modalidade | erro |
| `cota + tarifa == total` (tolerância de 1 centavo) | erro |
| `tarifa ≤ 35% × cota` (+1 centavo de tolerância) | aviso |
| `cotas_recibo ≤ total_cotas` e `numero_cota ≤ total_cotas` | erro |
| `|valor_cota × total_cotas − Σ custoJogo| ≤ total_cotas` centavos (arredondamento da cota) | aviso ("valor da cota não bate com o preço vigente"), com o preço da data da compra |
| Data do sorteio ≥ data da compra | aviso |
| Hash já importado pelo usuário | bloqueio (duplicata) |

**Verificação com a fixture:** 8 jogos × C(7,6) × R$ 6,00 = R$ 336,00; R$ 8,84 × 38 = R$ 335,92 → diferença de 8 centavos ≤ 38 → **ok**. Tarifa 3,09 / 8,84 = 34,95% → **ok**.

### A.4 Saída esperada do parser (fixture)
```json
{
  "tipo": "bolao",
  "modalidadeSlug": "megasena",
  "concurso": 3070,
  "dataSorteio": "2026-10-14",
  "dataCompra": "2026-10-14",
  "horaCompra": "12:53:11",
  "dataApostaRecibo": "2026-10-11",
  "canal": "IOS",
  "valorTotalCentavos": 1193,
  "valorCotaCentavos": 884,
  "tarifaCentavos": 309,
  "bolaoNumeroCota": 35,
  "bolaoTotalCotas": 38,
  "bolaoCotasUsuario": 1,
  "jogos": [
    [2, 9, 24, 28, 44, 48, 49],
    [2, 6, 28, 41, 44, 49, 53],
    [2, 15, 19, 28, 44, 49, 50],
    [12, 14, 36, 38, 44, 51, 56],
    [4, 6, 8, 18, 25, 30, 41],
    [3, 6, 11, 18, 30, 47, 56],
    [6, 13, 16, 25, 26, 28, 49],
    [2, 14, 22, 24, 35, 45, 48]
  ],
  "codigoReciboHash": "<sha256 de 0000AAAA1111BBBB2222CCCC3333DDDD4444>",
  "avisos": [],
  "erros": []
}
```
A saída **não contém** nome nem CPF (há um teste que garante isso).

---

## Apêndice B — Referência da API de resultados (a confirmar na F2.3)
- `GET https://servicebus2.caixa.gov.br/portaldeloterias/api/{slug}` → último concurso.
- `GET https://servicebus2.caixa.gov.br/portaldeloterias/api/{slug}/{numero}` → concurso específico.
- Campos esperados (validar com Zod e mapear): `numero`, `dataApuracao` (dd/mm/aaaa), `listaDezenas` (strings), `listaRateioPremio[] { faixa, descricaoFaixa, numeroDeGanhadores, valorPremio }`, `acumulado`, `dataProximoConcurso`, `valorEstimadoProximoConcurso`.
- Os nomes dos campos **devem ser confirmados** com uma chamada real antes de escrever o normalizador; qualquer diferença atualiza este apêndice.

---

## Apêndice C — Checklist de segurança (revisar na F5.6)
- [ ] Signup público desabilitado e testado
- [ ] RLS em 100% das tabelas `public`; pgTAP de isolamento verde
- [ ] Nenhuma política para `anon`
- [ ] Funções `security definer` com `search_path = ''` e checagem de papel + `aal2`
- [ ] Service role apenas em functions; nenhuma chave secreta no bundle (`grep` no `dist/` no CI)
- [ ] Bucket privado + políticas por pasta + URL assinada curta
- [ ] CSP/HSTS/nosniff/frame-ancestors na produção
- [ ] Nome/CPF nunca persistidos; código do recibo só como hash
- [ ] MFA obrigatório para admin
- [ ] Usuário desativado sem acesso e com sessões revogadas
- [ ] Security Advisor e Performance Advisor do Supabase sem alertas
