-- Resultado informado por um usuário (não oficial) para um concurso da própria aposta,
-- enquanto a API da CAIXA não responde. A sincronização o substitui pelo oficial
-- (fonte 'api_caixa') assim que a API devolver o concurso.

alter table public.concursos drop constraint concursos_fonte_check;
alter table public.concursos add constraint concursos_fonte_check
  check (fonte in ('api_caixa', 'manual', 'usuario'));

alter table public.sync_logs drop constraint sync_logs_origem_check;
alter table public.sync_logs add constraint sync_logs_origem_check
  check (origem in ('cron', 'admin', 'manual', 'usuario'));
