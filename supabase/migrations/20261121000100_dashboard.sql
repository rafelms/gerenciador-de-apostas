-- F4.1 — Dashboard (seções 7.3 e 11.7): tudo o que a tela inicial mostra, numa chamada.
--
-- Parte de vw_apostas_resumo (security invoker), então vale a RLS do chamador e os
-- valores são os mesmos da lista de apostas: gasto e recuperado são a parte do usuário
-- e o período é pela data da aposta (o prêmio conta no mês em que a aposta foi feita).

-- Maior faixa premiada da modalidade (6 na Mega, 15 na Lotofácil, 20 na Lotomania).
create function public.faixa_maxima(p_faixas jsonb)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select max((f ->> 'acertos')::smallint) from jsonb_array_elements(p_faixas) f
$$;
grant execute on function public.faixa_maxima(jsonb) to authenticated, service_role;

create function public.fn_dashboard(
  p_inicio date default null,
  p_fim date default null,
  p_modalidade smallint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with r as (
    select v.*, public.faixa_maxima(m.faixas) as max_acertos
    from public.vw_apostas_resumo v
    join public.modalidades m on m.id = v.modalidade_id
    where (p_inicio is null or v.data_aposta >= p_inicio)
      and (p_fim is null or v.data_aposta <= p_fim)
      and (p_modalidade is null or v.modalidade_id = p_modalidade)
  ),
  conf as (
    select c.acertos, c.aposta_id, c.concurso_id, r.modalidade_slug, r.modalidade_nome,
           r.modalidade_cor, r.max_acertos
    from public.conferencias c
    join r on r.id = c.aposta_id
  ),
  -- Concursos das apostas (todas, sem o filtro de período) que ainda não foram sorteados.
  pendentes as (
    select ac.modalidade_id, ac.numero_concurso, count(distinct ac.aposta_id)::int as qtd_apostas
    from public.aposta_concursos ac
    join public.apostas a on a.id = ac.aposta_id and a.status <> 'cancelada'
    where (p_modalidade is null or ac.modalidade_id = p_modalidade)
      and not exists (
        select 1 from public.concursos k
        where k.modalidade_id = ac.modalidade_id and k.numero = ac.numero_concurso
          and k.dezenas is not null)
    group by ac.modalidade_id, ac.numero_concurso
  )
  select jsonb_build_object(
    'totais', (
      select jsonb_build_object(
        'gasto', coalesce(sum(r.gasto_usuario_centavos), 0),
        'recuperado', coalesce(sum(r.recuperado_usuario_centavos), 0),
        'qtd_apostas', count(*),
        'qtd_finalizadas', count(*) filter (where r.status in ('premiada', 'nao_premiada')),
        'qtd_premiadas', count(*) filter (where r.status = 'premiada'))
      from r),
    'mensal', coalesce((
      select jsonb_agg(jsonb_build_object('mes', x.mes, 'gasto', x.gasto, 'recuperado', x.recuperado)
                       order by x.mes)
      from (
        select date_trunc('month', r.data_aposta)::date as mes,
               sum(r.gasto_usuario_centavos) as gasto,
               sum(r.recuperado_usuario_centavos) as recuperado
        from r group by 1) x), '[]'),
    'por_modalidade', coalesce((
      select jsonb_agg(jsonb_build_object(
               'modalidade_id', x.modalidade_id, 'slug', x.modalidade_slug, 'nome', x.modalidade_nome,
               'cor', x.modalidade_cor, 'qtd', x.qtd, 'gasto', x.gasto, 'recuperado', x.recuperado)
             order by x.gasto desc, x.modalidade_nome)
      from (
        select r.modalidade_id, r.modalidade_slug, r.modalidade_nome, r.modalidade_cor,
               count(*) as qtd, sum(r.gasto_usuario_centavos) as gasto,
               sum(r.recuperado_usuario_centavos) as recuperado
        from r group by 1, 2, 3, 4) x), '[]'),
    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'qtd', x.qtd, 'gasto', x.gasto, 'recuperado', x.recuperado)
             order by x.tipo)
      from (
        select r.tipo, count(*) as qtd, sum(r.gasto_usuario_centavos) as gasto,
               sum(r.recuperado_usuario_centavos) as recuperado
        from r group by 1) x), '[]'),
    -- Quantos jogos (jogo × concurso) fizeram cada número de acertos, por modalidade.
    'acertos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', x.modalidade_slug, 'nome', x.modalidade_nome, 'cor', x.modalidade_cor,
               'max_acertos', x.max_acertos, 'acertos', x.acertos, 'qtd', x.qtd)
             order by x.modalidade_nome, x.acertos)
      from (
        select modalidade_slug, modalidade_nome, modalidade_cor, max_acertos, acertos, count(*) as qtd
        from conf group by 1, 2, 3, 4, 5) x), '[]'),
    'top_saldo', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.saldo desc, x.data_aposta desc)
      from (
        select r.id, r.modalidade_slug, r.modalidade_nome, r.modalidade_cor, r.tipo,
               r.concurso_inicial, r.concurso_final, r.data_aposta,
               r.gasto_usuario_centavos as gasto, r.recuperado_usuario_centavos as recuperado,
               r.saldo_centavos as saldo
        from r where r.recuperado_usuario_centavos > 0
        order by r.saldo_centavos desc, r.data_aposta desc
        limit 5) x), '[]'),
    -- Acertos relativos à faixa máxima, para comparar modalidades diferentes.
    'top_acertos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.proporcao desc, x.melhor_acerto desc, x.data_aposta desc)
      from (
        select r.id, r.modalidade_slug, r.modalidade_nome, r.modalidade_cor, r.tipo,
               r.concurso_inicial, r.concurso_final, r.data_aposta, r.melhor_acerto, r.max_acertos,
               round(r.melhor_acerto::numeric / r.max_acertos, 4) as proporcao
        from r where r.melhor_acerto is not null and r.max_acertos > 0
        order by proporcao desc, r.melhor_acerto desc, r.data_aposta desc
        limit 5) x), '[]'),
    -- "Quase lá": jogos a 1 acerto da faixa máxima.
    'quase_la', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data_sorteio desc, x.numero desc)
      from (
        select q.* from (
          select distinct on (conf.aposta_id, conf.concurso_id)
                 conf.aposta_id, conf.modalidade_slug, conf.modalidade_nome, conf.modalidade_cor,
                 k.numero, k.data_sorteio, conf.acertos, conf.max_acertos
          from conf
          join public.concursos k on k.id = conf.concurso_id
          where conf.acertos = conf.max_acertos - 1
          order by conf.aposta_id, conf.concurso_id) q
        order by q.data_sorteio desc, q.numero desc
        limit 10) x), '[]'),
    'proximos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data_sorteio nulls last, x.numero)
      from (
        select m.slug, m.nome, m.cor_hex as cor, p.numero_concurso as numero, p.qtd_apostas,
               coalesce(k.data_sorteio, ant.data_proximo) as data_sorteio
        from pendentes p
        join public.modalidades m on m.id = p.modalidade_id
        left join public.concursos k on k.modalidade_id = p.modalidade_id and k.numero = p.numero_concurso
        left join public.concursos ant on ant.modalidade_id = p.modalidade_id and ant.numero = p.numero_concurso - 1
        order by coalesce(k.data_sorteio, ant.data_proximo) nulls last, p.numero_concurso
        limit 8) x), '[]')
  )
$$;

revoke all on function public.fn_dashboard(date, date, smallint) from public, anon;
grant execute on function public.fn_dashboard(date, date, smallint) to authenticated;
