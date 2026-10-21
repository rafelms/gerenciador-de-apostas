-- Seed LOCAL (supabase db reset). Nunca roda em produção: `db push` não aplica seed.

-- ---------------------------------------------------------------------------
-- Usuários de teste (somente local)
--   admin@local.test  / Senha12345  (papel admin — precisa ativar MFA para /admin)
--   membro@local.test / Senha12345
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario record;
begin
  for v_usuario in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@local.test',  'Admin Local'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'membro@local.test', 'Membro Local')
    ) as t(id, email, nome)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_usuario.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_usuario.email, extensions.crypt('Senha12345', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', v_usuario.nome),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_usuario.id, v_usuario.id::text,
      jsonb_build_object('sub', v_usuario.id::text, 'email', v_usuario.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

update public.profiles set papel = 'admin' where id = '00000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Concursos FICTÍCIOS (dezenas inventadas), só para o ambiente local ter
-- "último concurso" e sugestão do próximo. Na produção vêm do sync-resultados.
-- ---------------------------------------------------------------------------
insert into public.concursos (modalidade_id, numero, data_sorteio, dezenas, acumulado, data_proximo, fonte)
select m.id, c.numero, c.data_sorteio, c.dezenas, c.acumulado, c.data_proximo, 'manual'
from public.modalidades m
join (values
  ('megasena',  3068, date '2026-10-09', '{5,12,23,34,45,56}'::smallint[], true,  date '2026-10-11'),
  ('megasena',  3069, date '2026-10-11', '{3,17,22,31,40,58}'::smallint[], true,  date '2026-10-14'),
  ('lotofacil', 3520, date '2026-10-11', '{1,2,4,5,7,9,10,12,14,16,18,20,21,23,25}'::smallint[], false, date '2026-10-13'),
  ('quina',     6870, date '2026-10-11', '{8,19,33,57,71}'::smallint[], true, date '2026-10-13')
) as c(slug, numero, data_sorteio, dezenas, acumulado, data_proximo) using (slug);
