-- Only fictional data in an isolated localhost test database.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
select pg_temp.assert(has_schema_privilege('service_role','private','USAGE'),
 'service has private schema usage');
select pg_temp.assert(not has_schema_privilege('service_role','private','CREATE'),
 'service cannot create private objects');
select pg_temp.assert(not has_schema_privilege('anon','private','USAGE'),
 'private schema remains closed to anonymous users');
select pg_temp.assert(
 has_function_privilege('service_role','private.is_admin(uuid)','EXECUTE') and
 has_function_privilege('service_role','private.can_access_schedules(uuid)','EXECUTE') and
 has_function_privilege('service_role','private.can_manage_schedules(uuid)','EXECUTE'),
 'only required schedule helpers are callable by the service');
select pg_temp.assert(not has_function_privilege('service_role',
 'private.list_my_conversation_managers()','EXECUTE'),
 'unrelated private functions remain closed to service');
select pg_temp.assert(not has_function_privilege('anon','private.is_admin(uuid)','EXECUTE'),
 'anonymous user cannot call admin helper');
select pg_temp.assert(not has_function_privilege('authenticated',
 'public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb)','EXECUTE'),
 'browser still cannot invoke publication RPC directly');
select pg_temp.assert((select bool_and(not prosecdef) from pg_proc
 where oid in ('public.is_admin(uuid)'::regprocedure,
 'public.can_access_schedules(uuid)'::regprocedure,
 'public.can_manage_schedules(uuid)'::regprocedure)),
 'public facades keep SECURITY INVOKER');

insert into public.profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','controller','active'),
 ('00000000-0000-0000-0000-000000000005','admin','inactive');
set local role service_role;
select pg_temp.assert(public.schedule_can_manage_scope(
 '00000000-0000-0000-0000-000000000001','natal','controle-operacional'),
 'service validates active administrator through real private helper chain');
select pg_temp.assert(not public.schedule_can_manage_scope(
 '00000000-0000-0000-0000-000000000002','natal','controle-operacional'),
 'service still denies supervisor management of Control');
select pg_temp.assert(public.schedule_can_manage_scope(
 '00000000-0000-0000-0000-000000000002','natal','adesao-servico'),
 'service still permits supervisor management of other fronts');
select pg_temp.assert(not public.schedule_can_manage_scope(
 '00000000-0000-0000-0000-000000000005','natal','controle-operacional'),
 'inactive administrator remains blocked');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(not public.is_admin('00000000-0000-0000-0000-000000000001'),
 'browser cannot query another user through public facade');
select pg_temp.assert((select count(*)=0 from public.schedule_uploads),
 'grant repair publishes no schedules');
rollback;
