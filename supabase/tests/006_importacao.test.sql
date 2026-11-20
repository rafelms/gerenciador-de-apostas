-- F3.2 — importar_apostas (transacional) e RLS de importacoes.
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

create function tests.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Aposta simples da Mega-Sena no formato de salvar_aposta.
create function tests.aposta(p_concurso int, p_dezenas int[], p_hash text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'modalidade_slug', 'megasena', 'tipo', 'simples', 'origem', 'manual',
    'concurso_inicial', p_concurso, 'qtd_concursos', 1, 'data_aposta', '2026-10-14',
    'valor_pago_centavos', 600, 'comprovante_hash', p_hash,
    'jogos', jsonb_build_array(to_jsonb(p_dezenas)),
    'participantes', '[]'::jsonb)
$$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset

select plan(20);

-- ===========================================================================
-- Lote válido
-- ===========================================================================
select tests.autenticar(:'a_id');

select public.importar_apostas(
  jsonb_build_array(
    tests.aposta(3070, '{1,2,3,4,5,6}'),
    tests.aposta(3071, '{7,8,9,10,11,12}'),
    tests.aposta(3072, '{13,14,15,16,17,18}')),
  'excel', '  minhas-apostas.xlsx ', 1) as r \gset

select is(jsonb_array_length((:'r'::jsonb)->'ids'), 3, 'devolve os ids das 3 apostas');
select is((select count(*)::int from public.apostas), 3, 'as 3 apostas foram criadas');
select is(
  (select array_agg(distinct origem::text) from public.apostas), '{excel}',
  'a origem vem do parâmetro (o "manual" do item é ignorado)');
select is((select count(*)::int from public.aposta_jogos), 3, 'jogos gravados');
select is(
  (select count(*)::int from public.aposta_concursos), 3,
  'aposta_concursos preenchida pelo trigger, como no formulário');
select results_eq(
  $$select origem::text, nome_arquivo, qtd_apostas, qtd_erros from public.importacoes$$,
  $$values ('excel', 'minhas-apostas.xlsx', 3, 1)$$,
  'registro da importação com o nome limpo e as contagens');
select is(
  (select id::text from public.importacoes), (:'r'::jsonb)->>'importacao_id',
  'devolve o id da importação');
select is(
  (select count(*)::int from public.apostas where importacao_id = ((:'r'::jsonb)->>'importacao_id')::uuid),
  3, 'as apostas ficam ligadas à importação');
select is(
  current_setting('lotogestor.importacao_id', true), '',
  'a importação em andamento é limpa ao terminar');
select public.salvar_aposta(tests.aposta(3075, '{1,2,3,4,5,6}')) as manual \gset
select is(
  (select importacao_id from public.apostas where id = :'manual'), null,
  'aposta do formulário não fica ligada a importação');

-- ===========================================================================
-- Tudo ou nada
-- ===========================================================================
select throws_ok(
  $$select public.importar_apostas(jsonb_build_array(
      tests.aposta(3080, '{1,2,3,4,5,6}'),
      tests.aposta(3081, '{1,2,3,4,5,61}')), 'excel')$$,
  null, null, 'uma aposta inválida derruba o lote');
select is((select count(*)::int from public.apostas), 4, 'nada do lote com erro ficou gravado');
select is((select count(*)::int from public.importacoes), 1, 'nem o registro da importação');

select throws_like(
  $$select public.importar_apostas(jsonb_build_array(
      tests.aposta(3080, '{1,2,3,4,5,6}'),
      jsonb_set(tests.aposta(3081, '{1,2,3,4,5,6}'), '{modalidade_slug}', '"xpto"')), 'excel')$$,
  'Aposta 2: %', 'a mensagem diz qual aposta falhou');

-- Comprovante já importado: mantém o SQLSTATE 23505 para o front reconhecer a duplicata.
select public.importar_apostas(
  jsonb_build_array(tests.aposta(3090, '{1,2,3,4,5,6}', repeat('a', 64))), 'pdf');
select throws_ok(
  $$select public.importar_apostas(
      jsonb_build_array(tests.aposta(3090, '{1,2,3,4,5,6}', repeat('a', 64))), 'pdf')$$,
  '23505', null, 'o mesmo comprovante não entra duas vezes');

select throws_ok(
  $$select public.importar_apostas('[]'::jsonb, 'excel')$$,
  '22023', 'Nenhuma aposta para importar', 'lote vazio é recusado');
select throws_ok(
  $$select public.importar_apostas(jsonb_build_array(tests.aposta(3095, '{1,2,3,4,5,6}')), 'manual')$$,
  '22023', 'Origem inválida para importação', 'origem manual não é importação');

-- ===========================================================================
-- Isolamento
-- ===========================================================================
select tests.autenticar(:'b_id');
select is((select count(*)::int from public.importacoes), 0, 'B não vê as importações de A');
delete from public.importacoes;
select tests.autenticar(:'a_id');
select is((select count(*)::int from public.importacoes), 2, 'B não apaga as importações de A');

select throws_ok(
  format($$select * from public.fn_concursos_sorteados_da_importacao(%L, %L)$$,
    (:'r'::jsonb)->>'importacao_id', :'a_id'),
  '42501', null, 'só a Edge Function (service role) lista os concursos da importação');

select * from finish();
rollback;
