-- Run with scripts/test-schedule-publication.mjs against an EMPTY LOCAL test DB.
-- Fixture identities only. All fixture data is rolled back.
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare message text;
begin
 begin
  execute statement;
 exception when others then get stacked diagnostics message=MESSAGE_TEXT;
 end;
 if message is null or message !~* expected then
  raise exception 'FAIL: expected %, got %',expected,message;
 end if;
 raise notice 'PASS: rejected %',expected;
end $$;
select pg_temp.assert((select count(*)=0 from schedule_uploads), 'migration does not publish');
select pg_temp.assert(not has_function_privilege('authenticated',
 'public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb)','EXECUTE'),
 'browser cannot invoke publication RPC');
select pg_temp.assert(not has_function_privilege('anon',
 'public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb)','EXECUTE'),
 'anonymous cannot invoke publication RPC');
select pg_temp.assert(has_function_privilege('service_role',
 'public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb)','EXECUTE'),
 'Edge service can invoke publication RPC');
select pg_temp.assert(not has_function_privilege('authenticated',
 'public.schedule_operational_apply_sync(uuid,timestamptz,uuid,jsonb,jsonb)','EXECUTE'),
 'browser cannot bypass synchronization');
select pg_temp.assert(not (select prosecdef from pg_proc where oid=
 'public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb)'::regprocedure),
 'publication uses security invoker');

insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','admin','pending');
with calendar as (
 select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
   jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') assignments
 from generate_series('2026-12-01'::date,'2027-01-03'::date,interval '1 day') day
)
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select '10000000-0000-0000-0000-000000000001','natal','controle-operacional','2026-12-01',2,
 jsonb_build_object('dates',dates,'codes',jsonb_build_array('T. 1'),
 'people',jsonb_build_array(jsonb_build_object(
   'name','TEST EMPLOYEE','jobTitle','CONTROLADOR','assignments',assignments))),
 '00000000-0000-0000-0000-000000000001' from calendar;
insert into schedule_operational_sheets(
 id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,
 sheet_tab,planned_payload,current_payload,created_by)
select '20000000-0000-0000-0000-000000000001',id,city,sector,schedule_month,
 '1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64','https://example.invalid/test',
 'Controle DEZEMBRO 26 - 5X2',payload,payload,created_by
from schedule_generation_drafts;
create temp table initial_state as select updated_at from schedule_operational_sheets;
create function pg_temp.publish_as(actor uuid) returns uuid language sql as $$
 select schedule_operational_publish(id,actor,updated_at,current_payload,'[]')
 from schedule_operational_sheets where id='20000000-0000-0000-0000-000000000001'
$$;
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000002')$$,'administrador ativo');
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000003')$$,'administrador ativo');
update schedule_generation_drafts set warnings='[{"level":"blocking","message":"test"}]';
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000001')$$,'pendências');
select pg_temp.assert((select count(*)=0 from schedule_uploads), 'blocked publication writes nothing');
update schedule_generation_drafts set warnings='[]',archived_at=now();
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000001')$$,'não pode ser publicada');
update schedule_generation_drafts set archived_at=null;
select pg_temp.expect_error($$
 select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
  updated_at,'{"people":[]}', '[]') from schedule_operational_sheets
$$,'sem pessoas ou datas');
select pg_temp.expect_error($$
 select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
  updated_at,current_payload #- '{dates,0}', '[]') from schedule_operational_sheets
$$,'incompleta');

insert into schedule_uploads(city,sector,schedule_month,source_file,source_sheet,payload)
select city,sector,schedule_month,'MANUAL','HISTORICAL',current_payload from schedule_operational_sheets;
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000001')$$,'outra origem');
select pg_temp.assert((select source_file='MANUAL' from schedule_uploads), 'manual official preserved');
delete from schedule_uploads;
update schedule_operational_sheets set spreadsheet_id='WRONG';
select pg_temp.expect_error(
 $$select pg_temp.publish_as('00000000-0000-0000-0000-000000000001')$$,'arquivo Controle RN');
update schedule_operational_sheets set spreadsheet_id='1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64';
select pg_temp.expect_error($$
 select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
  updated_at-interval '1 second',current_payload,'[]') from schedule_operational_sheets
$$,'Conflito');
select pg_temp.assert((select count(*)=0 from schedule_generation_events),'failed approval has no event');
-- Force audit insertion to fail AFTER the current payload update.
select pg_temp.expect_error($$
 select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
  updated_at,jsonb_set(current_payload,'{people,0,assignments,2026-12-01}','"FALTA"'),
  '[{"employee_key":"TEST","employee_name":"TEST","duty_date":"INVALID"}]')
 from schedule_operational_sheets
$$,'INVALID');
select pg_temp.assert((select count(*)=0 from schedule_uploads),'audit failure rolls back official write');
select pg_temp.assert((select current_payload=planned_payload from schedule_operational_sheets),
 'audit failure rolls back operational payload');
select pg_temp.assert((select status='draft' from schedule_generation_drafts),
 'audit failure rolls back approval');

-- Use service_role, matching the Edge Function's actual database role.
set local role service_role;
select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
 updated_at,jsonb_set(current_payload,'{people,0,assignments,2026-12-01}','"AT"'),
 '[{"employee_key":"NOME:TEST EMPLOYEE","employee_name":"TEST EMPLOYEE",
 "duty_date":"2026-12-01","planned_code":"T. 1","previous_code":"T. 1","current_code":"AT"}]')
from schedule_operational_sheets;
reset role;
select pg_temp.assert((select status='approved' and reviewed_by=created_by and reviewed_at is not null
 from schedule_generation_drafts),'explicit admin approval recorded');
select pg_temp.assert((select payload=current_payload from schedule_uploads
 cross join schedule_operational_sheets),'panel and operational payload identical');
select pg_temp.assert((select count(*)=1 from schedule_generation_events where action='approved'),
 'one approval event');
select pg_temp.assert((select changes->'published_payload'=payload from schedule_generation_events
 cross join schedule_uploads),'immutable publication snapshot recorded');
select pg_temp.assert((select payload->'people'->0->'assignments'->>'2026-12-01'='T. 1'
 from schedule_generation_drafts),'original draft payload preserved');
select pg_temp.assert((select count(*)=1 from schedule_operational_changes),'publication cell change audited');
select pg_temp.publish_as('00000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*)=1 from schedule_generation_events),'publication retry is idempotent');
select pg_temp.expect_error($$
 select schedule_operational_apply_sync(id,(select updated_at from initial_state),
 '00000000-0000-0000-0000-000000000001',current_payload,'[]') from schedule_operational_sheets
$$,'Conflito');

-- Five operational statuses must all reach the official schedule.
do $$
declare status text; day text; payload jsonb; changes jsonb; item record; i integer:=0;
begin
 for status in select unnest(array['FALTA','AT','Férias','PLANTÃO','Folga']) loop
  i:=i+1; day:='2026-12-0'||i;
  select * into item from schedule_operational_sheets;
  payload:=jsonb_set(item.current_payload,array['people','0','assignments',day],to_jsonb(status));
  changes:=jsonb_build_array(jsonb_build_object(
   'employee_key','NOME:TEST EMPLOYEE','employee_name','TEST EMPLOYEE',
   'duty_date',day,'planned_code','T. 1',
   'previous_code',item.current_payload->'people'->0->'assignments'->>day,'current_code',status));
  perform schedule_operational_apply_sync(item.id,item.updated_at,
    '00000000-0000-0000-0000-000000000001',payload,changes);
  perform pg_temp.assert((select u.payload->'people'->0->'assignments'->>day=status
    from schedule_uploads u),'official receives '||status);
 end loop;
end $$;
select pg_temp.assert((select count(*)=6 from schedule_operational_changes),'all changes retained');
select pg_temp.assert((select changes->'published_payload'->'people'->0->'assignments'->>'2026-12-02'='T. 1'
 from schedule_generation_events),'later sync preserves publication snapshot');
select schedule_operational_apply_sync(id,updated_at,
 '00000000-0000-0000-0000-000000000001',current_payload,'[]') from schedule_operational_sheets;
select pg_temp.assert((select count(*)=6 from schedule_operational_changes),'no-op sync does not duplicate history');
update schedule_uploads set source_sheet='BROKEN LINK';
select pg_temp.expect_error($$
 select schedule_operational_apply_sync(id,updated_at,
 '00000000-0000-0000-0000-000000000001',current_payload,'[]') from schedule_operational_sheets
$$,'oficial vinculada');
select pg_temp.assert((select count(*)=6 from schedule_operational_changes),'failed sync rolls back audit');
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select '10000000-0000-0000-0000-000000000002',city,sector,schedule_month,3,payload,created_by
 from schedule_generation_drafts;
insert into schedule_operational_sheets(
 id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,
 sheet_tab,planned_payload,current_payload,created_by)
select '20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
 city,sector,schedule_month,spreadsheet_id,spreadsheet_url,'OTHER REVISION',
 planned_payload,current_payload,created_by from schedule_operational_sheets;
select pg_temp.expect_error($$
 select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',
 updated_at,current_payload,'[]') from schedule_operational_sheets
 where id='20000000-0000-0000-0000-000000000002'
$$,'outra revisão');
select pg_temp.assert((select count(*)=1 from schedule_generation_events),
 'another version cannot replace publication or history');
rollback;
