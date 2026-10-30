-- Isolated fixtures only. Run with scripts/test-schedule-publication.mjs.
begin;
create or replace function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if;
raise notice 'PASS: %',label; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare message text;
begin begin execute statement; exception when others then get stacked diagnostics message=MESSAGE_TEXT; end;
if message is null or message !~* expected then raise exception 'FAIL: expected %, got %',expected,message; end if;
raise notice 'PASS: rejected %',expected; end $$;
select pg_temp.assert(not has_function_privilege('authenticated',
'public.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb)','EXECUTE'),'browser cannot rebind or publish');
select pg_temp.assert(not (select prosecdef from pg_proc where oid=
'public.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb)'::regprocedure),'revision publication is security invoker');
insert into profiles(id,role,status) values
('00000000-0000-0000-0000-000000000001','admin','active'),
('00000000-0000-0000-0000-000000000002','supervisor','active');
with calendar as(
select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') assignments
from generate_series('2027-01-01'::date,'2027-01-31'::date,interval '1 day') day)
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by,archived_at,warnings)
select '10000000-0000-0000-0000-000000000003','natal','controle-operacional','2027-01-01',3,
jsonb_build_object('dates',dates,'codes',jsonb_build_array('T. 1'),'people',jsonb_build_array(
jsonb_build_object('name','TEST EMPLOYEE','jobTitle','CONTROLADOR','assignments',assignments))),
'00000000-0000-0000-0000-000000000001',now(),'[{"level":"blocking","message":"old warning"}]' from calendar;
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select '10000000-0000-0000-0000-000000000004',city,sector,schedule_month,4,
jsonb_set(payload,'{people,0,assignments,2027-01-03}','"PLANTÃO"'),created_by from schedule_generation_drafts;
insert into schedule_operational_sheets(
id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,sheet_tab,planned_payload,current_payload,created_by)
select '20000000-0000-0000-0000-000000000003',id,city,sector,schedule_month,
'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64','https://example.invalid/test',
'Controle JANEIRO 27 - 5X2',payload,payload,created_by from schedule_generation_drafts where revision=3;
create temp table previous_sheet as select * from schedule_operational_sheets;
create function pg_temp.publish_revision(actor uuid) returns uuid language sql as $$
select public.schedule_operational_publish_revision(s.id,d.id,actor,s.updated_at,d.payload,d.payload,'[]')
from schedule_operational_sheets s cross join schedule_generation_drafts d where d.revision=4 $$;
select pg_temp.expect_error($$select pg_temp.publish_revision('00000000-0000-0000-0000-000000000002')$$,'administrador ativo');
update schedule_generation_drafts set archived_at=now() where revision=4;
select pg_temp.expect_error($$select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001')$$,'não pode ser publicada');
update schedule_generation_drafts set archived_at=null,warnings='[{"level":"blocking"}]' where revision=4;
select pg_temp.expect_error($$select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001')$$,'pendências');
update schedule_generation_drafts set warnings='[]',city='recife' where revision=4;
select pg_temp.expect_error($$select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001')$$,'mesma cidade');
update schedule_generation_drafts set city='natal' where revision=4;
select pg_temp.expect_error($$
select schedule_operational_publish_revision(s.id,d.id,'00000000-0000-0000-0000-000000000001',
s.updated_at-interval '1 second',d.payload,d.payload,'[]')
from schedule_operational_sheets s cross join schedule_generation_drafts d where d.revision=4$$,'Conflito');
select pg_temp.expect_error($$
select schedule_operational_publish_revision(s.id,d.id,'00000000-0000-0000-0000-000000000001',
s.updated_at,s.planned_payload,d.payload,'[]')
from schedule_operational_sheets s cross join schedule_generation_drafts d where d.revision=4$$,'planejamento');
-- Failure AFTER rebinding must roll back linkage and both events.
update schedule_operational_sheets set spreadsheet_id='WRONG';
select pg_temp.expect_error($$select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001')$$,'arquivo Controle RN');
select pg_temp.assert((select s.draft_id=p.draft_id and s.planned_payload=p.planned_payload
from schedule_operational_sheets s cross join previous_sheet p),'publication failure rolls back rebind');
select pg_temp.assert((select count(*)=0 from schedule_generation_events),'failed rebind leaves no events');
update schedule_operational_sheets set spreadsheet_id='1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64';
select pg_temp.expect_error($$
select schedule_operational_publish_revision(s.id,d.id,'00000000-0000-0000-0000-000000000001',
s.updated_at,d.payload,d.payload,'[{"duty_date":"INVALID"}]')
from schedule_operational_sheets s cross join schedule_generation_drafts d where d.revision=4$$,'INVALID');
select pg_temp.assert((select count(*)=0 from schedule_uploads),'audit failure leaves no official');
select pg_temp.assert((select s.draft_id=p.draft_id and s.current_payload=p.current_payload
from schedule_operational_sheets s cross join previous_sheet p),'audit failure restores old operational snapshot');
set local role service_role;
select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert((select count(*)=1 from schedule_operational_sheets),'same operational tab reused without duplicate');
select pg_temp.assert((select draft_id='10000000-0000-0000-0000-000000000004' from schedule_operational_sheets),'selected revision now linked');
select pg_temp.assert((select archived_at is not null and status='draft' and payload=p.planned_payload
from schedule_generation_drafts d cross join previous_sheet p where revision=3),'previous draft content and archive preserved');
select pg_temp.assert((select status='approved' and policy_snapshot->>'published'='true'
from schedule_generation_drafts where revision=4),'selected version explicitly approved');
select pg_temp.assert((select changes->'previous_sheet'->'planned_payload'=p.planned_payload
from schedule_generation_events e cross join previous_sheet p where changes->>'kind'='operational_revision_replaced'),'previous binding snapshot audited');
select pg_temp.assert((select u.payload=s.current_payload and u.payload=d.payload
from schedule_uploads u cross join schedule_operational_sheets s cross join schedule_generation_drafts d where revision=4),'official reads selected live payload');
select pg_temp.assert((select count(*)=3 from schedule_generation_events),'replacement, selection and approval recorded');
select pg_temp.publish_revision('00000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*)=3 from schedule_generation_events),'retry does not duplicate binding history');
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select '10000000-0000-0000-0000-000000000006',city,sector,schedule_month,6,payload,created_by
from schedule_generation_drafts where revision=4;
select pg_temp.expect_error($$
select schedule_operational_publish_revision(s.id,d.id,'00000000-0000-0000-0000-000000000001',
s.updated_at,d.payload,d.payload,'[]')
from schedule_operational_sheets s cross join schedule_generation_drafts d where d.revision=6$$,'versão aprovada');
select schedule_operational_apply_sync(s.id,s.updated_at,'00000000-0000-0000-0000-000000000001',
jsonb_set(s.current_payload,'{people,0,assignments,2027-01-04}','"AT"'),
'[{"employee_key":"NOME:TEST EMPLOYEE","employee_name":"TEST EMPLOYEE","duty_date":"2027-01-04","planned_code":"T. 1","previous_code":"T. 1","current_code":"AT"}]')
from schedule_operational_sheets s;
select pg_temp.assert((select payload->'people'->0->'assignments'->>'2027-01-04'='AT' from schedule_uploads),'API sync still updates re-bound official');
-- Deletion after reuse and archive: stale gid is repaired ONLY after the new
-- gid is explicitly confirmed, with a snapshot, and in the same transaction.
select pg_temp.assert(not has_function_privilege('authenticated',
 'schedule_month_relink_begin_delete(uuid,uuid,uuid,integer,text,jsonb,timestamptz,integer)','EXECUTE'),
 'browser cannot repair destructive linkage');
update schedule_operational_sheets set spreadsheet_url=
 'https://docs.google.com/spreadsheets/d/'||spreadsheet_id||'/edit#gid=99';
create function pg_temp.confirm_delete(actor uuid,confirmation text,expected timestamptz default null) returns jsonb language sql as $$
 select schedule_month_relink_begin_delete(s.id,actor,u.id,100,confirmation,
  jsonb_build_object('metadata',jsonb_build_object('title',s.sheet_tab,'gridId',100),'values',jsonb_build_array(jsonb_build_array('saved Google copy'))),
  coalesce(expected,s.updated_at),99) from schedule_operational_sheets s cross join schedule_uploads u
$$;
select pg_temp.expect_error($$select pg_temp.confirm_delete('00000000-0000-0000-0000-000000000002','EXCLUIR 2027-01 ABA 100')$$,'administrador ativo');
select pg_temp.expect_error($$select pg_temp.confirm_delete('00000000-0000-0000-0000-000000000001','EXCLUIR 2027-01')$$,'Confirme');
select pg_temp.expect_error($$select pg_temp.confirm_delete('00000000-0000-0000-0000-000000000001','EXCLUIR 2027-01 ABA 100','2000-01-01')$$,'vínculo mudou');
select pg_temp.assert((select spreadsheet_url like '%gid=99' from schedule_operational_sheets),'rejected confirmations preserve old link');
-- Prove a failure in the existing ownership check rolls back the gid repair.
update schedule_uploads set source_sheet='WRONG';
select pg_temp.expect_error($$select pg_temp.confirm_delete('00000000-0000-0000-0000-000000000001','EXCLUIR 2027-01 ABA 100')$$,'não corresponde');
select pg_temp.assert((select spreadsheet_url like '%gid=99' from schedule_operational_sheets),'ownership conflict rolls back link repair');
update schedule_uploads set source_sheet='Controle JANEIRO 27 - 5X2';
set local role service_role;
select pg_temp.confirm_delete('00000000-0000-0000-0000-000000000001','EXCLUIR 2027-01 ABA 100');
reset role;
select pg_temp.assert((select grid_id=100 and snapshot->'draft'->>'revision'='4'
 and google_snapshot->'previous_binding'->>'spreadsheet_url' like '%gid=99' from schedule_month_deletions),
 'prepared deletion points to approved revision 4, not archived revision 3, with old linkage retained');
select pg_temp.assert((select count(*)=1 from schedule_generation_events where changes->>'kind'='deletion_tab_link_confirmed'),'link repair audited once');
set local role service_role;
select schedule_month_finish_delete(id,'00000000-0000-0000-0000-000000000001') from schedule_month_deletions;
reset role;
select pg_temp.assert((select count(*)=0 from schedule_uploads),'reused month deleted from official panel');
select pg_temp.assert((select archived_at is not null and status='draft' from schedule_generation_drafts where revision=3),'archived revision preserved after deletion');
select pg_temp.assert((select count(*)=1 from schedule_month_deletions where status='applied'),'deletion history finalized');
select pg_temp.assert((select deleted_at is not null from schedule_operational_sheets),'link soft deleted, not history removed');
rollback;
