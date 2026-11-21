-- Aba "Mega da Virada": lista de apostas a fazer para um concurso, com marca de "feita".
-- As apostas já registradas no app vêm da lista normal; aqui fica só o planejamento.

create table public.virada_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  concurso integer not null check (concurso > 0),
  descricao text not null check (char_length(btrim(descricao)) between 1 and 120),
  valor_previsto_centavos bigint check (valor_previsto_centavos between 0 and 100000000),
  feito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.virada_itens (user_id, concurso, created_at);

create trigger virada_itens_updated_at
  before update on public.virada_itens
  for each row execute function public.set_updated_at();

alter table public.virada_itens enable row level security;
create policy "dono_select" on public.virada_itens for select to authenticated
  using (user_id = (select auth.uid()) and privado.eh_ativo());
create policy "dono_insert" on public.virada_itens for insert to authenticated
  with check (user_id = (select auth.uid()) and privado.eh_ativo());
create policy "dono_update" on public.virada_itens for update to authenticated
  using (user_id = (select auth.uid()) and privado.eh_ativo())
  with check (user_id = (select auth.uid()));
create policy "dono_delete" on public.virada_itens for delete to authenticated
  using (user_id = (select auth.uid()) and privado.eh_ativo());

grant select, insert, delete on public.virada_itens to authenticated;
grant update (descricao, valor_previsto_centavos, feito) on public.virada_itens to authenticated;
grant all on public.virada_itens to service_role;
