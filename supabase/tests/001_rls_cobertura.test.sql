-- Toda tabela do schema public precisa de RLS + pelo menos uma política,
-- e o papel anon não pode ter nenhum privilégio em tabela pública.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'todas as tabelas públicas têm RLS habilitada'
);

select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  null,
  'todas as tabelas públicas têm ao menos uma política'
);

select is(
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  null,
  'anon não tem privilégio em nenhuma tabela pública'
);

select * from finish();
rollback;
