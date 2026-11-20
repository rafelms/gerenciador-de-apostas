-- F4.4 — Orçamento: RLS, gasto do mês, alertas de 80%/100% sem duplicar.
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

create function tests.aposta(p_slug text, p_concurso int, p_data date, p_valor int, p_dezenas int[],
                             p_bolao boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object(
    'modalidade_slug', p_slug, 'tipo', case when p_bolao then 'bolao' else 'simples' end,
    'concurso_inicial', p_concurso, 'qtd_concursos', 1, 'data_aposta', p_data,
    'valor_pago_centavos', p_valor, 'jogos', jsonb_build_array(to_jsonb(p_dezenas)),
    'participantes', '[]'::jsonb)
  || case when p_bolao then jsonb_build_object(
       'bolao_total_cotas', 2, 'bolao_cotas_usuario', 1, 'valor_cota_centavos', p_valor)
     else '{}'::jsonb end
$$;

grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset
select id as lotofacil from public.modalidades where slug = 'lotofacil' \gset

-- O alerta é um gatilho adiado: roda no commit, depois que salvar_aposta gravou tudo.
-- O teste é uma transação só; "set constraints all immediate" dispara os pendentes
-- como o commit faria, e "deferred" volta ao normal para a próxima aposta.

create function tests.alertas(p_user uuid)
returns text[] language sql as $$
  select coalesce(array_agg(chave_dedup order by chave_dedup), '{}')
  from public.notificacoes where user_id = p_user and tipo = 'orcamento'
$$;
grant execute on function tests.alertas(uuid) to authenticated;

select plan(17);

select is(public.formatar_brl(123456), 'R$ 1.234,56', 'formatar_brl com milhar');
select is(public.formatar_brl(5), 'R$ 0,05', 'formatar_brl com centavos');

-- ===========================================================================
-- Aceite F4: orçamento de R$ 100 → aposta que leva a R$ 85 avisa 80% uma vez
-- ===========================================================================
select tests.autenticar(:'a_id');
insert into public.orcamentos (mes, limite_centavos) values ('2026-11-01', 10000);

select public.salvar_aposta(tests.aposta('megasena', 3080, '2026-11-02', 8500, '{1,2,3,4,5,6}'));
set constraints all immediate;
set constraints all deferred;
select is(tests.alertas(:'a_id'), array['orcamento:2026-11:geral:80'], 'R$ 85 de R$ 100: aviso de 80%');
select is((select titulo || ' | ' || corpo || ' | ' || link from public.notificacoes where user_id = :'a_id'),
  'Você usou 80% do orçamento geral de novembro | Você usou R$ 85,00 de R$ 100,00 este mês. É só um aviso: nada foi bloqueado. | /orcamento',
  'texto neutro, com valores e link');

select public.salvar_aposta(tests.aposta('megasena', 3081, '2026-11-03', 500, '{1,2,3,4,5,6}'));
set constraints all immediate;
set constraints all deferred;
select is(tests.alertas(:'a_id'), array['orcamento:2026-11:geral:80'], 'R$ 90: nenhum aviso novo');

select public.salvar_aposta(tests.aposta('megasena', 3082, '2026-11-04', 1500, '{1,2,3,4,5,6}'));
set constraints all immediate;
set constraints all deferred;
select is(tests.alertas(:'a_id'),
  array['orcamento:2026-11:geral:100', 'orcamento:2026-11:geral:80'], 'R$ 105: aviso de 100%');

-- Orçamento por modalidade: conta só as apostas dela.
insert into public.orcamentos (mes, limite_centavos, modalidade_id) values ('2026-11-01', 1000, :lotofacil);
select public.salvar_aposta(tests.aposta('lotofacil', 3600, '2026-11-05', 900,
  '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15}'));
set constraints all immediate;
set constraints all deferred;
select ok(format('orcamento:2026-11:%s:80', :lotofacil) = any(tests.alertas(:'a_id')),
  'R$ 9 de R$ 10 na Lotofácil: 80% da modalidade');
select is(cardinality(tests.alertas(:'a_id')), 3, 'o geral já tinha avisado os dois níveis');

-- Mês sem orçamento: nada.
select public.salvar_aposta(tests.aposta('megasena', 3090, '2026-12-02', 50000, '{1,2,3,4,5,6}'));
set constraints all immediate;
set constraints all deferred;
select is(cardinality(tests.alertas(:'a_id')), 3, 'mês sem orçamento não avisa');

-- Com divisão, vale a parte da usuária (por isso o gatilho roda no fim).
insert into public.orcamentos (mes, limite_centavos) values ('2026-10-01', 1000);
select public.salvar_aposta(tests.aposta('megasena', 3070, '2026-10-02', 1600, '{1,2,3,4,5,6}')
  || jsonb_build_object('participantes', jsonb_build_array(
       jsonb_build_object('nome', 'Eu', 'peso', 1, 'eh_usuario', true),
       jsonb_build_object('nome', 'Ana', 'peso', 1, 'eh_usuario', false))));
set constraints all immediate;
set constraints all deferred;
select ok('orcamento:2026-10:geral:80' = any(tests.alertas(:'a_id'))
          and not 'orcamento:2026-10:geral:100' = any(tests.alertas(:'a_id')),
  'R$ 16 dividido por 2 = R$ 8 de R$ 10: 80%, não 100%');

select is(
  (select jsonb_agg(jsonb_build_object('mod', modalidade_slug, 'limite', limite_centavos, 'gasto', gasto_centavos))
   from public.fn_orcamento_mes('2026-11-20')),
  '[{"mod": null, "limite": 10000, "gasto": 11400}, {"mod": "lotofacil", "limite": 1000, "gasto": 900}]'::jsonb,
  'fn_orcamento_mes: geral soma tudo; o da modalidade só a dela');

-- ===========================================================================
-- Regras e RLS
-- ===========================================================================
select throws_ok($$ insert into public.orcamentos (mes, limite_centavos) values ('2026-11-01', 5000) $$,
  '23505', null, 'um orçamento geral por mês');
select throws_ok($$ insert into public.orcamentos (mes, limite_centavos) values ('2026-11-15', 5000) $$,
  '23514', null, 'mês é o 1º dia');
select throws_ok($$ update public.orcamentos set mes = '2027-01-01' $$,
  '42501', null, 'só o limite pode ser alterado');

select tests.autenticar(:'b_id');
select is((select count(*)::int from public.orcamentos), 0, 'B não vê os orçamentos de A');
select throws_ok(format($$ insert into public.orcamentos (user_id, mes, limite_centavos)
                          values (%L, '2026-11-01', 100) $$, :'a_id'),
  '42501', null, 'B não cria orçamento para A');
select tests.sair();

set local role anon;
select throws_ok($$ select * from public.fn_orcamento_mes('2026-11-01') $$, '42501', null, 'anon não executa');
reset role;

select * from finish();
rollback;
