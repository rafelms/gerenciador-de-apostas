begin;
create extension if not exists pgtap with schema extensions;

-- Helpers de teste (descartados no rollback) ---------------------------------
create schema tests;

create function tests.criar_usuario(p_email text, p_nome text, p_papel public.papel_usuario default 'membro')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, jsonb_build_object('nome', p_nome));
  update public.profiles set papel = p_papel where id = v_id;
  return v_id;
end $$;

create function tests.autenticar(p_id uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

-- Dados ------------------------------------------------------------------------
select tests.criar_usuario('admin@teste.local', 'Admin', 'admin') as admin_id \gset
select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset

select plan(14);

-- Trigger de criação do perfil
select is((select nome from public.profiles where id = :'a_id'), 'Usuária A', 'perfil criado com o nome do convite');
select is((select papel::text from public.profiles where id = :'b_id'), 'membro', 'papel padrão é membro');

-- Isolamento de profiles
select tests.autenticar(:'a_id');
select is((select count(*)::int from public.profiles), 1, 'membro só enxerga o próprio perfil');
select is((select count(*)::int from public.profiles where id = :'b_id'), 0, 'membro não lê o perfil de outro');

update public.profiles set nome = 'Ana' where id = :'a_id';
select is((select nome from public.profiles where id = :'a_id'), 'Ana', 'membro altera o próprio nome');

select throws_ok(
  format('update public.profiles set papel = %L where id = %L', 'admin', :'a_id'),
  '42501', null, 'membro não consegue se promover a admin');
select throws_ok(
  format('update public.profiles set ativo = false where id = %L', :'b_id'),
  '42501', null, 'membro não altera a coluna ativo');

-- configuracoes
select is((select aliquota_ir_bps from public.configuracoes), 3000, 'membro lê configurações');
update public.configuracoes set aliquota_ir_bps = 1 where id = 1;
select tests.sair();
select is((select aliquota_ir_bps from public.configuracoes), 3000, 'membro não altera configurações');

select tests.autenticar(:'admin_id', 'aal1');
update public.configuracoes set aliquota_ir_bps = 2000 where id = 1;
select tests.sair();
select is((select aliquota_ir_bps from public.configuracoes), 3000, 'admin sem MFA (aal1) não altera configurações');

select tests.autenticar(:'admin_id', 'aal2');
update public.configuracoes set aliquota_ir_bps = 2000 where id = 1;
select tests.sair();
select is((select aliquota_ir_bps from public.configuracoes), 2000, 'admin com aal2 altera configurações');

-- Lista de usuários do admin
select tests.autenticar(:'a_id');
select throws_ok('select * from public.fn_admin_listar_usuarios()', '42501', 'acesso negado',
  'membro não lista usuários');
select tests.sair();

select tests.autenticar(:'admin_id', 'aal2');
select is((select count(*)::int from public.fn_admin_listar_usuarios() where email like '%@teste.local'), 3,
  'admin com aal2 lista os usuários');
select tests.sair();

-- Usuário desativado não lê nada
update public.profiles set ativo = false where id = :'b_id';
select tests.autenticar(:'b_id');
select is((select count(*)::int from public.configuracoes), 0, 'usuário desativado não lê configurações');
select tests.sair();

select * from finish();
rollback;
