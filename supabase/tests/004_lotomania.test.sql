begin;
create extension if not exists pgtap with schema extensions;

-- Lotomania no banco: catálogo, 50 dezenas de 00 a 99 e teimosinha com quantidades fixas.
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
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- p_qtd dezenas a partir de p_inicio (00, 01, …)
create function tests.dezenas(p_inicio int, p_qtd int) returns jsonb language sql as $$
  select jsonb_agg(n) from generate_series(p_inicio, p_inicio + p_qtd - 1) as n
$$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.criar_usuario('loto@teste.local', 'Lotomaníaca') as u_id \gset

select plan(9);

select is((select array[universo_min, universo_max, qtd_sorteadas, base_aposta, min_marcadas, max_marcadas]::int[]
           from public.modalidades where slug = 'lotomania'),
  array[0, 99, 20, 50, 50, 50], 'catálogo: 50 números de 00 a 99, 20 sorteados');
select is((select jsonb_array_length(faixas) from public.modalidades where slug = 'lotomania'), 7,
  '7 faixas, inclusive 0 acertos');
select is(public.fn_preco_vigente((select id from public.modalidades where slug = 'lotomania'), date '2026-10-14'),
  300::bigint, 'preço único de R$ 3,00');

select tests.autenticar(:'u_id');

select lives_ok(
  format($$select public.salvar_aposta(jsonb_build_object('modalidade_slug', 'lotomania', 'tipo', 'simples',
    'concurso_inicial', 2990, 'data_aposta', '2026-10-14', 'valor_pago_centavos', 600,
    'jogos', jsonb_build_array(%L::jsonb, %L::jsonb)))$$, tests.dezenas(0, 50), tests.dezenas(50, 50)),
  'jogo com 00 e a Aposta-Espelho são aceitos');
select is((select min(d) from public.aposta_jogos j, unnest(j.dezenas) d where j.user_id = :'u_id'), 0::smallint,
  'a dezena 00 é gravada como 0');

select throws_ok(
  format($$select public.salvar_aposta(jsonb_build_object('modalidade_slug', 'lotomania', 'tipo', 'simples',
    'concurso_inicial', 2990, 'data_aposta', '2026-10-14', 'valor_pago_centavos', 300,
    'jogos', jsonb_build_array(%L::jsonb)))$$, tests.dezenas(0, 49)),
  '23514', 'Lotomania aceita de 50 a 50 dezenas; encontradas 49', '49 números são recusados');

select throws_ok(
  format($$select public.salvar_aposta(jsonb_build_object('modalidade_slug', 'lotomania', 'tipo', 'simples',
    'concurso_inicial', 2990, 'data_aposta', '2026-10-14', 'valor_pago_centavos', 300,
    'jogos', jsonb_build_array(%L::jsonb)))$$, tests.dezenas(51, 50)),
  '23514', null, 'dezena 100 fora do universo é recusada');

select lives_ok(
  format($$select public.salvar_aposta(jsonb_build_object('modalidade_slug', 'lotomania', 'tipo', 'teimosinha',
    'concurso_inicial', 2990, 'qtd_concursos', 4, 'data_aposta', '2026-10-14', 'valor_pago_centavos', 1200,
    'jogos', jsonb_build_array(%L::jsonb)))$$, tests.dezenas(0, 50)),
  'teimosinha de 4 concursos é aceita');

select throws_ok(
  format($$select public.salvar_aposta(jsonb_build_object('modalidade_slug', 'lotomania', 'tipo', 'teimosinha',
    'concurso_inicial', 2990, 'qtd_concursos', 5, 'data_aposta', '2026-10-14', 'valor_pago_centavos', 1500,
    'jogos', jsonb_build_array(%L::jsonb)))$$, tests.dezenas(0, 50)),
  '23514', 'A teimosinha da Lotomania vale para 2, 3, 4, 6, 8, 9, 12 concursos', 'teimosinha de 5 concursos é recusada');

select * from finish();
rollback;
