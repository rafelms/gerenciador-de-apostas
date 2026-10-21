-- F0.8 — Suporte à Edge Function admin-usuarios.

-- ---------------------------------------------------------------------------
-- Limite simples de taxa por usuário nas functions de admin (seção 8.8)
-- ---------------------------------------------------------------------------
create table public.admin_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  janela timestamptz not null,          -- início do minuto
  contador int not null default 0,
  primary key (user_id, janela)
);

alter table public.admin_rate_limits enable row level security;

-- Só a service role (Edge Function) mexe aqui. A política existe para deixar
-- explícito o acesso; usuários autenticados não têm GRANT nesta tabela.
create policy "somente_service_role" on public.admin_rate_limits for all to service_role
  using (true) with check (true);

grant all on public.admin_rate_limits to service_role;

-- Registra uma chamada e devolve true se ainda está dentro do limite do minuto.
create function public.fn_registrar_chamada_admin(p_user_id uuid, p_limite int default 10)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_janela timestamptz := date_trunc('minute', now());
  v_contador int;
begin
  insert into public.admin_rate_limits as r (user_id, janela, contador)
  values (p_user_id, v_janela, 1)
  on conflict (user_id, janela) do update set contador = r.contador + 1
  returning contador into v_contador;

  -- Limpeza oportunista de janelas antigas.
  delete from public.admin_rate_limits where janela < now() - interval '1 hour';

  return v_contador <= p_limite;
end $$;

revoke all on function public.fn_registrar_chamada_admin(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_registrar_chamada_admin(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Revogação de sessões de um usuário desativado
-- ---------------------------------------------------------------------------
-- auth.admin.signOut() recebe um JWT, não um user_id; por isso apagamos as
-- sessões direto (os refresh tokens caem em cascata). O access token atual
-- continua válido até expirar, mas eh_ativo() = false já bloqueia todos os dados.
create function public.fn_revogar_sessoes(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.fn_revogar_sessoes(uuid) from public, anon, authenticated;
grant execute on function public.fn_revogar_sessoes(uuid) to service_role;
