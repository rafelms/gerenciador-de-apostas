-- F2.2 — Conferências, prêmios, divisão do prêmio, notificações e log da sincronização.
-- Quem escreve aqui é a Edge Function `conferir-apostas` (service role). O usuário só lê,
-- exceto o prêmio informado à mão (valor_informado_manual) e o "lida" das notificações.

-- ---------------------------------------------------------------------------
-- Conferência de cada jogo em cada concurso
-- ---------------------------------------------------------------------------
create table public.conferencias (
  aposta_jogo_id uuid not null references public.aposta_jogos(id) on delete cascade,
  concurso_id bigint not null references public.concursos(id) on delete cascade,
  aposta_id uuid not null references public.apostas(id) on delete cascade,  -- denormalizado para leitura
  user_id uuid not null,
  acertos smallint not null check (acertos >= 0),
  dezenas_acertadas smallint[] not null,
  premios_por_faixa jsonb not null,          -- { "6": 0, "5": 1, "4": 6 } (qtd de combinações premiadas)
  conferido_em timestamptz not null default now(),
  primary key (aposta_jogo_id, concurso_id)
);
create index on public.conferencias (aposta_id);
create index on public.conferencias (user_id);
create index on public.conferencias (concurso_id);

-- ---------------------------------------------------------------------------
-- Prêmio da aposta em um concurso
-- ---------------------------------------------------------------------------
create table public.premios (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references public.apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  concurso_id bigint not null references public.concursos(id) on delete cascade,
  bruto_aposta_centavos bigint not null check (bruto_aposta_centavos >= 0),   -- aposta inteira (todas as cotas)
  bruto_usuario_centavos bigint not null check (bruto_usuario_centavos >= 0), -- parte do usuário (cotas dele)
  ir_usuario_centavos bigint not null check (ir_usuario_centavos >= 0),
  liquido_usuario_centavos bigint not null,
  regra_ir jsonb not null,                   -- snapshot da configuração usada no cálculo
  -- Faixas premiadas sem valor no rateio (resultado manual sem rateio, rateio ainda não
  -- publicado): o prêmio fica incompleto até sair o rateio ou o usuário informar o valor.
  faixas_sem_valor smallint[] not null default '{}',
  valor_informado_manual boolean not null default false,
  status public.status_premio not null default 'a_resgatar',
  prazo_resgate date not null,               -- data_sorteio + prazo_resgate_dias (padrão 90)
  resgatado_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aposta_id, concurso_id),
  check (ir_usuario_centavos <= bruto_usuario_centavos),
  check (liquido_usuario_centavos = bruto_usuario_centavos - ir_usuario_centavos),
  check ((status = 'resgatado') = (resgatado_em is not null))
);
create index on public.premios (user_id);
create index on public.premios (status, prazo_resgate);

create trigger premios_updated_at
  before update on public.premios
  for each row execute function public.set_updated_at();

-- Prazo de resgate calculado a partir do sorteio quando não informado (prêmio manual).
-- A aposta e o concurso precisam ser da mesma modalidade.
create function public.preparar_premio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data date;
  v_mod_concurso smallint;
  v_mod_aposta smallint;
begin
  select c.data_sorteio, c.modalidade_id into v_data, v_mod_concurso from public.concursos c where c.id = new.concurso_id;
  select a.modalidade_id into v_mod_aposta from public.apostas a where a.id = new.aposta_id;
  if v_mod_concurso is distinct from v_mod_aposta then
    raise exception 'O concurso não é da modalidade da aposta' using errcode = '23514';
  end if;
  if new.prazo_resgate is null then
    new.prazo_resgate := v_data + (select prazo_resgate_dias from public.configuracoes where id = 1);
  end if;
  return new;
end $$;

create trigger premios_preparar
  before insert or update of aposta_id, concurso_id, prazo_resgate on public.premios
  for each row execute function public.preparar_premio();

revoke all on function public.preparar_premio() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Divisão do prêmio entre os participantes (snapshot do rateio)
-- ---------------------------------------------------------------------------
create table public.premio_divisoes (
  premio_id uuid not null references public.premios(id) on delete cascade,
  participante_id uuid not null references public.participantes(id) on delete cascade,
  user_id uuid not null,
  liquido_centavos bigint not null check (liquido_centavos >= 0),
  primary key (premio_id, participante_id)
);
create index on public.premio_divisoes (user_id);

-- ---------------------------------------------------------------------------
-- Notificações internas (seção 11.11)
-- ---------------------------------------------------------------------------
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo public.tipo_notificacao not null,
  titulo text not null check (char_length(titulo) between 1 and 200),
  corpo text check (char_length(corpo) <= 1000),
  link text check (link like '/%'),          -- rota interna, ex.: /apostas/<id>
  chave_dedup text,                          -- evita notificação duplicada
  lida_em timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, chave_dedup)
);
create index on public.notificacoes (user_id, created_at desc);

-- Realtime: o sino recebe a notificação na hora (a RLS filtra por usuário).
alter publication supabase_realtime add table public.notificacoes;

-- ---------------------------------------------------------------------------
-- Log da sincronização de resultados (seção 16 — visível só no admin)
-- ---------------------------------------------------------------------------
create table public.sync_logs (
  id bigserial primary key,
  executado_em timestamptz not null default now(),
  origem text not null check (origem in ('cron', 'admin', 'manual')),
  modalidade_id smallint references public.modalidades(id),
  status text not null check (status in ('ok', 'erro')),
  ultimo_concurso int,
  inseridos int not null default 0,
  conferidos int not null default 0,
  mensagem text check (char_length(mensagem) <= 500)
);
create index on public.sync_logs (executado_em desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conferencias enable row level security;
alter table public.premios enable row level security;
alter table public.premio_divisoes enable row level security;
alter table public.notificacoes enable row level security;
alter table public.sync_logs enable row level security;

-- Conferências e divisões: o dono só lê; quem grava é a service role.
create policy "dono_select" on public.conferencias for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_select" on public.premio_divisoes for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());

-- Prêmios: o dono lê todos e só cria/edita/apaga os informados à mão.
create policy "dono_select" on public.premios for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_insert_manual" on public.premios for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo() and valor_informado_manual
    and exists (select 1 from public.apostas a where a.id = aposta_id and a.user_id = (select auth.uid())));
create policy "dono_update_manual" on public.premios for update to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo())
  with check (user_id = (select auth.uid()) and valor_informado_manual);
create policy "dono_delete_manual" on public.premios for delete to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo() and valor_informado_manual);

-- Notificações: o dono lê e marca como lida (GRANT só na coluna lida_em).
create policy "dono_select" on public.notificacoes for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_update" on public.notificacoes for update to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo())
  with check (user_id = (select auth.uid()));

-- Log da sincronização: só o admin com MFA lê.
create policy "admin_select" on public.sync_logs for select to authenticated
  using (public.eh_admin() and public.aal2());

grant select on public.conferencias, public.premio_divisoes, public.sync_logs to authenticated;
grant select, delete on public.premios to authenticated;
grant insert (aposta_id, concurso_id, bruto_aposta_centavos, bruto_usuario_centavos, ir_usuario_centavos,
              liquido_usuario_centavos, regra_ir, valor_informado_manual)
  on public.premios to authenticated;
grant update (bruto_aposta_centavos, bruto_usuario_centavos, ir_usuario_centavos, liquido_usuario_centavos,
              regra_ir, faixas_sem_valor, valor_informado_manual)
  on public.premios to authenticated;
grant select on public.notificacoes to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;
grant all on public.conferencias, public.premios, public.premio_divisoes, public.notificacoes, public.sync_logs
  to service_role;
grant usage on sequence public.sync_logs_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Marcar prêmio como resgatado (ou desfazer). security definer: o dono não tem
-- GRANT em status/resgatado_em, que mudam só por aqui ou pelo job de expiração.
-- ---------------------------------------------------------------------------
create function public.fn_marcar_resgatado(p_premio_id uuid, p_resgatado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.premios set
    status = case
      when p_resgatado then 'resgatado'::public.status_premio
      when prazo_resgate < v_hoje then 'expirado'::public.status_premio
      else 'a_resgatar'::public.status_premio
    end,
    resgatado_em = case when p_resgatado then coalesce(resgatado_em, v_hoje) end
  where id = p_premio_id and user_id = (select auth.uid()) and public.eh_ativo();
  if not found then
    raise exception 'Prêmio não encontrado' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.fn_marcar_resgatado(uuid, boolean) from public, anon;
grant execute on function public.fn_marcar_resgatado(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ao editar uma aposta, a conferência é refeita (seção 11.2): apagamos os prêmios
-- calculados (os manuais ficam). As conferências caem em cascata com os jogos.
-- ---------------------------------------------------------------------------
create function public.fn_limpar_conferencia(p_aposta_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.premios p
  where p.aposta_id = p_aposta_id and not p.valor_informado_manual
    and exists (select 1 from public.apostas a where a.id = p_aposta_id and a.user_id = (select auth.uid()));
$$;

-- O dono executa (via salvar_aposta, que é security invoker); a função só apaga a aposta dele.
revoke all on function public.fn_limpar_conferencia(uuid) from public, anon;
grant execute on function public.fn_limpar_conferencia(uuid) to authenticated;

-- salvar_aposta passa a limpar a conferência antiga na edição.
create or replace function public.salvar_aposta(p_aposta jsonb, p_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_modalidade_id smallint;
  v_jogo jsonb;
  v_ordem int := 0;
  v_part jsonb;
begin
  select id into v_modalidade_id from public.modalidades
  where slug = p_aposta->>'modalidade_slug' and ativa;
  if v_modalidade_id is null then
    raise exception 'Modalidade inválida' using errcode = '22023';
  end if;

  if jsonb_typeof(p_aposta->'jogos') <> 'array' or jsonb_array_length(p_aposta->'jogos') = 0 then
    raise exception 'Adicione pelo menos um jogo' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.apostas (
      modalidade_id, tipo, origem, concurso_inicial, qtd_concursos, data_aposta,
      bolao_total_cotas, bolao_cotas_usuario, bolao_numero_cota, valor_cota_centavos, tarifa_centavos,
      valor_pago_centavos, comprovante_hash, local_compra, observacao
    ) values (
      v_modalidade_id,
      (p_aposta->>'tipo')::public.tipo_aposta,
      coalesce((p_aposta->>'origem')::public.origem_aposta, 'manual'),
      (p_aposta->>'concurso_inicial')::int,
      coalesce((p_aposta->>'qtd_concursos')::smallint, 1),
      (p_aposta->>'data_aposta')::date,
      (p_aposta->>'bolao_total_cotas')::smallint,
      (p_aposta->>'bolao_cotas_usuario')::smallint,
      (p_aposta->>'bolao_numero_cota')::smallint,
      (p_aposta->>'valor_cota_centavos')::bigint,
      coalesce((p_aposta->>'tarifa_centavos')::bigint, 0),
      (p_aposta->>'valor_pago_centavos')::bigint,
      nullif(p_aposta->>'comprovante_hash', ''),
      nullif(trim(p_aposta->>'local_compra'), ''),
      nullif(trim(p_aposta->>'observacao'), '')
    )
    returning id into v_id;
  else
    update public.apostas set
      modalidade_id = v_modalidade_id,
      tipo = (p_aposta->>'tipo')::public.tipo_aposta,
      concurso_inicial = (p_aposta->>'concurso_inicial')::int,
      qtd_concursos = coalesce((p_aposta->>'qtd_concursos')::smallint, 1),
      data_aposta = (p_aposta->>'data_aposta')::date,
      bolao_total_cotas = (p_aposta->>'bolao_total_cotas')::smallint,
      bolao_cotas_usuario = (p_aposta->>'bolao_cotas_usuario')::smallint,
      bolao_numero_cota = (p_aposta->>'bolao_numero_cota')::smallint,
      valor_cota_centavos = (p_aposta->>'valor_cota_centavos')::bigint,
      tarifa_centavos = coalesce((p_aposta->>'tarifa_centavos')::bigint, 0),
      valor_pago_centavos = (p_aposta->>'valor_pago_centavos')::bigint,
      local_compra = nullif(trim(p_aposta->>'local_compra'), ''),
      observacao = nullif(trim(p_aposta->>'observacao'), ''),
      -- Editar refaz a conferência: volta a aguardar até o front pedir a nova conferência.
      status = 'aguardando'
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Aposta não encontrada' using errcode = 'P0002';
    end if;

    -- Jogos e participantes são regravados por inteiro (as conferências caem em cascata).
    delete from public.aposta_jogos where aposta_id = v_id;
    delete from public.participantes where aposta_id = v_id;
    perform public.fn_limpar_conferencia(v_id);
  end if;

  for v_jogo in select * from jsonb_array_elements(p_aposta->'jogos') loop
    v_ordem := v_ordem + 1;
    insert into public.aposta_jogos (aposta_id, ordem, dezenas)
    values (v_id, v_ordem, array(select (jsonb_array_elements_text(v_jogo))::smallint));
  end loop;

  v_ordem := 0;
  for v_part in select * from jsonb_array_elements(coalesce(p_aposta->'participantes', '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    insert into public.participantes (aposta_id, nome, peso, eh_usuario, contribuicao_centavos, ordem)
    values (
      v_id,
      trim(v_part->>'nome'),
      coalesce((v_part->>'peso')::numeric, 1),
      coalesce((v_part->>'eh_usuario')::boolean, false),
      (v_part->>'contribuicao_centavos')::bigint,
      v_ordem
    );
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Job diário (chamado pelo sync-resultados): expira prêmios, avisa prazos e faz limpeza.
-- ---------------------------------------------------------------------------
create function public.fn_processar_prazos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_expirados int;
  v_avisos int;
begin
  update public.premios set status = 'expirado'
  where status = 'a_resgatar' and prazo_resgate < v_hoje;
  get diagnostics v_expirados = row_count;

  -- Avisos 7 dias e 1 dia antes do vencimento (chave_dedup garante um de cada).
  insert into public.notificacoes (user_id, tipo, titulo, corpo, link, chave_dedup)
  select p.user_id, 'premio_expirando',
    case when p.prazo_resgate - v_hoje <= 1
      then 'Seu prêmio vence ' || case when p.prazo_resgate = v_hoje then 'hoje' else 'amanhã' end
      else 'Seu prêmio vence em ' || (p.prazo_resgate - v_hoje) || ' dias' end,
    m.nome || ' ' || c.numero || ': resgate até ' || to_char(p.prazo_resgate, 'DD/MM/YYYY') || '.',
    '/apostas/' || p.aposta_id,
    'premio_expirando:' || p.id || ':' || case when p.prazo_resgate - v_hoje <= 1 then '1' else '7' end
  from public.premios p
  join public.concursos c on c.id = p.concurso_id
  join public.modalidades m on m.id = c.modalidade_id
  where p.status = 'a_resgatar' and p.liquido_usuario_centavos > 0
    and p.prazo_resgate - v_hoje between 0 and 7
  on conflict (user_id, chave_dedup) do nothing;
  get diagnostics v_avisos = row_count;

  -- Retenção (seção 11.11): notificações lidas há mais de 90 dias; log de sync com mais de 90 dias.
  delete from public.notificacoes where lida_em < now() - interval '90 days';
  delete from public.sync_logs where executado_em < now() - interval '90 days';

  return jsonb_build_object('expirados', v_expirados, 'avisos', v_avisos);
end $$;

revoke all on function public.fn_processar_prazos() from public, anon, authenticated;
grant execute on function public.fn_processar_prazos() to service_role;

-- ---------------------------------------------------------------------------
-- Resumo por aposta: agora com recuperado e melhor acerto reais (seção 7.3)
--   recuperado = Σ premio_divisoes.liquido do participante "eu"
--              = Σ premios.liquido_usuario, sem participantes
-- Se a divisão ainda não foi gravada, usa a fração do peso do usuário.
-- ---------------------------------------------------------------------------
drop view public.vw_apostas_resumo;

create view public.vw_apostas_resumo
with (security_invoker = true) as
with divisao as (
  select
    p.aposta_id,
    count(*) as qtd_participantes,
    bool_and(p.contribuicao_centavos is not null) as tem_contribuicoes,
    sum(p.peso) as soma_pesos,
    max(p.peso) filter (where p.eh_usuario) as peso_usuario,
    max(p.contribuicao_centavos) filter (where p.eh_usuario) as contribuicao_usuario
  from public.participantes p
  group by p.aposta_id
),
jogos as (
  select aposta_id, count(*) as qtd_jogos, max(cardinality(dezenas)) as max_dezenas
  from public.aposta_jogos
  group by aposta_id
),
premiacao as (
  select
    pr.aposta_id,
    count(*)::int as qtd_premios,
    sum(pr.bruto_usuario_centavos)::bigint as bruto_usuario,
    sum(pr.liquido_usuario_centavos)::bigint as liquido_usuario,
    bool_or(pr.status = 'a_resgatar' and pr.liquido_usuario_centavos > 0) as tem_a_resgatar,
    bool_or(cardinality(pr.faixas_sem_valor) > 0 and not pr.valor_informado_manual) as valor_pendente
  from public.premios pr
  group by pr.aposta_id
),
divisoes_usuario as (
  select pr.aposta_id, sum(pd.liquido_centavos)::bigint as liquido
  from public.premio_divisoes pd
  join public.premios pr on pr.id = pd.premio_id
  join public.participantes pa on pa.id = pd.participante_id and pa.eh_usuario
  group by pr.aposta_id
),
conferido as (
  select cf.aposta_id, max(cf.acertos)::smallint as melhor_acerto, count(distinct cf.concurso_id)::int as concursos_conferidos
  from public.conferencias cf
  group by cf.aposta_id
),
base as (
  select
    a.*,
    m.slug as modalidade_slug,
    m.nome as modalidade_nome,
    m.cor_hex as modalidade_cor,
    a.concurso_inicial + a.qtd_concursos - 1 as concurso_final,
    coalesce(j.qtd_jogos, 0)::int as qtd_jogos,
    j.max_dezenas,
    coalesce(d.qtd_participantes, 0)::int as qtd_participantes,
    case
      when d.aposta_id is null then a.valor_pago_centavos
      when d.tem_contribuicoes then d.contribuicao_usuario
      else round(a.valor_pago_centavos * d.peso_usuario / d.soma_pesos)::bigint
    end as gasto_usuario_centavos,
    case
      when pr.aposta_id is null then 0::bigint
      when d.aposta_id is null then pr.liquido_usuario
      else coalesce(du.liquido, round(pr.liquido_usuario * d.peso_usuario / d.soma_pesos)::bigint)
    end as recuperado_usuario_centavos,
    cf.melhor_acerto,
    coalesce(cf.concursos_conferidos, 0) as concursos_conferidos,
    coalesce(pr.qtd_premios, 0) as qtd_premios,
    coalesce(pr.bruto_usuario, 0::bigint) as premio_bruto_usuario_centavos,
    coalesce(pr.liquido_usuario, 0::bigint) as premio_liquido_usuario_centavos,
    coalesce(pr.tem_a_resgatar, false) as premio_a_resgatar,
    coalesce(pr.valor_pendente, false) as premio_valor_pendente
  from public.apostas a
  join public.modalidades m on m.id = a.modalidade_id
  left join jogos j on j.aposta_id = a.id
  left join divisao d on d.aposta_id = a.id
  left join premiacao pr on pr.aposta_id = a.id
  left join divisoes_usuario du on du.aposta_id = a.id
  left join conferido cf on cf.aposta_id = a.id
)
select
  base.*,
  (recuperado_usuario_centavos - gasto_usuario_centavos) as saldo_centavos
from base;

grant select on public.vw_apostas_resumo to authenticated;
