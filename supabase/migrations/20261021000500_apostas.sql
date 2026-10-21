-- F1.2 (parte 2) — Apostas, jogos, concursos da aposta, participantes e anexos.

-- ---------------------------------------------------------------------------
-- Apostas
-- ---------------------------------------------------------------------------
create table public.apostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  modalidade_id smallint not null references public.modalidades(id),
  tipo public.tipo_aposta not null,
  origem public.origem_aposta not null default 'manual',
  concurso_inicial int not null check (concurso_inicial > 0),
  qtd_concursos smallint not null default 1 check (qtd_concursos between 1 and 24),
  data_aposta date not null,
  -- Bolão
  bolao_total_cotas smallint,
  bolao_cotas_usuario smallint,
  bolao_numero_cota smallint,                -- "Cota: 35/38" -> 35 (informativo)
  valor_cota_centavos bigint check (valor_cota_centavos > 0),
  tarifa_centavos bigint not null default 0 check (tarifa_centavos >= 0),
  -- Valores
  valor_pago_centavos bigint not null check (valor_pago_centavos >= 0),  -- total pago pelo usuário (inclui tarifa)
  -- Rastreio / dedup
  comprovante_hash text check (comprovante_hash ~ '^[0-9a-f]{64}$'),  -- SHA-256 do código do recibo; NUNCA o código puro
  local_compra text check (char_length(local_compra) <= 60),
  observacao text check (char_length(observacao) <= 500),
  status public.status_aposta not null default 'aguardando',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bolao_campos check (
    (tipo <> 'bolao') or
    (bolao_total_cotas >= 2 and bolao_cotas_usuario between 1 and bolao_total_cotas
     and valor_cota_centavos is not null
     and (bolao_numero_cota is null or bolao_numero_cota between 1 and bolao_total_cotas))
  ),
  -- Campos de bolão só existem no bolão.
  constraint bolao_somente_no_bolao check (
    (tipo = 'bolao') or
    (bolao_total_cotas is null and bolao_cotas_usuario is null and bolao_numero_cota is null
     and valor_cota_centavos is null and tarifa_centavos = 0)
  ),
  -- Tarifa de serviço: até 35% da cota (+1 centavo de tolerância de arredondamento).
  constraint tarifa_ate_35 check (tipo <> 'bolao' or tarifa_centavos <= round(valor_cota_centavos * 0.35) + 1),
  constraint teimosinha_qtd check ((tipo = 'teimosinha') = (qtd_concursos > 1)),
  unique (user_id, comprovante_hash)
);
create index on public.apostas (user_id, data_aposta desc);
create index on public.apostas (user_id, modalidade_id);
create index on public.apostas (modalidade_id, concurso_inicial);

create trigger apostas_updated_at
  before update on public.apostas
  for each row execute function public.set_updated_at();

-- Limites de cotas do bolão por modalidade (colunas de `modalidades`; nulas = sem validação).
create function public.validar_aposta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mod public.modalidades;
begin
  select * into v_mod from public.modalidades where id = new.modalidade_id;
  if new.tipo = 'bolao' then
    if v_mod.bolao_min_cotas is not null and new.bolao_total_cotas < v_mod.bolao_min_cotas then
      raise exception '% exige pelo menos % cotas no bolão', v_mod.nome, v_mod.bolao_min_cotas using errcode = '23514';
    end if;
    if v_mod.bolao_max_cotas is not null and new.bolao_total_cotas > v_mod.bolao_max_cotas then
      raise exception '% aceita no máximo % cotas no bolão', v_mod.nome, v_mod.bolao_max_cotas using errcode = '23514';
    end if;
  end if;
  -- A modalidade não pode mudar depois que já existem jogos (as dezenas foram validadas para ela).
  if tg_op = 'UPDATE' and new.modalidade_id <> old.modalidade_id
     and exists (select 1 from public.aposta_jogos where aposta_id = new.id) then
    raise exception 'Não é possível trocar a modalidade de uma aposta com jogos' using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Jogos
-- ---------------------------------------------------------------------------
create table public.aposta_jogos (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references public.apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),  -- denormalizado para RLS simples
  ordem smallint not null check (ordem > 0), -- "Jogo 1", "Jogo 2"
  dezenas smallint[] not null,
  unique (aposta_id, ordem)
);
create index on public.aposta_jogos (user_id);

-- Dezenas únicas, ordenadas, dentro do universo e na quantidade permitida pela
-- modalidade. No bolão, todos os jogos com a mesma quantidade (regra da CAIXA).
-- O banco é a última barreira: nada depende só do front (seção 8.9).
create function public.validar_dezenas()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mod public.modalidades;
  v_tipo public.tipo_aposta;
  v_qtd int;
  v_unicas int;
  v_fora int;
begin
  select a.tipo into v_tipo from public.apostas a where a.id = new.aposta_id;
  select m.* into v_mod
  from public.apostas a
  join public.modalidades m on m.id = a.modalidade_id
  where a.id = new.aposta_id;

  if v_mod.id is null then
    raise exception 'Aposta não encontrada' using errcode = '23503';
  end if;

  if array_position(new.dezenas, null) is not null then
    raise exception 'Dezenas não podem ser nulas' using errcode = '23514';
  end if;

  v_qtd := coalesce(cardinality(new.dezenas), 0);
  select count(distinct d), count(*) filter (where d < v_mod.universo_min or d > v_mod.universo_max)
    into v_unicas, v_fora
  from unnest(new.dezenas) as d;

  if v_unicas <> v_qtd then
    raise exception 'Jogo % tem dezenas repetidas', new.ordem using errcode = '23514';
  end if;
  if v_fora > 0 then
    raise exception 'Jogo %: dezena fora do intervalo %–%', new.ordem, v_mod.universo_min, v_mod.universo_max
      using errcode = '23514';
  end if;
  if v_qtd < v_mod.min_marcadas or v_qtd > v_mod.max_marcadas then
    raise exception '% aceita de % a % dezenas; encontradas %', v_mod.nome, v_mod.min_marcadas, v_mod.max_marcadas, v_qtd
      using errcode = '23514';
  end if;
  if v_tipo = 'bolao' and exists (
    select 1 from public.aposta_jogos j
    where j.aposta_id = new.aposta_id and j.id <> new.id and cardinality(j.dezenas) <> v_qtd
  ) then
    raise exception 'No bolão, todos os jogos têm a mesma quantidade de dezenas' using errcode = '23514';
  end if;

  -- Guarda sempre ordenado.
  new.dezenas := (select array_agg(d order by d) from unnest(new.dezenas) as d);
  return new;
end $$;

create trigger aposta_jogos_validar_dezenas
  before insert or update of dezenas, aposta_id on public.aposta_jogos
  for each row execute function public.validar_dezenas();

create trigger apostas_validar
  before insert or update on public.apostas
  for each row execute function public.validar_aposta();

-- ---------------------------------------------------------------------------
-- Concursos de cada aposta (1 linha p/ simples/bolão; N p/ teimosinha)
-- ---------------------------------------------------------------------------
create table public.aposta_concursos (
  aposta_id uuid not null references public.apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  modalidade_id smallint not null,
  numero_concurso int not null,
  primary key (aposta_id, numero_concurso)
);
create index on public.aposta_concursos (modalidade_id, numero_concurso);
create index on public.aposta_concursos (user_id);

-- Ao inserir/alterar a aposta, (re)gera as linhas concurso_inicial .. +qtd_concursos-1.
-- Mantém as linhas que continuam valendo (estáveis para a conferência da fase 2).
create function public.expandir_aposta_concursos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.aposta_concursos
  where aposta_id = new.id
    and (modalidade_id <> new.modalidade_id
         or numero_concurso not between new.concurso_inicial and new.concurso_inicial + new.qtd_concursos - 1);

  insert into public.aposta_concursos (aposta_id, user_id, modalidade_id, numero_concurso)
  select new.id, new.user_id, new.modalidade_id, n
  from generate_series(new.concurso_inicial, new.concurso_inicial + new.qtd_concursos - 1) as n
  on conflict (aposta_id, numero_concurso) do nothing;

  return null;
end $$;

create trigger apostas_expandir_concursos
  after insert or update of concurso_inicial, qtd_concursos, modalidade_id on public.apostas
  for each row execute function public.expandir_aposta_concursos();

revoke all on function public.expandir_aposta_concursos() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Participantes da divisão (apenas nomes; não são usuários do sistema)
-- ---------------------------------------------------------------------------
create table public.participantes (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references public.apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nome text not null check (char_length(nome) between 1 and 60),
  peso numeric(6,2) not null default 1 check (peso > 0),
  eh_usuario boolean not null default false, -- exatamente 1 por aposta quando houver participantes
  contribuicao_centavos bigint check (contribuicao_centavos >= 0),  -- null = proporcional ao peso
  ordem smallint not null default 0
);
create index on public.participantes (aposta_id);
create unique index participantes_um_usuario on public.participantes (aposta_id) where eh_usuario;

-- Checado no fim da transação: se a aposta tem participantes, exatamente um é o usuário.
create function public.verificar_participantes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_aposta uuid := coalesce(new.aposta_id, old.aposta_id);
  v_total int;
  v_usuarios int;
begin
  select count(*), count(*) filter (where eh_usuario) into v_total, v_usuarios
  from public.participantes where aposta_id = v_aposta;
  if v_total > 0 and v_usuarios <> 1 then
    raise exception 'A divisão precisa incluir o próprio usuário exatamente uma vez' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger participantes_um_usuario_check
  after insert or update or delete on public.participantes
  deferrable initially deferred
  for each row execute function public.verificar_participantes();

-- ---------------------------------------------------------------------------
-- Anexos (fotos do comprovante no Storage — tela na fase 5)
-- ---------------------------------------------------------------------------
create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  aposta_id uuid not null references public.apostas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  storage_path text not null,                -- {user_id}/{aposta_id}/{uuid}.webp
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  tamanho_bytes int not null check (tamanho_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  -- O caminho precisa começar pela pasta do dono e da aposta.
  check (storage_path like user_id::text || '/' || aposta_id::text || '/%')
);
create index on public.anexos (aposta_id);
