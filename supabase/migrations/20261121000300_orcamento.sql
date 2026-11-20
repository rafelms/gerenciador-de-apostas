-- F4.4 — Orçamento mensal (seção 11.9): limite geral e, opcionalmente, por modalidade.
-- Avisa (nunca bloqueia) ao chegar a 80% e a 100%, com notificação interna sem duplicar.

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),      -- 1º dia do mês
  limite_centavos bigint not null check (limite_centavos between 1 and 100000000),
  modalidade_id smallint references public.modalidades(id), -- null = geral
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, mes, modalidade_id)
);
create index on public.orcamentos (user_id, mes);

create trigger orcamentos_updated_at
  before update on public.orcamentos
  for each row execute function public.set_updated_at();

alter table public.orcamentos enable row level security;
create policy "dono_select" on public.orcamentos for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_insert" on public.orcamentos for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_update" on public.orcamentos for update to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo())
  with check (user_id = (select auth.uid()));
create policy "dono_delete" on public.orcamentos for delete to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());

grant select, insert, delete on public.orcamentos to authenticated;
grant update (limite_centavos) on public.orcamentos to authenticated;
grant all on public.orcamentos to service_role;

-- "R$ 1.234,56" (texto de notificação; o app formata o resto na borda).
create function public.formatar_brl(p_centavos bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(p_centavos / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- ---------------------------------------------------------------------------
-- Gasto do mês por orçamento (security invoker: a RLS de quem consulta)
-- ---------------------------------------------------------------------------
-- Mesma regra da lista e do dashboard: parte do usuário, pela data da aposta.
create function public.fn_orcamento_mes(p_mes date)
returns table (
  id uuid,
  modalidade_id smallint,
  modalidade_slug text,
  modalidade_nome text,
  modalidade_cor text,
  limite_centavos bigint,
  gasto_centavos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.modalidade_id, m.slug, m.nome, m.cor_hex, o.limite_centavos,
         coalesce((
           select sum(v.gasto_usuario_centavos)
           from public.vw_apostas_resumo v
           where v.data_aposta >= o.mes and v.data_aposta < (o.mes + interval '1 month')
             and (o.modalidade_id is null or v.modalidade_id = o.modalidade_id)
         ), 0)::bigint
  from public.orcamentos o
  left join public.modalidades m on m.id = o.modalidade_id
  where o.mes = date_trunc('month', p_mes)::date
  order by o.modalidade_id nulls first, m.nome
$$;
revoke all on function public.fn_orcamento_mes(date) from public, anon;
grant execute on function public.fn_orcamento_mes(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Alerta de 80% / 100% ao registrar aposta
-- ---------------------------------------------------------------------------
-- Gatilho de restrição adiado: roda no fim da transação, depois que salvar_aposta
-- gravou os participantes (a parte do usuário depende deles). Chave de deduplicação
-- 'orcamento:{aaaa-mm}:{modalidade_id|geral}:{80|100}': cada nível avisa uma vez por mês.
create function public.fn_alerta_orcamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', new.data_aposta)::date;
  v_orc record;
  v_gasto bigint;
  v_nivel int;
  v_onde text;
  v_meses text[] := array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
                          'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
begin
  -- A aposta pode ter sido excluída na mesma transação.
  if not exists (select 1 from public.apostas a where a.id = new.id) then
    return null;
  end if;

  for v_orc in
    select o.*, m.nome as modalidade_nome
    from public.orcamentos o
    left join public.modalidades m on m.id = o.modalidade_id
    where o.user_id = new.user_id and o.mes = v_mes
      and (o.modalidade_id is null or o.modalidade_id = new.modalidade_id)
  loop
    -- Dono da função lê sem RLS: o filtro por user_id é obrigatório.
    select coalesce(sum(v.gasto_usuario_centavos), 0) into v_gasto
    from public.vw_apostas_resumo v
    where v.user_id = new.user_id
      and v.data_aposta >= v_mes and v.data_aposta < (v_mes + interval '1 month')
      and (v_orc.modalidade_id is null or v.modalidade_id = v_orc.modalidade_id);

    v_nivel := case
      when v_gasto >= v_orc.limite_centavos then 100
      when v_gasto * 100 >= v_orc.limite_centavos * 80 then 80
    end;
    continue when v_nivel is null;

    v_onde := coalesce('de ' || v_orc.modalidade_nome, 'geral');
    insert into public.notificacoes (user_id, tipo, titulo, corpo, link, chave_dedup)
    values (
      new.user_id,
      'orcamento',
      case v_nivel
        when 100 then format('Orçamento %s de %s atingido', v_onde, v_meses[extract(month from v_mes)])
        else format('Você usou 80%% do orçamento %s de %s', v_onde, v_meses[extract(month from v_mes)])
      end,
      format('Você usou %s de %s este mês. É só um aviso: nada foi bloqueado.',
             public.formatar_brl(v_gasto), public.formatar_brl(v_orc.limite_centavos)),
      '/orcamento',
      format('orcamento:%s:%s:%s', to_char(v_mes, 'YYYY-MM'),
             coalesce(v_orc.modalidade_id::text, 'geral'), v_nivel)
    )
    on conflict (user_id, chave_dedup) do nothing;
  end loop;
  return null;
end $$;
revoke all on function public.fn_alerta_orcamento() from public, anon, authenticated;

create constraint trigger apostas_alerta_orcamento
  after insert or update of valor_pago_centavos, data_aposta, modalidade_id on public.apostas
  deferrable initially deferred
  for each row execute function public.fn_alerta_orcamento();
