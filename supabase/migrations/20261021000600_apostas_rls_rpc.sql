-- F1.2 (parte 3) — RLS das tabelas do usuário, view de resumo e RPC transacional.

-- ---------------------------------------------------------------------------
-- RLS — padrão "dono" (seção 8.2)
-- ---------------------------------------------------------------------------
alter table public.apostas enable row level security;
alter table public.aposta_jogos enable row level security;
alter table public.aposta_concursos enable row level security;
alter table public.participantes enable row level security;
alter table public.anexos enable row level security;

create policy "dono_select" on public.apostas for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_insert" on public.apostas for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_update" on public.apostas for update to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo())
  with check (user_id = (select auth.uid()));
create policy "dono_delete" on public.apostas for delete to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());

-- Tabelas filhas: além do user_id, a aposta pai precisa ser do usuário.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['aposta_jogos', 'participantes', 'anexos'] loop
    execute format($f$
      create policy "dono_select" on public.%1$I for select to authenticated
        using (user_id = (select auth.uid()) and public.eh_ativo());
      create policy "dono_insert" on public.%1$I for insert to authenticated
        with check (user_id = (select auth.uid()) and public.eh_ativo()
          and exists (select 1 from public.apostas a where a.id = aposta_id and a.user_id = (select auth.uid())));
      create policy "dono_update" on public.%1$I for update to authenticated
        using (user_id = (select auth.uid()) and public.eh_ativo())
        with check (user_id = (select auth.uid())
          and exists (select 1 from public.apostas a where a.id = aposta_id and a.user_id = (select auth.uid())));
      create policy "dono_delete" on public.%1$I for delete to authenticated
        using (user_id = (select auth.uid()) and public.eh_ativo());
    $f$, v_tabela);
  end loop;
end $$;

-- aposta_concursos é mantida só pelo trigger (security definer): o dono apenas lê.
create policy "dono_select" on public.aposta_concursos for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());

grant select, insert, update, delete on public.apostas, public.aposta_jogos, public.participantes to authenticated;
grant select, insert, delete on public.anexos to authenticated;
grant select on public.aposta_concursos to authenticated;
grant all on public.apostas, public.aposta_jogos, public.aposta_concursos, public.participantes, public.anexos
  to service_role;

-- ---------------------------------------------------------------------------
-- Resumo por aposta (security_invoker: respeita a RLS de quem consulta)
-- ---------------------------------------------------------------------------
-- Parte do usuário no gasto quando há participantes (seção 7.3):
--   contribuições informadas → contribuição do usuário
--   senão                    → valor_pago × peso_usuario / Σ pesos (half-up)
-- recuperado_usuario e melhor_acerto passam a vir de premios/conferencias na fase 2.
create view public.vw_apostas_resumo
with (security_invoker = true) as
with divisao as (
  select
    p.aposta_id,
    count(*) as qtd_participantes,
    bool_and(p.contribuicao_centavos is not null) as tem_contribuicoes,
    sum(p.peso) as soma_pesos,
    max(p.peso) filter (where p.eh_usuario) as peso_usuario,
    max(p.contribuicao_centavos) filter (where p.eh_usuario) as contribuicao_usuario
  from public.participantes p
  group by p.aposta_id
),
jogos as (
  select aposta_id, count(*) as qtd_jogos, max(cardinality(dezenas)) as max_dezenas
  from public.aposta_jogos
  group by aposta_id
),
base as (
  select
    a.*,
    m.slug as modalidade_slug,
    m.nome as modalidade_nome,
    m.cor_hex as modalidade_cor,
    a.concurso_inicial + a.qtd_concursos - 1 as concurso_final,
    coalesce(j.qtd_jogos, 0)::int as qtd_jogos,
    j.max_dezenas,
    coalesce(d.qtd_participantes, 0)::int as qtd_participantes,
    case
      when d.aposta_id is null then a.valor_pago_centavos
      when d.tem_contribuicoes then d.contribuicao_usuario
      else round(a.valor_pago_centavos * d.peso_usuario / d.soma_pesos)::bigint
    end as gasto_usuario_centavos,
    0::bigint as recuperado_usuario_centavos,
    null::smallint as melhor_acerto
  from public.apostas a
  join public.modalidades m on m.id = a.modalidade_id
  left join jogos j on j.aposta_id = a.id
  left join divisao d on d.aposta_id = a.id
)
select
  base.*,
  (recuperado_usuario_centavos - gasto_usuario_centavos) as saldo_centavos
from base;

grant select on public.vw_apostas_resumo to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: salvar aposta (cria ou edita) em UMA transação
-- ---------------------------------------------------------------------------
-- security invoker: roda com a RLS do usuário; constraints e triggers validam tudo.
-- p_aposta (snake_case):
--   { modalidade_slug, tipo, origem?, concurso_inicial, qtd_concursos, data_aposta,
--     bolao_total_cotas?, bolao_cotas_usuario?, bolao_numero_cota?, valor_cota_centavos?, tarifa_centavos?,
--     valor_pago_centavos, comprovante_hash?, local_compra?, observacao?,
--     jogos: [[2, 9, 24, ...], ...],
--     participantes: [{ nome, peso, eh_usuario, contribuicao_centavos? }, ...] }
create function public.salvar_aposta(p_aposta jsonb, p_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_modalidade_id smallint;
  v_jogo jsonb;
  v_ordem int := 0;
  v_part jsonb;
begin
  select id into v_modalidade_id from public.modalidades
  where slug = p_aposta->>'modalidade_slug' and ativa;
  if v_modalidade_id is null then
    raise exception 'Modalidade inválida' using errcode = '22023';
  end if;

  if jsonb_typeof(p_aposta->'jogos') <> 'array' or jsonb_array_length(p_aposta->'jogos') = 0 then
    raise exception 'Adicione pelo menos um jogo' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.apostas (
      modalidade_id, tipo, origem, concurso_inicial, qtd_concursos, data_aposta,
      bolao_total_cotas, bolao_cotas_usuario, bolao_numero_cota, valor_cota_centavos, tarifa_centavos,
      valor_pago_centavos, comprovante_hash, local_compra, observacao
    ) values (
      v_modalidade_id,
      (p_aposta->>'tipo')::public.tipo_aposta,
      coalesce((p_aposta->>'origem')::public.origem_aposta, 'manual'),
      (p_aposta->>'concurso_inicial')::int,
      coalesce((p_aposta->>'qtd_concursos')::smallint, 1),
      (p_aposta->>'data_aposta')::date,
      (p_aposta->>'bolao_total_cotas')::smallint,
      (p_aposta->>'bolao_cotas_usuario')::smallint,
      (p_aposta->>'bolao_numero_cota')::smallint,
      (p_aposta->>'valor_cota_centavos')::bigint,
      coalesce((p_aposta->>'tarifa_centavos')::bigint, 0),
      (p_aposta->>'valor_pago_centavos')::bigint,
      nullif(p_aposta->>'comprovante_hash', ''),
      nullif(trim(p_aposta->>'local_compra'), ''),
      nullif(trim(p_aposta->>'observacao'), '')
    )
    returning id into v_id;
  else
    update public.apostas set
      modalidade_id = v_modalidade_id,
      tipo = (p_aposta->>'tipo')::public.tipo_aposta,
      concurso_inicial = (p_aposta->>'concurso_inicial')::int,
      qtd_concursos = coalesce((p_aposta->>'qtd_concursos')::smallint, 1),
      data_aposta = (p_aposta->>'data_aposta')::date,
      bolao_total_cotas = (p_aposta->>'bolao_total_cotas')::smallint,
      bolao_cotas_usuario = (p_aposta->>'bolao_cotas_usuario')::smallint,
      bolao_numero_cota = (p_aposta->>'bolao_numero_cota')::smallint,
      valor_cota_centavos = (p_aposta->>'valor_cota_centavos')::bigint,
      tarifa_centavos = coalesce((p_aposta->>'tarifa_centavos')::bigint, 0),
      valor_pago_centavos = (p_aposta->>'valor_pago_centavos')::bigint,
      local_compra = nullif(trim(p_aposta->>'local_compra'), ''),
      observacao = nullif(trim(p_aposta->>'observacao'), ''),
      -- Editar refaz a conferência (fase 2): volta a aguardar.
      status = 'aguardando'
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Aposta não encontrada' using errcode = 'P0002';
    end if;

    -- Jogos e participantes são regravados por inteiro.
    delete from public.aposta_jogos where aposta_id = v_id;
    delete from public.participantes where aposta_id = v_id;
  end if;

  for v_jogo in select * from jsonb_array_elements(p_aposta->'jogos') loop
    v_ordem := v_ordem + 1;
    insert into public.aposta_jogos (aposta_id, ordem, dezenas)
    values (v_id, v_ordem, array(select (jsonb_array_elements_text(v_jogo))::smallint));
  end loop;

  v_ordem := 0;
  for v_part in select * from jsonb_array_elements(coalesce(p_aposta->'participantes', '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    insert into public.participantes (aposta_id, nome, peso, eh_usuario, contribuicao_centavos, ordem)
    values (
      v_id,
      trim(v_part->>'nome'),
      coalesce((v_part->>'peso')::numeric, 1),
      coalesce((v_part->>'eh_usuario')::boolean, false),
      (v_part->>'contribuicao_centavos')::bigint,
      v_ordem
    );
  end loop;

  return v_id;
end $$;

revoke all on function public.salvar_aposta(jsonb, uuid) from public, anon;
grant execute on function public.salvar_aposta(jsonb, uuid) to authenticated;
