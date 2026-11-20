-- F4.5 — fn_admin_metricas: só agregados, só admin com MFA; admin não lê apostas alheias.
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

create function tests.aposta(p_slug text, p_concurso int, p_data date, p_valor int, p_dezenas int[])
returns jsonb language sql as $$
  select jsonb_build_object(
    'modalidade_slug', p_slug, 'tipo', 'simples',
    'concurso_inicial', p_concurso, 'qtd_concursos', 1, 'data_aposta', p_data,
    'valor_pago_centavos', p_valor, 'jogos', jsonb_build_array(to_jsonb(p_dezenas)),
    'participantes', '[]'::jsonb)
$$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.criar_usuario('admin@teste.local', 'Admin', 'admin') as admin_id \gset
select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset

-- A: duas Mega (outubro) e uma Lotofácil (novembro). B: uma Quina em novembro.
select tests.autenticar(:'a_id');
select public.salvar_aposta(tests.aposta('megasena', 3069, '2026-10-10', 600, '{3,17,22,31,40,50}'));
select public.salvar_aposta(tests.aposta('megasena', 3070, '2026-10-20', 1200, '{1,2,3,4,5,6}'));
select public.salvar_aposta(tests.aposta('lotofacil', 3520, '2026-11-05', 350,
  '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15}'));
select tests.autenticar(:'b_id');
select public.salvar_aposta(tests.aposta('quina', 6870, '2026-11-06', 300, '{1,2,3,4,5}'));
select tests.sair();

select plan(15);

-- Acesso ----------------------------------------------------------------------
select tests.autenticar(:'a_id', 'aal2');
select throws_ok('select * from public.fn_admin_metricas(null, null)', '42501', 'acesso negado',
  'membro chamando fn_admin_metricas recebe 42501');

select tests.autenticar(:'admin_id', 'aal1');
select throws_ok('select * from public.fn_admin_metricas(null, null)', '42501', 'acesso negado',
  'admin sem MFA (aal1) recebe 42501');

select tests.sair();
select ok(not has_function_privilege('anon', 'public.fn_admin_metricas(date, date)', 'execute'),
  'anon não executa fn_admin_metricas');

-- Admin não lê dados de apostas de outros usuários ------------------------------
select tests.autenticar(:'admin_id', 'aal2');
select is((select count(*)::int from public.aposta_jogos), 0,
  'admin (aal2) não lê aposta_jogos de outro usuário');
select is((select count(*)::int from public.apostas), 0,
  'admin (aal2) não lê apostas de outro usuário');
select is((select count(*)::int from public.vw_apostas_resumo), 0,
  'admin (aal2) não lê o resumo de apostas de outro usuário');

-- Agregados -------------------------------------------------------------------
create temp table m as
  select * from public.fn_admin_metricas(null, null)
  where user_id in (:'admin_id', :'a_id', :'b_id');

select is((select count(*)::int from m), 3, 'lista todos os perfis, inclusive sem apostas');
select results_eq(
  format('select qtd_apostas, gasto_centavos, recuperado_centavos, saldo_centavos, ultima_aposta from m where user_id = %L', :'a_id'),
  $$values (3, 2150::bigint, 0::bigint, -2150::bigint, '2026-11-05'::date)$$,
  'totais da usuária A batem com a soma das apostas');
select is((select roi from m where user_id = :'a_id'), -1.0000::numeric, 'ROI = saldo / gasto');
select results_eq(
  format('select qtd_apostas, gasto_centavos, roi from m where user_id = %L', :'admin_id'),
  $$values (0, 0::bigint, null::numeric)$$,
  'usuário sem apostas: zeros e ROI nulo');
select is(
  (select jsonb_agg(e->>'slug' order by e->>'slug') from m, jsonb_array_elements(m.por_modalidade) e
   where user_id = :'a_id'),
  '["lotofacil", "megasena"]'::jsonb,
  'distribuição por modalidade da usuária A');
select is(
  (select (e->>'gasto')::int from m, jsonb_array_elements(m.por_modalidade) e
   where user_id = :'a_id' and e->>'slug' = 'megasena'),
  1800, 'gasto da Mega-Sena da usuária A');
select is(
  (select array_agg(distinct k order by k) from m, jsonb_array_elements(m.por_modalidade) e,
     jsonb_object_keys(e) k),
  array['cor', 'gasto', 'nome', 'qtd', 'recuperado', 'slug'],
  'por_modalidade traz só agregados (sem dezenas, observações ou participantes)');

-- Período ---------------------------------------------------------------------
select results_eq(
  format($q$select qtd_apostas, gasto_centavos from public.fn_admin_metricas('2026-11-01', '2026-11-30')
           where user_id = %L$q$, :'a_id'),
  $$values (1, 350::bigint)$$,
  'filtro de período pela data da aposta');
select is(
  (select ultima_aposta from public.fn_admin_metricas('2026-10-01', '2026-10-31') where user_id = :'b_id'),
  null::date, 'fora do período: sem última aposta');

select * from finish();
rollback;
