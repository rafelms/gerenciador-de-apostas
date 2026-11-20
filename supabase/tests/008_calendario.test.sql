-- F4.3 — fn_calendario: apostas, sorteios (reais e estimados), prêmios, prazos e isolamento.
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

-- Uma aposta cancelada no 3071 não gera sorteio no calendário.
select tests.autenticar(:'a_id');
select public.salvar_aposta(tests.aposta('megasena', 3071, '2026-10-13', 600, '{7,8,9,10,11,12}')) as a4 \gset
select tests.sair();
update public.apostas set status = 'cancelada' where id = :'a4';

select plan(9);

select tests.autenticar(:'a_id');

select is(
  (select jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'concurso', concurso,
                                       'valor', valor_centavos, 'qtd', qtd, 'sorteado', sorteado,
                                       'estimada', estimada))
   from public.fn_calendario('2026-10-01', '2026-10-31')),
  '[{"data": "2026-10-10", "tipo": "aposta", "concurso": 3069, "valor": 600, "qtd": 1, "sorteado": null, "estimada": false},
    {"data": "2026-10-11", "tipo": "premio", "concurso": 3069, "valor": 100000, "qtd": 1, "sorteado": null, "estimada": false},
    {"data": "2026-10-11", "tipo": "sorteio", "concurso": 3069, "valor": null, "qtd": 1, "sorteado": true, "estimada": false},
    {"data": "2026-10-12", "tipo": "aposta", "concurso": 3070, "valor": 600, "qtd": 1, "sorteado": null, "estimada": false},
    {"data": "2026-10-13", "tipo": "aposta", "concurso": 3071, "valor": 600, "qtd": 1, "sorteado": null, "estimada": false},
    {"data": "2026-10-14", "tipo": "sorteio", "concurso": 3070, "valor": null, "qtd": 1, "sorteado": false, "estimada": true}]'::jsonb,
  'outubro: apostas, sorteio real e estimado, prêmio; a cancelada não tem sorteio');

select is((select count(*)::int from public.fn_calendario('2026-10-01', '2026-10-31') where aposta_id = :'a1' and tipo = 'premio'),
  1, 'o prêmio aponta para a aposta');
select is((select array_agg(data) from public.fn_calendario('2027-01-01', '2027-01-31') where tipo = 'prazo'),
  array['2027-01-09'::date], 'prazo de resgate: sorteio + 90 dias');
select is((select count(*)::int from public.fn_calendario('2026-12-01', '2026-12-31')), 0, 'mês sem eventos');

-- Prêmio dividido: o calendário mostra a parte da usuária.
select tests.sair();
insert into public.participantes (aposta_id, user_id, nome, peso, eh_usuario)
values (:'a1', :'a_id', 'Eu', 1, true), (:'a1', :'a_id', 'Ana', 1, false);
insert into public.premio_divisoes (premio_id, participante_id, user_id, liquido_centavos)
select p.id, pa.id, :'a_id', 50000
from public.premios p join public.participantes pa on pa.aposta_id = p.aposta_id
where p.aposta_id = :'a1';
select tests.autenticar(:'a_id');
select is((select valor_centavos from public.fn_calendario('2026-10-11', '2026-10-11') where tipo = 'premio'),
  50000::bigint, 'com divisão, só a parte da usuária');

-- Depois de resgatar, prêmio e prazo saem do calendário.
select tests.sair();
update public.premios set status = 'resgatado', resgatado_em = '2026-10-20' where aposta_id = :'a1';
select tests.autenticar(:'a_id');
select is((select count(*)::int from public.fn_calendario('2026-10-01', '2027-01-31') where tipo in ('premio', 'prazo')),
  0, 'resgatado não aparece');

-- Isolamento
select tests.autenticar(:'b_id');
select is((select array_agg(tipo order by tipo) from public.fn_calendario('2026-10-01', '2026-10-31')),
  array['aposta', 'sorteio'], 'B vê só a própria aposta e o sorteio dela');
select is((select qtd from public.fn_calendario('2026-10-11', '2026-10-11') where tipo = 'sorteio'),
  1, 'o sorteio de B conta só a aposta de B');
select tests.sair();

set local role anon;
select throws_ok($$ select * from public.fn_calendario('2026-10-01', '2026-10-31') $$, '42501', null, 'anon não executa');
reset role;

select * from finish();
rollback;
