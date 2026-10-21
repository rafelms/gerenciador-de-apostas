-- Lotomania (antecipada da fase 6 a pedido do dono do produto).
-- Conferido no site da CAIXA e na API de resultados em 21/10/2026:
--   marca 50 números de 00 a 99; são sorteados 20; premia 20, 19, 18, 17, 16, 15 e 0 acertos;
--   preço único de R$ 3,00; teimosinha só para 2, 3, 4, 6, 8, 9 ou 12 concursos;
--   Aposta-Espelho = um 2º jogo com os outros 50 números (cobrado como outro jogo).
-- Bolão: o máximo de cotas não foi confirmado (pendência P5) → sem validação de máximo.

-- ---------------------------------------------------------------------------
-- Quantidades aceitas na teimosinha, por modalidade (null = 2 a 24, regra geral)
-- ---------------------------------------------------------------------------
alter table public.modalidades
  add column teimosinha_concursos smallint[]
    check (teimosinha_concursos is null or (cardinality(teimosinha_concursos) > 0
           and 1 < all (teimosinha_concursos) and 25 > all (teimosinha_concursos)));

insert into public.modalidades
  (slug, nome, universo_min, universo_max, qtd_sorteadas, base_aposta, min_marcadas, max_marcadas,
   faixas, bolao_min_cotas, bolao_max_cotas, cor_hex, teimosinha_concursos)
values
  ('lotomania', 'Lotomania', 0, 99, 20, 50, 50, 50,
   '[{"acertos":20,"nome":"20 acertos"},{"acertos":19,"nome":"19 acertos"},{"acertos":18,"nome":"18 acertos"},{"acertos":17,"nome":"17 acertos"},{"acertos":16,"nome":"16 acertos"},{"acertos":15,"nome":"15 acertos"},{"acertos":0,"nome":"Nenhum acerto"}]',
   2, null, '#F78100', '{2,3,4,6,8,9,12}');

-- Mesmo reajuste das demais modalidades (09/07/2025).
insert into public.modalidade_precos (modalidade_id, preco_simples_centavos, vigente_desde)
select id, 300, date '2025-07-09' from public.modalidades where slug = 'lotomania';

-- ---------------------------------------------------------------------------
-- validar_aposta(): passa a checar também as quantidades da teimosinha
-- ---------------------------------------------------------------------------
create or replace function public.validar_aposta()
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
  if new.tipo = 'teimosinha' and v_mod.teimosinha_concursos is not null
     and not (new.qtd_concursos = any (v_mod.teimosinha_concursos)) then
    raise exception 'A teimosinha da % vale para % concursos', v_mod.nome,
      array_to_string(v_mod.teimosinha_concursos, ', ') using errcode = '23514';
  end if;
  -- A modalidade não pode mudar depois que já existem jogos (as dezenas foram validadas para ela).
  if tg_op = 'UPDATE' and new.modalidade_id <> old.modalidade_id
     and exists (select 1 from public.aposta_jogos where aposta_id = new.id) then
    raise exception 'Não é possível trocar a modalidade de uma aposta com jogos' using errcode = '23514';
  end if;
  return new;
end $$;
