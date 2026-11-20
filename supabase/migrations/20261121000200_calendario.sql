-- F4.3 — Calendário (seção 11.8): eventos do usuário num intervalo de datas.
--
-- Tipos de evento:
--   aposta  — dia em que a aposta foi feita (valor = parte do usuário);
--   sorteio — sorteio de um concurso com apostas do usuário (qtd = apostas no concurso).
--             Concurso ainda não cadastrado usa o data_proximo do anterior (estimada = true);
--   premio  — prêmio a resgatar, no dia do sorteio (valor = líquido do usuário, a parte
--             dele quando há divisão);
--   prazo   — último dia para resgatar um prêmio ainda não resgatado.
-- Security invoker: a RLS do chamador vale para tudo.

create function public.fn_calendario(p_inicio date, p_fim date)
returns table (
  data date,
  tipo text,
  modalidade_slug text,
  modalidade_nome text,
  modalidade_cor text,
  concurso int,
  aposta_id uuid,
  premio_id uuid,
  valor_centavos bigint,
  qtd int,
  sorteado boolean,
  estimada boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Apostas feitas no intervalo.
  select v.data_aposta, 'aposta', v.modalidade_slug, v.modalidade_nome, v.modalidade_cor,
         v.concurso_inicial, v.id, null::uuid, v.gasto_usuario_centavos, 1, null::boolean,
         false
  from public.vw_apostas_resumo v
  where v.data_aposta between p_inicio and p_fim

  union all

  -- Sorteios com apostas do usuário (uma linha por concurso).
  select s.data_sorteio, 'sorteio', m.slug, m.nome, m.cor_hex, s.numero_concurso, null, null,
         null, s.qtd, s.sorteado, s.estimada
  from (
    select ac.modalidade_id, ac.numero_concurso,
           count(distinct ac.aposta_id)::int as qtd,
           coalesce(k.data_sorteio, ant.data_proximo) as data_sorteio,
           coalesce(k.dezenas is not null, false) as sorteado,
           k.id is null as estimada
    from public.aposta_concursos ac
    join public.apostas a on a.id = ac.aposta_id and a.status <> 'cancelada'
    left join public.concursos k
      on k.modalidade_id = ac.modalidade_id and k.numero = ac.numero_concurso
    left join public.concursos ant
      on ant.modalidade_id = ac.modalidade_id and ant.numero = ac.numero_concurso - 1
    group by ac.modalidade_id, ac.numero_concurso, k.id, k.data_sorteio, k.dezenas, ant.data_proximo
  ) s
  join public.modalidades m on m.id = s.modalidade_id
  where s.data_sorteio between p_inicio and p_fim

  union all

  -- Prêmios (no dia do sorteio) e o fim do prazo de resgate dos que estão a resgatar.
  -- Com divisão, o valor é a parte do próprio usuário (como na vw_apostas_resumo).
  select e.data, e.tipo, m.slug, m.nome, m.cor_hex, k.numero, p.aposta_id, p.id,
         coalesce(du.liquido_centavos, p.liquido_usuario_centavos), 1, null, false
  from public.premios p
  join public.concursos k on k.id = p.concurso_id
  join public.apostas a on a.id = p.aposta_id
  join public.modalidades m on m.id = a.modalidade_id
  left join lateral (
    select pd.liquido_centavos
    from public.premio_divisoes pd
    join public.participantes pa on pa.id = pd.participante_id and pa.eh_usuario
    where pd.premio_id = p.id
  ) du on true
  cross join lateral (values (k.data_sorteio, 'premio'), (p.prazo_resgate, 'prazo')) e(data, tipo)
  where p.liquido_usuario_centavos > 0
    and p.status = 'a_resgatar'
    and e.data between p_inicio and p_fim

  order by 1, 2, 3, 6
$$;

revoke all on function public.fn_calendario(date, date) from public, anon;
grant execute on function public.fn_calendario(date, date) to authenticated;
