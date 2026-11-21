-- F5.3 — Anexos: bucket privado, só o dono lê/grava/apaga, no máximo 3 por aposta.
begin;
create extension if not exists pgtap with schema extensions;

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

select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset
select tests.criar_usuario('admin@teste.local', 'Admin', 'admin') as admin_id \gset

select tests.autenticar(:'a_id');
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3069, 'qtd_concursos', 1,
  'data_aposta', '2026-10-10', 'valor_pago_centavos', 600,
  'jogos', jsonb_build_array(jsonb_build_array(1, 2, 3, 4, 5, 6)), 'participantes', '[]'::jsonb)) as aposta_a \gset
select tests.autenticar(:'b_id');
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3069, 'qtd_concursos', 1,
  'data_aposta', '2026-10-10', 'valor_pago_centavos', 600,
  'jogos', jsonb_build_array(jsonb_build_array(1, 2, 3, 4, 5, 6)), 'participantes', '[]'::jsonb)) as aposta_b \gset
select tests.sair();

select format('%s/%s/foto-1.webp', :'a_id', :'aposta_a') as caminho_a \gset

select plan(14);

-- Bucket -----------------------------------------------------------------------
select is((select public from storage.buckets where id = 'comprovantes'), false, 'bucket comprovantes é privado');
select is((select file_size_limit from storage.buckets where id = 'comprovantes'), 5242880::bigint,
  'bucket recusa arquivo acima de 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'comprovantes'),
  array['image/jpeg', 'image/png', 'image/webp'], 'bucket só aceita JPEG, PNG e WebP');

-- Dono grava e lê ----------------------------------------------------------------
select tests.autenticar(:'a_id');
select lives_ok(
  format($q$insert into storage.objects (bucket_id, name, owner_id) values ('comprovantes', %L, %L)$q$,
         :'caminho_a', :'a_id'),
  'dono grava na pasta {user_id}/{aposta_id}/');
select is((select count(*)::int from storage.objects where bucket_id = 'comprovantes'), 1,
  'dono lê o próprio anexo');
select throws_ok(
  format($q$insert into storage.objects (bucket_id, name, owner_id) values ('comprovantes', %L, %L)$q$,
         format('%s/%s/x.webp', :'a_id', :'aposta_b'), :'a_id'),
  '42501', null, 'dono não grava numa aposta que não é dele');

-- Outro usuário, nem com o caminho exato ------------------------------------------
select tests.autenticar(:'b_id');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'comprovantes' and name = :'caminho_a'),
  0, 'outro usuário não lê o anexo nem com o caminho exato');
select throws_ok(
  format($q$insert into storage.objects (bucket_id, name, owner_id) values ('comprovantes', %L, %L)$q$,
         format('%s/%s/y.webp', :'a_id', :'aposta_a'), :'b_id'),
  '42501', null, 'outro usuário não grava na pasta de A');
-- A API do Storage liga esta flag para apagar; aqui ela isola o teste da política.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'comprovantes' and name = :'caminho_a';
select tests.sair();
select is((select count(*)::int from storage.objects where name = :'caminho_a'), 1,
  'outro usuário não apaga o anexo de A');

-- Admin também não ---------------------------------------------------------------
select tests.autenticar(:'admin_id', 'aal2');
select is((select count(*)::int from storage.objects where bucket_id = 'comprovantes'), 0,
  'admin com MFA não lê anexos de outros usuários');

-- Anônimo ------------------------------------------------------------------------
select tests.sair();
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'comprovantes'), 0,
  'anônimo não lê anexos');
reset role;

-- Até 3 por aposta ---------------------------------------------------------------
select tests.autenticar(:'a_id');
insert into public.anexos (aposta_id, storage_path, mime, tamanho_bytes)
select :'aposta_a', format('%s/%s/%s.webp', :'a_id', :'aposta_a', n), 'image/webp', 1000
from generate_series(1, 3) n;
select is((select count(*)::int from public.anexos where aposta_id = :'aposta_a'), 3, 'aceita 3 anexos');
select throws_ok(
  format($q$insert into public.anexos (aposta_id, storage_path, mime, tamanho_bytes)
            values (%L, %L, 'image/webp', 1000)$q$, :'aposta_a', format('%s/%s/4.webp', :'a_id', :'aposta_a')),
  '23514', 'Cada aposta aceita no máximo 3 imagens.', 'o 4º anexo é recusado');
select throws_ok(
  format($q$insert into public.anexos (aposta_id, storage_path, mime, tamanho_bytes)
            values (%L, %L, 'image/webp', 1000)$q$, :'aposta_b', format('%s/%s/g.webp', :'a_id', :'aposta_b')),
  '42501', null, 'anexo na aposta de outro usuário é recusado');

select * from finish();
rollback;
