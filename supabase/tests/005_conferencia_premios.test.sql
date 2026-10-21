begin;
create extension if not exists pgtap with schema extensions;

-- F2.2: RLS de conferências, prêmios, divisões, notificações e sync_logs; resgate; prazos; resumo.
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

-- Dados: B tem uma aposta Mega 3069 (seed) dividida meio a meio, conferida e premiada.
select tests.criar_usuario('a@teste.local', 'Usuária A') as a_id \gset
select tests.criar_usuario('b@teste.local', 'Usuário B') as b_id \gset
select tests.criar_usuario('adm@teste.local', 'Admin', 'admin') as adm_id \gset
select id as concurso_id from public.concursos
 where numero = 3069 and modalidade_id = (select id from public.modalidades where slug = 'megasena') \gset

select tests.autenticar(:'b_id');
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3069, 'qtd_concursos', 1,
  'data_aposta', '2026-10-10', 'valor_pago_centavos', 600,
  'jogos', jsonb_build_array(jsonb_build_array(3, 17, 22, 31, 40, 59)),
  'participantes', jsonb_build_array(
    jsonb_build_object('nome', 'Eu', 'peso', 1, 'eh_usuario', true),
    jsonb_build_object('nome', 'Amigo', 'peso', 1, 'eh_usuario', false))
)) as aposta_b \gset
select tests.sair();

-- O que a Edge Function conferir-apostas grava (service role = postgres aqui).
insert into public.conferencias (aposta_jogo_id, concurso_id, aposta_id, user_id, acertos, dezenas_acertadas, premios_por_faixa)
select j.id, :'concurso_id', :'aposta_b', :'b_id', 5, '{3,17,22,31,40}', '{"6":0,"5":1,"4":0}'
from public.aposta_jogos j where j.aposta_id = :'aposta_b';
insert into public.premios (aposta_id, user_id, concurso_id, bruto_aposta_centavos, bruto_usuario_centavos,
                            ir_usuario_centavos, liquido_usuario_centavos, regra_ir)
values (:'aposta_b', :'b_id', :'concurso_id', 1000000, 1000000, 300000, 700000, '{}')
returning id as premio_b \gset
insert into public.premio_divisoes (premio_id, participante_id, user_id, liquido_centavos)
select :'premio_b', p.id, :'b_id', 350000 from public.participantes p where p.aposta_id = :'aposta_b';
insert into public.notificacoes (user_id, tipo, titulo, chave_dedup)
values (:'b_id', 'resultado', 'Resultado da Mega-Sena 3069 conferido', 'resultado:' || :'concurso_id')
returning id as notif_b \gset
insert into public.sync_logs (origem, status, mensagem) values ('cron', 'ok', 'teste');

select plan(30);

-- ===========================================================================
-- Isolamento: A não vê nada de B
-- ===========================================================================
select tests.autenticar(:'a_id');
select is((select count(*)::int from public.conferencias), 0, 'A não lê conferências de B');
select is((select count(*)::int from public.premios), 0, 'A não lê prêmios de B');
select is((select count(*)::int from public.premio_divisoes), 0, 'A não lê divisões de B');
select is((select count(*)::int from public.notificacoes), 0, 'A não lê notificações de B');
select throws_ok(format('select public.fn_marcar_resgatado(%L, true)', :'premio_b'), 'P0002', null,
  'A não resgata prêmio de B');
update public.notificacoes set lida_em = now() where id = :'notif_b';
select tests.sair();
select ok((select lida_em is null from public.notificacoes where id = :'notif_b'), 'A não marca como lida a notificação de B');

-- ===========================================================================
-- Dono: lê, não grava o que é da service role
-- ===========================================================================
select tests.autenticar(:'b_id');
select is((select count(*)::int from public.conferencias), 1, 'B lê a própria conferência');
select is((select count(*)::int from public.premio_divisoes), 2, 'B lê a divisão do próprio prêmio');
select throws_ok(
  format($$insert into public.conferencias (aposta_jogo_id, concurso_id, aposta_id, user_id, acertos, dezenas_acertadas, premios_por_faixa)
           select id, %s, aposta_id, user_id, 6, '{}', '{}' from public.aposta_jogos limit 1$$, :'concurso_id'),
  '42501', null, 'B não grava conferência');
select throws_ok(
  format($$insert into public.premio_divisoes (premio_id, participante_id, user_id, liquido_centavos)
           select %L, id, user_id, 1 from public.participantes limit 1$$, :'premio_b'),
  '42501', null, 'B não grava divisão');
select throws_ok(
  $$insert into public.notificacoes (user_id, tipo, titulo) values (auth.uid(), 'sistema', 'x')$$,
  '42501', null, 'B não cria notificação');
select throws_ok(
  format($$update public.notificacoes set titulo = 'x' where id = %L$$, :'notif_b'),
  '42501', null, 'B só altera lida_em da notificação');
update public.notificacoes set lida_em = now() where id = :'notif_b';
select ok((select lida_em is not null from public.notificacoes where id = :'notif_b'), 'B marca a notificação como lida');

-- Prêmio calculado: só vira editável se passar a ser "informado à mão".
select throws_ok(
  format($$update public.premios set bruto_usuario_centavos = 1, ir_usuario_centavos = 0, liquido_usuario_centavos = 1
           where id = %L$$, :'premio_b'),
  '42501', null, 'B não altera prêmio calculado sem marcar como manual');
select tests.sair();
select tests.autenticar(:'b_id');
delete from public.premios where id = :'premio_b';
select tests.sair();
select is((select count(*)::int from public.premios where id = :'premio_b'), 1, 'B não apaga prêmio calculado');

select tests.autenticar(:'b_id');
update public.premios set valor_informado_manual = true, bruto_usuario_centavos = 500000,
  ir_usuario_centavos = 0, liquido_usuario_centavos = 500000 where id = :'premio_b';
select is((select liquido_usuario_centavos from public.premios where id = :'premio_b'), 500000::bigint,
  'B informa o valor do prêmio à mão');
select throws_ok(
  format($$update public.premios set status = 'resgatado' where id = %L$$, :'premio_b'),
  '42501', null, 'status só muda pela função de resgate');
select throws_ok(
  format($$update public.premios set bruto_usuario_centavos = 100, ir_usuario_centavos = 0, liquido_usuario_centavos = 99 where id = %L$$, :'premio_b'),
  '23514', null, 'líquido precisa ser bruto − IR');

select lives_ok(format('select public.fn_marcar_resgatado(%L, true)', :'premio_b'), 'B marca o prêmio como resgatado');
select is((select status::text from public.premios where id = :'premio_b'), 'resgatado', 'status resgatado');
select lives_ok(format('select public.fn_marcar_resgatado(%L, false)', :'premio_b'), 'B desfaz o resgate');
select is((select array[status::text, coalesce(resgatado_em::text, '-')] from public.premios where id = :'premio_b'),
  array['a_resgatar', '-'], 'volta a "a resgatar" sem data');

-- Resumo: recuperado = divisão do participante "eu" (350.000), gasto = metade de R$ 6,00.
select is((select array[recuperado_usuario_centavos, gasto_usuario_centavos, saldo_centavos]
           from public.vw_apostas_resumo where id = :'aposta_b'),
  array[350000, 300, 349700]::bigint[], 'resumo: recuperado, gasto e saldo do usuário');
select is((select melhor_acerto from public.vw_apostas_resumo where id = :'aposta_b'), 5::smallint, 'resumo: melhor acerto');

-- Editar a aposta apaga a conferência e o prêmio calculado (o manual fica).
select tests.sair();
update public.premios set valor_informado_manual = false where id = :'premio_b';
select tests.autenticar(:'b_id');
select public.salvar_aposta(jsonb_build_object(
  'modalidade_slug', 'megasena', 'tipo', 'simples', 'concurso_inicial', 3069, 'qtd_concursos', 1,
  'data_aposta', '2026-10-10', 'valor_pago_centavos', 600,
  'jogos', jsonb_build_array(jsonb_build_array(1, 2, 3, 4, 5, 6))), :'aposta_b');
select is((select array[(select count(*) from public.premios), (select count(*) from public.conferencias)]::int[]),
  array[0, 0], 'editar a aposta limpa prêmio calculado e conferências');

-- ===========================================================================
-- sync_logs: só admin com MFA
-- ===========================================================================
select tests.autenticar(:'adm_id', 'aal1');
select is((select count(*)::int from public.sync_logs), 0, 'admin sem MFA não lê o log');
select tests.autenticar(:'adm_id', 'aal2');
select ok((select count(*) >= 1 from public.sync_logs), 'admin com MFA lê o log');
select tests.sair();

-- ===========================================================================
-- Prazos: expira vencidos e avisa 7 dias / 1 dia antes, sem duplicar
-- ===========================================================================
insert into public.premios (aposta_id, user_id, concurso_id, bruto_aposta_centavos, bruto_usuario_centavos,
                            ir_usuario_centavos, liquido_usuario_centavos, regra_ir, prazo_resgate)
values (:'aposta_b', :'b_id', :'concurso_id', 100, 100, 0, 100, '{}',
        (now() at time zone 'America/Sao_Paulo')::date + 5);
select public.fn_processar_prazos();
select public.fn_processar_prazos();
select is((select count(*)::int from public.notificacoes where tipo = 'premio_expirando'), 1,
  'aviso de 7 dias criado uma única vez');
update public.premios set prazo_resgate = (now() at time zone 'America/Sao_Paulo')::date - 1;
select is((public.fn_processar_prazos()->>'expirados')::int, 1, 'prêmio vencido expira');

-- ===========================================================================
-- Regressão: o Auth (supabase_auth_admin) exclui usuário com aposta dividida
-- ===========================================================================
-- O trigger diferido roda no commit com o papel do Auth; precisa ser security definer.
-- (O cenário completo, excluindo pela API do Auth, está nos testes Deno das functions.)
select ok((select prosecdef from pg_proc where oid = 'public.verificar_participantes'::regproc),
  'verificar_participantes roda como security definer');

select * from finish();
rollback;
