-- Aba Mega da Virada: RLS por dono, limites e colunas editáveis.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;

create function tests.criar_usuario(p_email text, p_nome text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, jsonb_build_object('nome', p_nome));
  return v_id;
end $$;

create function tests.autenticar(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset

select plan(8);

select tests.autenticar(:'a_id');
insert into public.virada_itens (concurso, descricao, valor_previsto_centavos)
values (3100, 'Bolão da empresa', 3000);
select is((select count(*)::int from public.virada_itens), 1, 'A vê o próprio item');
select is((select feito from public.virada_itens), false, 'o item nasce como não feito');

update public.virada_itens set feito = true;
select is((select feito from public.virada_itens), true, 'A marca o item como feito');

select throws_ok($$ update public.virada_itens set concurso = 3101 $$, '42501', null,
  'concurso não é editável (só descrição, valor e feito)');
select throws_ok($$ insert into public.virada_itens (concurso, descricao) values (3100, '   ') $$,
  '23514', null, 'descrição em branco é recusada');
select throws_ok(format($$ insert into public.virada_itens (user_id, concurso, descricao)
  values (%L, 3100, 'x') $$, :'b_id'), '42501', null, 'A não cria item em nome de B');

select tests.autenticar(:'b_id');
select is((select count(*)::int from public.virada_itens), 0, 'B não vê os itens de A');
delete from public.virada_itens;
select tests.autenticar(:'a_id');
select is((select count(*)::int from public.virada_itens), 1, 'B não apaga o item de A');

select * from finish();
rollback;
