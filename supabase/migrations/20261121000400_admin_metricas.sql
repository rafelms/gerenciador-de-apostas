-- F4.5 — Métricas do admin (seção 8.3): SOMENTE agregados por usuário.
-- Security definer (lê sem RLS), por isso a checagem de admin + MFA vem primeiro e o
-- retorno nunca inclui dezenas, observações, participantes nem anexos.
-- Mesma regra do dashboard: parte do usuário (vw_apostas_resumo), pela data da aposta.

create function public.fn_admin_metricas(p_inicio date default null, p_fim date default null)
returns table (
  user_id uuid,
  nome text,
  qtd_apostas int,
  gasto_centavos bigint,
  recuperado_centavos bigint,
  saldo_centavos bigint,
  roi numeric,
  ultima_aposta date,
  por_modalidade jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.eh_admin() and public.aal2()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  return query
    with filtradas as (
      select v.user_id, v.modalidade_id, v.modalidade_slug, v.modalidade_nome, v.modalidade_cor,
             v.data_aposta, v.gasto_usuario_centavos, v.recuperado_usuario_centavos
      from public.vw_apostas_resumo v
      where (p_inicio is null or v.data_aposta >= p_inicio)
        and (p_fim is null or v.data_aposta <= p_fim)
    ),
    por_mod as (
      select f.user_id,
             jsonb_agg(jsonb_build_object(
               'slug', f.modalidade_slug, 'nome', f.modalidade_nome, 'cor', f.modalidade_cor,
               'qtd', f.qtd, 'gasto', f.gasto, 'recuperado', f.recuperado
             ) order by f.gasto desc, f.modalidade_nome) as itens
      from (
        select x.user_id, x.modalidade_slug, x.modalidade_nome, x.modalidade_cor,
               count(*)::int as qtd,
               sum(x.gasto_usuario_centavos)::bigint as gasto,
               sum(x.recuperado_usuario_centavos)::bigint as recuperado
        from filtradas x
        group by x.user_id, x.modalidade_slug, x.modalidade_nome, x.modalidade_cor
      ) f
      group by f.user_id
    ),
    totais as (
      select f.user_id,
             count(*)::int as qtd,
             sum(f.gasto_usuario_centavos)::bigint as gasto,
             sum(f.recuperado_usuario_centavos)::bigint as recuperado,
             max(f.data_aposta) as ultima
      from filtradas f
      group by f.user_id
    )
    select p.id,
           p.nome,
           coalesce(t.qtd, 0),
           coalesce(t.gasto, 0::bigint),
           coalesce(t.recuperado, 0::bigint),
           coalesce(t.recuperado, 0::bigint) - coalesce(t.gasto, 0::bigint),
           case when coalesce(t.gasto, 0) > 0
                then round((t.recuperado - t.gasto)::numeric / t.gasto, 4) end,
           t.ultima,
           coalesce(pm.itens, '[]'::jsonb)
    from public.profiles p
    left join totais t on t.user_id = p.id
    left join por_mod pm on pm.user_id = p.id
    order by coalesce(t.gasto, 0) desc, p.nome;
end $$;

revoke all on function public.fn_admin_metricas(date, date) from public, anon;
grant execute on function public.fn_admin_metricas(date, date) to authenticated;
