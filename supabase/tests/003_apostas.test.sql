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
select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset
select tests.criar_usuario('admin@teste.local', 'Admin', 'admin') as admin_id \gset

-- B cria uma aposta completa (com jogo, participante e anexo).
select tests.autenticar(:'b_id');
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3070, 'qtd_concursos', 1,
  'data_aposta', '2026-10-14', 'valor_pago_centavos', 4200,
  'jogos', jsonb_build_array(jsonb_build_array(2, 9, 24, 28, 44, 48, 49)),
  'participantes', jsonb_build_array(
    jsonb_build_object('nome', 'Eu', 'peso', 1, 'eh_usuario', true),
    jsonb_build_object('nome', 'Amigo', 'peso', 1, 'eh_usuario', false))
)) as aposta_b \gset
insert into public.anexos (aposta_id, storage_path, mime, tamanho_bytes)
values (:'aposta_b', :'b_id' || '/' || :'aposta_b' || '/foto.webp', 'image/webp', 1000);
select tests.sair();

select plan(41);

-- ===========================================================================
-- Isolamento: A não lê, não altera e não exclui nada de B (todas as tabelas)
-- ===========================================================================
select tests.autenticar(:'a_id');

select is((select count(*)::int from public.apostas), 0, 'A não lê apostas de B');
select is((select count(*)::int from public.aposta_jogos), 0, 'A não lê jogos de B');
select is((select count(*)::int from public.aposta_concursos), 0, 'A não lê concursos da aposta de B');
select is((select count(*)::int from public.participantes), 0, 'A não lê participantes de B');
select is((select count(*)::int from public.anexos), 0, 'A não lê anexos de B');
select is((select count(*)::int from public.vw_apostas_resumo), 0, 'A não lê o resumo de B (view security_invoker)');

update public.apostas set observacao = 'hack' where id = :'aposta_b';
update public.aposta_jogos set dezenas = '{1,2,3,4,5,6}' where aposta_id = :'aposta_b';
update public.participantes set nome = 'hack' where aposta_id = :'aposta_b';
delete from public.apostas where id = :'aposta_b';
delete from public.aposta_jogos where aposta_id = :'aposta_b';
delete from public.participantes where aposta_id = :'aposta_b';
delete from public.anexos where aposta_id = :'aposta_b';

select throws_ok(
  format($$insert into public.aposta_jogos (aposta_id, ordem, dezenas) values (%L, 9, '{1,2,3,4,5,6}')$$, :'aposta_b'),
  null, null, 'A não insere jogo na aposta de B');
select throws_ok(
  format($$insert into public.participantes (aposta_id, nome) values (%L, 'intruso')$$, :'aposta_b'),
  '42501', null, 'A não insere participante na aposta de B');
select throws_ok(
  format($$insert into public.apostas (user_id, modalidade_id, tipo, concurso_inicial, data_aposta, valor_pago_centavos)
           values (%L, 1, 'simples', 1, '2026-10-14', 600)$$, :'b_id'),
  '42501', null, 'A não cria aposta em nome de B');
select throws_ok(
  format($$select public.salvar_aposta('{"modalidade_slug":"megasena","tipo":"simples","concurso_inicial":1,"data_aposta":"2026-10-14","valor_pago_centavos":600,"jogos":[[1,2,3,4,5,6]]}'::jsonb, %L)$$, :'aposta_b'),
  'P0002', null, 'A não edita a aposta de B pela RPC');
select throws_ok(
  format($$insert into public.aposta_concursos (aposta_id, modalidade_id, numero_concurso) values (%L, 1, 1)$$, :'aposta_b'),
  '42501', null, 'ninguém insere em aposta_concursos diretamente');
select tests.sair();

select is((select observacao from public.apostas where id = :'aposta_b'), null, 'update de A não afetou B');
select is((select count(*)::int from public.aposta_jogos where aposta_id = :'aposta_b'), 1, 'jogo de B intacto');
select is((select dezenas from public.aposta_jogos where aposta_id = :'aposta_b'), '{2,9,24,28,44,48,49}'::smallint[], 'dezenas de B intactas');
select is((select count(*)::int from public.participantes where aposta_id = :'aposta_b' and nome <> 'hack'), 2, 'participantes de B intactos');
select is((select count(*)::int from public.anexos where aposta_id = :'aposta_b'), 1, 'anexo de B intacto');

-- Admin também não lê dados de apostas de outros (só métricas agregadas, fase 4).
select tests.autenticar(:'admin_id', 'aal2');
select is((select count(*)::int from public.apostas), 0, 'admin não lê apostas de outro usuário');
select is((select count(*)::int from public.aposta_jogos), 0, 'admin não lê dezenas de outro usuário');
select is((select count(*)::int from public.participantes), 0, 'admin não lê participantes de outro usuário');
select tests.sair();

-- anon: nenhum acesso
set local role anon;
select throws_ok('select count(*) from public.apostas', '42501', null, 'anon não acessa apostas');
select throws_ok('select count(*) from public.modalidades', '42501', null, 'anon não acessa modalidades');
reset role;

-- ===========================================================================
-- Regras do dono
-- ===========================================================================
select tests.autenticar(:'a_id');

select is((select count(*)::int from public.modalidades), 3, 'autenticado lê as 3 modalidades do MVP');
select is(public.fn_preco_vigente(1::smallint, '2026-10-14'), 600::bigint, 'preço vigente da Mega = R$ 6,00');

-- Dezenas inválidas são rejeitadas pelo banco
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3070,
  'data_aposta', '2026-10-14', 'valor_pago_centavos', 600,
  'jogos', jsonb_build_array(jsonb_build_array(49, 2, 9, 24, 28, 44)))) as aposta_a \gset
select is((select dezenas from public.aposta_jogos where aposta_id = :'aposta_a'), '{2,9,24,28,44,49}'::smallint[],
  'dezenas são gravadas ordenadas');

select throws_like(
  format($$insert into public.aposta_jogos (aposta_id, ordem, dezenas) values (%L, 2, '{1,2,3,4,5}')$$, :'aposta_a'),
  '%aceita de 6 a 20 dezenas; encontradas 5%', 'menos dezenas que o mínimo');
select throws_like(
  format($$insert into public.aposta_jogos (aposta_id, ordem, dezenas) values (%L, 2, '{1,2,3,4,5,61}')$$, :'aposta_a'),
  '%fora do intervalo 1–60%', 'dezena fora do universo');
select throws_like(
  format($$insert into public.aposta_jogos (aposta_id, ordem, dezenas) values (%L, 2, '{1,2,3,4,5,5}')$$, :'aposta_a'),
  '%repetidas%', 'dezena repetida');
select throws_like(
  format($$insert into public.aposta_jogos (aposta_id, ordem, dezenas) values (%L, 2, '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21}')$$, :'aposta_a'),
  '%encontradas 21%', 'mais dezenas que o máximo');

-- Teimosinha de 3 concursos cria 3 linhas em aposta_concursos (aceite F1)
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'lotofacil', 'tipo', 'teimosinha', 'concurso_inicial', 3521, 'qtd_concursos', 3,
  'data_aposta', '2026-10-12', 'valor_pago_centavos', 1050,
  'jogos', jsonb_build_array(jsonb_build_array(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15)))) as teimosinha \gset
select is(
  (select array_agg(numero_concurso order by numero_concurso) from public.aposta_concursos where aposta_id = :'teimosinha'),
  array[3521, 3522, 3523], 'teimosinha de 3 concursos → 3 linhas');

select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'lotofacil', 'tipo', 'teimosinha', 'concurso_inicial', 3522, 'qtd_concursos', 2,
  'data_aposta', '2026-10-12', 'valor_pago_centavos', 700,
  'jogos', jsonb_build_array(jsonb_build_array(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15))), :'teimosinha');
select is(
  (select array_agg(numero_concurso order by numero_concurso) from public.aposta_concursos where aposta_id = :'teimosinha'),
  array[3522, 3523], 'editar a teimosinha regenera os concursos');

select throws_ok(
  $$select public.salvar_aposta('{"modalidade_slug":"quina","tipo":"teimosinha","concurso_inicial":1,"qtd_concursos":1,"data_aposta":"2026-10-14","valor_pago_centavos":300,"jogos":[[1,2,3,4,5]]}'::jsonb)$$,
  '23514', null, 'teimosinha com 1 concurso é recusada');

-- Bolão do Apêndice A: valores exatos (aceite F1)
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'bolao', 'concurso_inicial', 3070, 'data_aposta', '2026-10-14',
  'bolao_total_cotas', 38, 'bolao_cotas_usuario', 1, 'bolao_numero_cota', 35,
  'valor_cota_centavos', 884, 'tarifa_centavos', 309, 'valor_pago_centavos', 1193,
  'jogos', jsonb_build_array(jsonb_build_array(2,9,24,28,44,48,49), jsonb_build_array(2,6,28,41,44,49,53)))) as bolao \gset
select results_eq(
  format('select valor_cota_centavos, tarifa_centavos, valor_pago_centavos, bolao_total_cotas::int, bolao_numero_cota::int from public.apostas where id = %L', :'bolao'),
  $$values (884::bigint, 309::bigint, 1193::bigint, 38, 35)$$,
  'bolão do Apêndice A salvo com os valores exatos');

select throws_ok(
  $$select public.salvar_aposta('{"modalidade_slug":"megasena","tipo":"bolao","concurso_inicial":1,"data_aposta":"2026-10-14","bolao_total_cotas":10,"bolao_cotas_usuario":1,"valor_cota_centavos":1000,"tarifa_centavos":400,"valor_pago_centavos":1400,"jogos":[[1,2,3,4,5,6]]}'::jsonb)$$,
  '23514', null, 'tarifa acima de 35% é recusada');
select throws_like(
  $$select public.salvar_aposta('{"modalidade_slug":"quina","tipo":"bolao","concurso_inicial":1,"data_aposta":"2026-10-14","bolao_total_cotas":60,"bolao_cotas_usuario":1,"valor_cota_centavos":1000,"tarifa_centavos":0,"valor_pago_centavos":1000,"jogos":[[1,2,3,4,5]]}'::jsonb)$$,
  '%no máximo 50 cotas%', 'bolão da Quina acima de 50 cotas é recusado');
select throws_like(
  $$select public.salvar_aposta('{"modalidade_slug":"megasena","tipo":"bolao","concurso_inicial":1,"data_aposta":"2026-10-14","bolao_total_cotas":10,"bolao_cotas_usuario":1,"valor_cota_centavos":1000,"tarifa_centavos":0,"valor_pago_centavos":1000,"jogos":[[1,2,3,4,5,6],[1,2,3,4,5,6,7]]}'::jsonb)$$,
  '%mesma quantidade de dezenas%', 'bolão com jogos de tamanhos diferentes é recusado');
select throws_ok(
  $$select public.salvar_aposta('{"modalidade_slug":"megasena","tipo":"simples","concurso_inicial":1,"data_aposta":"2026-10-14","bolao_total_cotas":10,"valor_pago_centavos":600,"jogos":[[1,2,3,4,5,6]]}'::jsonb)$$,
  '23514', null, 'campos de bolão em aposta simples são recusados');

-- Participantes: exatamente um "eu" (checado no fim da transação)
select throws_ok(
  $$select public.salvar_aposta('{"modalidade_slug":"megasena","tipo":"simples","concurso_inicial":1,"data_aposta":"2026-10-14","valor_pago_centavos":600,"jogos":[[1,2,3,4,5,6]],"participantes":[{"nome":"Eu","eh_usuario":true},{"nome":"Eu de novo","eh_usuario":true}]}'::jsonb)$$,
  '23505', null, 'dois participantes "eu" são recusados');

-- Gasto do usuário na view (seção 7.3): R$ 42,00 dividido 1:1 → R$ 21,00
select tests.sair();
select tests.autenticar(:'b_id');
select is((select gasto_usuario_centavos from public.vw_apostas_resumo where id = :'aposta_b'), 2100::bigint,
  'gasto do usuário proporcional ao peso');
select is((select saldo_centavos from public.vw_apostas_resumo where id = :'aposta_b'), -2100::bigint,
  'saldo = recuperado − gasto');

-- Exclusão em cascata pelo dono
delete from public.apostas where id = :'aposta_b';
select is((select count(*)::int from public.apostas where id = :'aposta_b'), 0, 'dono exclui a própria aposta');
select tests.sair();
select is((select count(*)::int from public.aposta_jogos where aposta_id = :'aposta_b'), 0, 'jogos excluídos em cascata');

select * from finish();
rollback;
