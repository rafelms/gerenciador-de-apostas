-- F3.2 — Importação de apostas (seções 7, 8.2 e 11.3).
--   importacoes: registro de cada importação (planilha ou PDF), só do dono.
--   apostas.importacao_id: de qual importação a aposta veio (conferência do lote).
--   importar_apostas: insere um lote de apostas em UMA transação (tudo ou nada).

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  origem public.origem_aposta not null check (origem <> 'manual'),
  nome_arquivo text check (char_length(nome_arquivo) <= 255),
  qtd_apostas int not null check (qtd_apostas between 1 and 2000),
  qtd_erros int not null default 0 check (qtd_erros >= 0),
  created_at timestamptz not null default now()
);

create index importacoes_user_created_idx on public.importacoes (user_id, created_at desc);

comment on table public.importacoes is
  'Log das importações (planilha/PDF). Não guarda o conteúdo do arquivo, só contagens.';

-- RLS padrão "dono". O registro é um log: sem update.
alter table public.importacoes enable row level security;

create policy "dono_select" on public.importacoes for select to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_insert" on public.importacoes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo());
create policy "dono_delete" on public.importacoes for delete to authenticated
  using (user_id = (select auth.uid()) and public.eh_ativo());

grant select, insert, delete on public.importacoes to authenticated;
grant all on public.importacoes to service_role;

-- O default lê a importação em andamento (set_config local da transação, feito só
-- por importar_apostas). Assim salvar_aposta não muda e a aposta não é regravada.
alter table public.apostas
  add column importacao_id uuid
    default nullif(current_setting('lotogestor.importacao_id', true), '')::uuid
    references public.importacoes (id) on delete set null;
create index apostas_importacao_idx on public.apostas (importacao_id)
  where importacao_id is not null;

-- ---------------------------------------------------------------------------
-- RPC: importar um lote de apostas
-- ---------------------------------------------------------------------------
-- p_apostas: array no formato de salvar_aposta (apostaParaRpc no front).
-- security invoker: cada aposta passa pela RLS, pelas constraints e pelos triggers,
-- exatamente como no formulário. Qualquer erro desfaz o lote inteiro; a mensagem diz
-- qual aposta falhou ("Aposta 3: ...") e o SQLSTATE original é mantido (23505 =
-- comprovante já importado).
create function public.importar_apostas(
  p_apostas jsonb,
  p_origem public.origem_aposta,
  p_nome_arquivo text default null,
  p_qtd_erros int default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_indice int := 0;
  v_importacao uuid;
  v_estado text;
  v_mensagem text;
begin
  if p_origem is null or p_origem = 'manual' then
    raise exception 'Origem inválida para importação' using errcode = '22023';
  end if;
  if jsonb_typeof(p_apostas) is distinct from 'array' or jsonb_array_length(p_apostas) = 0 then
    raise exception 'Nenhuma aposta para importar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_apostas) > 2000 then
    raise exception 'Máximo de 2.000 apostas por importação' using errcode = '22023';
  end if;

  insert into public.importacoes (origem, nome_arquivo, qtd_apostas, qtd_erros)
  values (
    p_origem,
    nullif(left(trim(p_nome_arquivo), 255), ''),
    jsonb_array_length(p_apostas),
    greatest(coalesce(p_qtd_erros, 0), 0)
  )
  returning id into v_importacao;
  perform set_config('lotogestor.importacao_id', v_importacao::text, true);

  for v_item in select * from jsonb_array_elements(p_apostas) loop
    v_indice := v_indice + 1;
    begin
      v_ids := v_ids || public.salvar_aposta(
        jsonb_set(v_item, '{origem}', to_jsonb(p_origem::text)),
        null
      );
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_mensagem = message_text;
      raise exception 'Aposta %: %', v_indice, v_mensagem using errcode = v_estado;
    end;
  end loop;

  perform set_config('lotogestor.importacao_id', '', true);
  return jsonb_build_object('importacao_id', v_importacao, 'ids', to_jsonb(v_ids));
end $$;

revoke all on function public.importar_apostas(jsonb, public.origem_aposta, text, int) from public, anon;
grant execute on function public.importar_apostas(jsonb, public.origem_aposta, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Concursos já sorteados que as apostas de uma importação precisam conferir.
-- Só para a Edge Function conferir-apostas (service role), que confere o lote
-- inteiro de uma vez em vez de aposta por aposta.
-- ---------------------------------------------------------------------------
create function public.fn_concursos_sorteados_da_importacao(p_importacao_id uuid, p_user_id uuid)
returns table (concurso_id bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct c.id
  from public.apostas a
  join public.aposta_concursos ac on ac.aposta_id = a.id
  join public.concursos c on c.modalidade_id = ac.modalidade_id and c.numero = ac.numero_concurso
  where a.importacao_id = p_importacao_id
    and a.user_id = p_user_id
    and c.dezenas is not null
  order by c.id
$$;

revoke all on function public.fn_concursos_sorteados_da_importacao(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_concursos_sorteados_da_importacao(uuid, uuid) to service_role;
