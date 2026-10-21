-- Correção: excluir um usuário no Auth falhava ("permission denied for table participantes")
-- quando ele tinha aposta com participantes. O trigger diferido abaixo roda no commit com o
-- papel de quem apaga (supabase_auth_admin, na exclusão em cascata), que não lê `participantes`.
-- security definer faz a checagem rodar com o dono da função, como os demais helpers.
create or replace function public.verificar_participantes()
returns trigger
language plpgsql
security definer
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

revoke all on function public.verificar_participantes() from public, anon, authenticated;
