-- F5.3 — Anexos (seção 8.4 e 11.12): bucket privado `comprovantes`, políticas por pasta
-- do dono e no máximo 3 imagens por aposta. O arquivo fica em
-- {user_id}/{aposta_id}/{uuid}.webp e só é lido por URL assinada de curta duração.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A 1ª pasta é o dono; a 2ª, uma aposta dele. Ninguém lê nem grava fora disso,
-- nem o admin (anexos de outros usuários nunca são expostos, seção 8.1).
create policy "comprovantes_dono_select" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and public.eh_ativo());

create policy "comprovantes_dono_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.eh_ativo()
              and exists (select 1 from public.apostas a
                          where a.id::text = (storage.foldername(name))[2]
                            and a.user_id = (select auth.uid())));

create policy "comprovantes_dono_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and public.eh_ativo());

-- ---------------------------------------------------------------------------
-- Até 3 anexos por aposta (seção 11.12)
-- ---------------------------------------------------------------------------
create function public.fn_limite_anexos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serializa por aposta: dois uploads simultâneos não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended(new.aposta_id::text, 0));
  if (select count(*) from public.anexos where aposta_id = new.aposta_id) >= 3 then
    raise exception 'Cada aposta aceita no máximo 3 imagens.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger anexos_limite
  before insert on public.anexos
  for each row execute function public.fn_limite_anexos();
