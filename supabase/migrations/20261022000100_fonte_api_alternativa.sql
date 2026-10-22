-- Resultado vindo da API alternativa (espelho comunitário da API da CAIXA), usada quando a
-- CAIXA bloqueia a nuvem do Supabase (pendência P4). Não é oficial: a sincronização busca o
-- concurso de novo e o substitui pelo da CAIXA ('api_caixa') assim que ela responder.

alter table public.concursos drop constraint concursos_fonte_check;
alter table public.concursos add constraint concursos_fonte_check
  check (fonte in ('api_caixa', 'api_alternativa', 'manual', 'usuario'));
