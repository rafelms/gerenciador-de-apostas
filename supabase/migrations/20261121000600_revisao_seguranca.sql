-- F5.6 — Revisão de segurança (seção 8.2, Apêndice C; Security Advisor do Supabase).

-- 1) Os helpers das políticas (eh_ativo, eh_admin, aal2) saem do schema public, que a API
--    expõe como /rest/v1/rpc. No schema `privado` (fora de `api.schemas`) eles continuam
--    servindo às políticas, que guardam a referência pela função e não pelo nome.
--    Daqui em diante, políticas e funções novas usam privado.eh_ativo() etc.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

alter function public.eh_ativo() set schema privado;
alter function public.eh_admin() set schema privado;
alter function public.aal2() set schema privado;

revoke execute on function privado.eh_ativo(), privado.eh_admin(), privado.aal2()
  from public, anon;
grant execute on function privado.eh_ativo(), privado.eh_admin(), privado.aal2()
  to authenticated, service_role;

-- O corpo em plpgsql guarda o nome como texto: as 3 funções que chamam os helpers
-- são recriadas apontando para o schema novo (o resto fica igual).
CREATE OR REPLACE FUNCTION public.fn_admin_listar_usuarios()
 RETURNS TABLE(id uuid, nome text, email text, papel papel_usuario, ativo boolean, ultimo_acesso timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (privado.eh_admin() and privado.aal2()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  return query
    select p.id, p.nome, u.email::text, p.papel, p.ativo, u.last_sign_in_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end $function$
;
CREATE OR REPLACE FUNCTION public.fn_admin_metricas(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, nome text, qtd_apostas integer, gasto_centavos bigint, recuperado_centavos bigint, saldo_centavos bigint, roi numeric, ultima_aposta date, por_modalidade jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (privado.eh_admin() and privado.aal2()) then
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
end $function$
;
CREATE OR REPLACE FUNCTION public.fn_marcar_resgatado(p_premio_id uuid, p_resgatado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.premios set
    status = case
      when p_resgatado then 'resgatado'::public.status_premio
      when prazo_resgate < v_hoje then 'expirado'::public.status_premio
      else 'a_resgatar'::public.status_premio
    end,
    resgatado_em = case when p_resgatado then coalesce(resgatado_em, v_hoje) end
  where id = p_premio_id and user_id = (select auth.uid()) and privado.eh_ativo();
  if not found then
    raise exception 'Prêmio não encontrado' using errcode = 'P0002';
  end if;
end $function$
;

-- 2) Nenhuma função do schema public fica executável por anon. O Postgres dá EXECUTE a
--    PUBLIC por padrão; aqui ele sai de PUBLIC/anon e fica explícito para authenticated e
--    service_role (as funções também rodam dentro de triggers, com os privilégios de quem
--    escreve). Funções de trigger não são chamáveis direto: ficam sem grant nenhum.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.prorettype = 'trigger'::regtype as gatilho
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'execute')
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
  loop
    if f.gatilho then
      execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
      execute format('revoke execute on function %s from public, anon', f.assinatura);
    end if;
  end loop;
end $$;

-- E as próximas funções já nascem sem EXECUTE para PUBLIC/anon.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- 3) Chaves estrangeiras sem índice (Performance Advisor).
create index if not exists orcamentos_modalidade_id_idx on public.orcamentos (modalidade_id);
create index if not exists premio_divisoes_participante_id_idx
  on public.premio_divisoes (participante_id);
create index if not exists premios_concurso_id_idx on public.premios (concurso_id);
create index if not exists sync_logs_modalidade_id_idx on public.sync_logs (modalidade_id);
