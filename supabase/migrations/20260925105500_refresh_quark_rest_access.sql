-- Reafirma os privilégios REST das tabelas Quark e força o PostgREST
-- a recarregar o schema. É idempotente e não altera os dados.

grant usage on schema public to authenticated, service_role;

grant select on table public.quark_sync_runs to authenticated;
grant select on table public.quark_people to authenticated;
grant select, insert, update, delete on table public.quark_people_directory to authenticated;
grant select, insert, update, delete on table public.quark_home_locations to authenticated;
grant select on table public.quark_daily_records to authenticated;
grant select on table public.quark_punches to authenticated;

grant all on table public.quark_sync_runs to service_role;
grant all on table public.quark_people to service_role;
grant all on table public.quark_people_directory to service_role;
grant all on table public.quark_home_locations to service_role;
grant all on table public.quark_daily_records to service_role;
grant all on table public.quark_punches to service_role;

select pg_notify('pgrst', 'reload schema');
