-- F0.4 — RLS de profiles e configuracoes.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- O membro só lê o próprio perfil. A lista de usuários do admin vem de
-- fn_admin_listar_usuarios() (security definer), nunca de uma política aberta.
create policy "dono_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) and public.eh_ativo());

create policy "dono_update" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.eh_ativo())
  with check (id = (select auth.uid()));

-- GRANT por coluna: o usuário só altera nome e preferências.
-- papel e ativo ficam protegidos (só service role / funções do admin mudam).
grant select on public.profiles to authenticated;
grant update (nome, preferencias) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- configuracoes
-- ---------------------------------------------------------------------------
alter table public.configuracoes enable row level security;

create policy "autenticado_select" on public.configuracoes for select to authenticated
  using (public.eh_ativo());

create policy "admin_update" on public.configuracoes for update to authenticated
  using (public.eh_admin() and public.aal2())
  with check (public.eh_admin() and public.aal2());

grant select on public.configuracoes to authenticated;
grant update (aliquota_ir_bps, limite_isencao_ir_centavos, base_calculo_ir,
              valor_rateio_api_eh, prazo_resgate_dias) on public.configuracoes to authenticated;
grant all on public.configuracoes to service_role;

-- ---------------------------------------------------------------------------
-- Lista de usuários para o admin (somente dados cadastrais, nunca apostas)
-- ---------------------------------------------------------------------------
create function public.fn_admin_listar_usuarios()
returns table (id uuid, nome text, email text, papel public.papel_usuario, ativo boolean,
               ultimo_acesso timestamptz, created_at timestamptz)
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
    select p.id, p.nome, u.email::text, p.papel, p.ativo, u.last_sign_in_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end $$;

revoke all on function public.fn_admin_listar_usuarios() from public, anon;
grant execute on function public.fn_admin_listar_usuarios() to authenticated;
