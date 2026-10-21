-- F1.2 (parte 1) — Catálogo de modalidades, preços com vigência e concursos.

-- ---------------------------------------------------------------------------
-- Modalidades
-- ---------------------------------------------------------------------------
create table public.modalidades (
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
  cor_hex text check (cor_hex ~ '^#[0-9A-Fa-f]{6}$'),
  ativa boolean not null default true,
  check (universo_min < universo_max),
  check (min_marcadas between 1 and max_marcadas),
  check (bolao_min_cotas is null or bolao_max_cotas is null or bolao_min_cotas <= bolao_max_cotas)
);

create table public.modalidade_precos (
  id serial primary key,
  modalidade_id smallint not null references public.modalidades(id),
  preco_simples_centavos bigint not null check (preco_simples_centavos > 0),
  vigente_desde date not null,
  unique (modalidade_id, vigente_desde)
);

-- Dados do MVP — conferidos no site da CAIXA em 21/10/2026.
-- Ficam na migration (e não no seed) porque a produção também precisa deles.
-- Bolão: Lotofácil 2–100 e Quina 2–50 cotas (o máximo real varia com o nº de dezenas; ver pendência P5).
insert into public.modalidades
  (slug, nome, universo_min, universo_max, qtd_sorteadas, base_aposta, min_marcadas, max_marcadas,
   faixas, bolao_min_cotas, bolao_max_cotas, cor_hex)
values
  ('megasena', 'Mega-Sena', 1, 60, 6, 6, 6, 20,
   '[{"acertos":6,"nome":"Sena"},{"acertos":5,"nome":"Quina"},{"acertos":4,"nome":"Quadra"}]', 2, 100, '#209869'),
  ('lotofacil', 'Lotofácil', 1, 25, 15, 15, 15, 20,
   '[{"acertos":15,"nome":"15 acertos"},{"acertos":14,"nome":"14 acertos"},{"acertos":13,"nome":"13 acertos"},{"acertos":12,"nome":"12 acertos"},{"acertos":11,"nome":"11 acertos"}]', 2, 100, '#930089'),
  ('quina', 'Quina', 1, 80, 5, 5, 5, 15,
   '[{"acertos":5,"nome":"Quina"},{"acertos":4,"nome":"Quadra"},{"acertos":3,"nome":"Terno"},{"acertos":2,"nome":"Duque"}]', 2, 50, '#260085');

-- Preços vigentes desde 09/07/2025 (último reajuste conhecido).
insert into public.modalidade_precos (modalidade_id, preco_simples_centavos, vigente_desde)
select id, preco, date '2025-07-09'
from public.modalidades m
join (values ('megasena', 600), ('lotofacil', 350), ('quina', 300)) as p(slug, preco) using (slug);

-- Preço da aposta simples vigente numa data (a CAIXA reajusta periodicamente).
create function public.fn_preco_vigente(p_modalidade_id smallint, p_data date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select preco_simples_centavos
  from public.modalidade_precos
  where modalidade_id = p_modalidade_id and vigente_desde <= p_data
  order by vigente_desde desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Concursos (resultados oficiais)
-- ---------------------------------------------------------------------------
create table public.concursos (
  id bigserial primary key,
  modalidade_id smallint not null references public.modalidades(id),
  numero int not null check (numero > 0),
  data_sorteio date not null,
  dezenas smallint[],                        -- null enquanto não sorteado
  rateio jsonb,                              -- [{ "acertos": 6, "ganhadores": 0, "valor_centavos": 0 }, ...]
  acumulado boolean,
  data_proximo date,
  valor_estimado_proximo_centavos bigint,
  fonte text not null default 'api_caixa' check (fonte in ('api_caixa', 'manual')),
  sincronizado_em timestamptz,
  unique (modalidade_id, numero)
);

-- ---------------------------------------------------------------------------
-- RLS: leitura para qualquer autenticado ativo; escrita só admin com MFA
-- (a service role das Edge Functions ignora RLS).
-- ---------------------------------------------------------------------------
alter table public.modalidades enable row level security;
alter table public.modalidade_precos enable row level security;
alter table public.concursos enable row level security;

create policy "autenticado_select" on public.modalidades for select to authenticated using (public.eh_ativo());
create policy "admin_insert" on public.modalidades for insert to authenticated with check (public.eh_admin() and public.aal2());
create policy "admin_update" on public.modalidades for update to authenticated
  using (public.eh_admin() and public.aal2()) with check (public.eh_admin() and public.aal2());

create policy "autenticado_select" on public.modalidade_precos for select to authenticated using (public.eh_ativo());
create policy "admin_insert" on public.modalidade_precos for insert to authenticated with check (public.eh_admin() and public.aal2());
create policy "admin_update" on public.modalidade_precos for update to authenticated
  using (public.eh_admin() and public.aal2()) with check (public.eh_admin() and public.aal2());

create policy "autenticado_select" on public.concursos for select to authenticated using (public.eh_ativo());
create policy "admin_insert" on public.concursos for insert to authenticated with check (public.eh_admin() and public.aal2());
create policy "admin_update" on public.concursos for update to authenticated
  using (public.eh_admin() and public.aal2()) with check (public.eh_admin() and public.aal2());

grant select, insert, update on public.modalidades, public.modalidade_precos, public.concursos to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on public.modalidades, public.modalidade_precos, public.concursos to service_role;
grant usage on all sequences in schema public to service_role;
grant execute on function public.fn_preco_vigente(smallint, date) to authenticated, service_role;
