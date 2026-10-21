-- F0.3 — Fundação: tipos, perfis, configurações globais e helpers de segurança.

-- ---------------------------------------------------------------------------
-- Privilégios padrão
-- ---------------------------------------------------------------------------
-- Nada criado daqui em diante é acessível ao papel `anon`. Cada tabela recebe
-- GRANT explícito para `authenticated`/`service_role` e a RLS faz o resto.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.papel_usuario    as enum ('admin', 'membro');
create type public.tipo_aposta      as enum ('simples', 'bolao', 'teimosinha');
create type public.origem_aposta    as enum ('manual', 'excel', 'pdf');
create type public.status_aposta    as enum ('aguardando', 'conferida', 'premiada', 'nao_premiada', 'cancelada');
create type public.status_premio    as enum ('a_resgatar', 'resgatado', 'expirado');
create type public.tipo_notificacao as enum ('resultado', 'premio', 'premio_expirando', 'orcamento', 'sistema');

-- ---------------------------------------------------------------------------
-- Trigger genérico de updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 80),
  papel public.papel_usuario not null default 'membro',
  ativo boolean not null default true,
  preferencias jsonb not null default '{}'::jsonb,   -- tema, modalidade padrão etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil assim que o Auth cria o usuário (convite do admin ou seed local).
-- O nome vem do metadata do convite; sem ele, usamos a parte local do e-mail.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  v_nome := coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1));
  -- Garante o tamanho exigido pela constraint de profiles.nome (2 a 80).
  -- Atenção: rpad() também TRUNCA, por isso só é usado em nomes curtos.
  v_nome := case when char_length(v_nome) < 2 then rpad(v_nome, 2, '_') else left(v_nome, 80) end;
  insert into public.profiles (id, nome) values (new.id, v_nome)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Configurações globais (singleton id = 1)
-- ---------------------------------------------------------------------------
create table public.configuracoes (
  id smallint primary key default 1 check (id = 1),
  aliquota_ir_bps int not null default 3000 check (aliquota_ir_bps between 0 and 10000),  -- 30,00%
  limite_isencao_ir_centavos bigint not null default 225920 check (limite_isencao_ir_centavos >= 0), -- R$ 2.259,20
  base_calculo_ir text not null default 'cota' check (base_calculo_ir in ('cota', 'aposta')),         -- [PENDÊNCIA P2]
  valor_rateio_api_eh text not null default 'bruto' check (valor_rateio_api_eh in ('bruto', 'liquido')), -- [PENDÊNCIA P1]
  prazo_resgate_dias smallint not null default 90 check (prazo_resgate_dias > 0),
  updated_at timestamptz not null default now()
);

create trigger configuracoes_updated_at
  before update on public.configuracoes
  for each row execute function public.set_updated_at();

insert into public.configuracoes (id) values (1);

-- ---------------------------------------------------------------------------
-- Helpers de segurança usados nas políticas RLS
-- ---------------------------------------------------------------------------
-- security definer: leem profiles sem depender da RLS do chamador (evita recursão).
create function public.eh_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.ativo from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

create function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.papel = 'admin' and p.ativo from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

-- aal2 = sessão autenticada com segundo fator (TOTP). Exigido em toda ação de admin.
create function public.aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

grant execute on function public.eh_ativo() to authenticated, service_role;
grant execute on function public.eh_admin() to authenticated, service_role;
grant execute on function public.aal2()     to authenticated, service_role;
