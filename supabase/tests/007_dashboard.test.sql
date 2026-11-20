-- F4.1 — fn_dashboard: totais iguais à soma da lista, filtros, quase lá, próximos e isolamento.
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
select id as mega from public.modalidades where slug = 'megasena' \gset
select id as concurso_3069 from public.concursos where numero = 3069 and modalidade_id = :mega \gset

-- A: Mega 3069 em outubro (quina: quase lá), 1 cota de bolão da Mega 3070 em outubro,
-- Lotofácil em novembro. B: uma Mega em outubro.
select tests.autenticar(:'a_id');
select public.salvar_aposta(tests.aposta('megasena', 3069, '2026-10-10', 600, '{3,17,22,31,40,50}')) as a1 \gset
select public.salvar_aposta(tests.aposta('megasena', 3070, '2026-10-12', 600, '{1,2,3,4,5,6}', true)) as a2 \gset
select public.salvar_aposta(tests.aposta('lotofacil', 3500, '2026-11-05', 350,
  '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15}')) as a3 \gset
select tests.autenticar(:'b_id');
select public.salvar_aposta(tests.aposta('megasena', 3069, '2026-10-11', 600, '{1,2,3,4,5,6}')) as b1 \gset
select tests.sair();

-- O que a conferência grava: a1 fez 5 acertos no 3069 e ganhou R$ 1.000,00 líquidos.
insert into public.conferencias (aposta_jogo_id, concurso_id, aposta_id, user_id, acertos, dezenas_acertadas, premios_por_faixa)
select j.id, :concurso_3069, :'a1', :'a_id', 5, '{3,17,22,31,40}', '{"6":0,"5":1,"4":0}'
from public.aposta_jogos j where j.aposta_id = :'a1';
insert into public.premios (aposta_id, user_id, concurso_id, bruto_aposta_centavos, bruto_usuario_centavos,
                            ir_usuario_centavos, liquido_usuario_centavos, regra_ir)
values (:'a1', :'a_id', :concurso_3069, 100000, 100000, 0, 100000, '{}');
update public.apostas set status = 'premiada' where id = :'a1';
insert into public.conferencias (aposta_jogo_id, concurso_id, aposta_id, user_id, acertos, dezenas_acertadas, premios_por_faixa)
select j.id, :concurso_3069, :'b1', :'b_id', 2, '{3,17}', '{"6":0,"5":0,"4":0}'
from public.aposta_jogos j where j.aposta_id = :'b1';
update public.apostas set status = 'nao_premiada' where id = :'b1';

select plan(16);

select is(public.faixa_maxima(m.faixas), 6::smallint, 'faixa máxima da Mega é 6')
from public.modalidades m where m.slug = 'megasena';

-- ===========================================================================
-- Totais = soma da lista (vw_apostas_resumo) com o mesmo filtro
-- ===========================================================================
select tests.autenticar(:'a_id');
select public.fn_dashboard() as tudo \gset

select is((:'tudo'::jsonb) -> 'totais',
  (select jsonb_build_object(
     'gasto', sum(gasto_usuario_centavos), 'recuperado', sum(recuperado_usuario_centavos),
     'qtd_apostas', count(*), 'qtd_finalizadas', 1, 'qtd_premiadas', 1)
   from public.vw_apostas_resumo),
  'totais batem com a soma da lista');
select is((:'tudo'::jsonb) -> 'totais' -> 'gasto', '1550'::jsonb, 'gasto: 600 + 600 (cota) + 350');
select is((:'tudo'::jsonb) -> 'totais' -> 'recuperado', '100000'::jsonb, 'recuperado: o prêmio da a1');

select is((public.fn_dashboard('2026-10-01', '2026-10-31')) -> 'totais' -> 'qtd_apostas', '2'::jsonb,
  'período pela data da aposta');
select is((public.fn_dashboard(null, null, :mega::smallint)) -> 'totais' -> 'gasto', '1200'::jsonb,
  'filtro de modalidade');

select is((:'tudo'::jsonb) -> 'mensal',
  '[{"mes": "2026-10-01", "gasto": 1200, "recuperado": 100000},
    {"mes": "2026-11-01", "gasto": 350, "recuperado": 0}]'::jsonb,
  'série mensal');
select is(jsonb_array_length((:'tudo'::jsonb) -> 'por_modalidade'), 2, 'duas modalidades');
select is((:'tudo'::jsonb) -> 'por_tipo',
  '[{"tipo": "simples", "qtd": 2, "gasto": 950, "recuperado": 100000},
    {"tipo": "bolao", "qtd": 1, "gasto": 600, "recuperado": 0}]'::jsonb,
  'por tipo (na ordem do enum)');
select is((:'tudo'::jsonb) -> 'acertos',
  jsonb_build_array(jsonb_build_object(
    'slug', 'megasena', 'nome', m.nome, 'cor', m.cor_hex, 'max_acertos', 6, 'acertos', 5, 'qtd', 1)),
  'distribuição de acertos')
from public.modalidades m where m.slug = 'megasena';
select is((:'tudo'::jsonb) -> 'top_saldo' -> 0 ->> 'id', :'a1', 'a aposta premiada lidera o saldo');
select is((:'tudo'::jsonb) -> 'top_acertos' -> 0 -> 'melhor_acerto', '5'::jsonb, 'top por acertos');
select is(((:'tudo'::jsonb) -> 'quase_la' -> 0) - 'modalidade_nome' - 'modalidade_cor',
  jsonb_build_object('aposta_id', :'a1', 'modalidade_slug', 'megasena', 'numero', 3069,
                     'data_sorteio', '2026-10-11', 'acertos', 5, 'max_acertos', 6),
  'quina na Mega é "quase lá"');

-- Próximos: 3070 da Mega (data pelo data_proximo do 3069) e a Lotofácil 3500.
select is((select jsonb_agg(jsonb_build_object('slug', x ->> 'slug', 'numero', x -> 'numero'))
           from jsonb_array_elements((:'tudo'::jsonb) -> 'proximos') x),
  '[{"slug": "megasena", "numero": 3070}, {"slug": "lotofacil", "numero": 3500}]'::jsonb,
  'próximos sorteios com apostas, sem os já sorteados');

-- ===========================================================================
-- Isolamento e permissão
-- ===========================================================================
select tests.autenticar(:'b_id');
select is((public.fn_dashboard()) -> 'totais' -> 'qtd_apostas', '1'::jsonb, 'B só vê a própria aposta');
select tests.sair();

set local role anon;
select throws_ok($$ select public.fn_dashboard() $$, '42501', null, 'anon não executa');
reset role;

select * from finish();
rollback;
