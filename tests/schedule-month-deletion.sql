-- Contrato em PostgreSQL local isolado. Fixtures fictícias. Nunca usa o banco vinculado.
begin;
create function pg_temp.check_delete(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject_delete(command text,label text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute command; exception when others then rejected:=true; end;
 perform pg_temp.check_delete(rejected,label);
end $$;
insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','controller','active');
with fixture as (
 select jsonb_build_object('dates',jsonb_agg(to_char(day,'YYYY-MM-DD') order by day),
 'codes',jsonb_build_array('M. 1'),'people',jsonb_build_array(jsonb_build_object(
 'name','TEST EMPLOYEE','jobTitle','CONTROLADOR (DESC FTA)',
 'assignments',jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'M. 1')))) payload
 from generate_series('2027-01-01'::timestamp,'2027-01-31'::timestamp,'1 day') day
)
insert into schedule_generation_drafts(id,city,sector,schedule_month,payload,created_by)
select '20000000-0000-0000-0000-000000000001','natal','vt','2027-01-01',payload,'00000000-0000-0000-0000-000000000001' from fixture;
insert into schedule_operational_sheets(id,draft_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,spreadsheet_url,planned_payload,current_payload,created_by)
select '30000000-0000-0000-0000-000000000001',id,city,sector,schedule_month,
 'fixture-official','VT 2027-01 - 5X2','https://docs.google.com/spreadsheets/d/fixture-official/edit#gid=99',
 payload,payload,created_by from schedule_generation_drafts;
select pg_temp.check_delete(not has_function_privilege('authenticated','schedule_month_begin_delete(uuid,uuid,uuid,integer,text,jsonb)','EXECUTE'),'browser cannot prepare deletion RPC');
select pg_temp.check_delete(not has_function_privilege('anon','schedule_month_finish_delete(uuid,uuid)','EXECUTE'),'anonymous cannot finish deletion RPC');
select pg_temp.check_delete(not has_table_privilege('authenticated','schedule_month_deletions','INSERT'),'browser cannot forge deletion ledger');
set local role service_role;
select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',updated_at,current_payload,'[]') from schedule_operational_sheets;
select schedule_operational_apply_sync(id,updated_at,'00000000-0000-0000-0000-000000000001',
 jsonb_set(current_payload,'{people,0,jobTitle}','"CONTROLADOR (DESC FTZ)"'),'[]') from schedule_operational_sheets;
reset role;
select pg_temp.check_delete((select payload#>>'{people,0,jobTitle}'='CONTROLADOR (DESC FTZ)' from schedule_uploads),'function correction reaches same official row');
select pg_temp.check_delete((select planned_payload#>>'{people,0,jobTitle}'='CONTROLADOR (DESC FTA)' from schedule_operational_sheets),'original function remains in planned version');
select pg_temp.check_delete((select count(*)=1 from schedule_generation_events where changes->>'kind'='function_corrected_from_sheets'),'function correction has transactional audit');
select pg_temp.check_delete(schedule_operational_metadata_audit_ready(),'metadata audit capability available');
insert into schedule_date_notes(schedule_upload_id,note_date,body,author_id)
 select id,'2027-01-04','TEST NOTE','00000000-0000-0000-0000-000000000001' from schedule_uploads;
select pg_temp.reject_delete(format('select schedule_month_begin_delete(%L,%L,%L,99,%L,%L)',
 '30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 (select id from schedule_uploads),'EXCLUIR 2027-01','{}'),'supervisor cannot delete official month');
select pg_temp.reject_delete(format('select schedule_month_begin_delete(%L,%L,%L,99,%L,%L)',
 '30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
 (select id from schedule_uploads),'EXCLUIR 2026-12','{}'),'confirmation is bound to selected month');
select pg_temp.reject_delete(format('select schedule_month_begin_delete(%L,%L,%L,100,%L,%L)',
 '30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
 (select id from schedule_uploads),'EXCLUIR 2027-01','{}'),'wrong Google gid is rejected');
select pg_temp.reject_delete(format('select schedule_month_begin_delete(%L,%L,%L,99,%L,%L)',
 '30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
 '40000000-0000-0000-0000-000000000099','EXCLUIR 2027-01','{}'),'wrong official upload cannot delete this tab');
select pg_temp.reject_delete('delete from schedule_uploads','direct SQL deletion cannot detach an official tab');
set local role service_role;
select schedule_month_begin_delete('30000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000001',id,99,'EXCLUIR 2027-01',
 '{"values":[["TEST EMPLOYEE","UNSYNCED GOOGLE CHANGE"]]}') from schedule_uploads;
reset role;
select pg_temp.check_delete((select count(*)=1 from schedule_uploads),'preparation preserves official panel until Google deletion is confirmed');
select pg_temp.check_delete((select status='pending' from schedule_month_deletions),'deletion intent is durable');
select pg_temp.check_delete((select google_snapshot#>>'{values,0,1}'='UNSYNCED GOOGLE CHANGE' from schedule_month_deletions),'unsynced Google cells are preserved');
select pg_temp.reject_delete(format('select schedule_operational_apply_sync(%L,%L,%L,%L,%L)',
 '30000000-0000-0000-0000-000000000001',(select updated_at from schedule_operational_sheets),
 '00000000-0000-0000-0000-000000000001',
 (select jsonb_set(current_payload,'{people,0,assignments,2027-01-01}','"AT"') from schedule_operational_sheets),'[]'),'sync cannot race pending deletion');
select pg_temp.check_delete((select payload#>>'{people,0,assignments,2027-01-01}'='M. 1' from schedule_uploads),'failed concurrent sync rolls back official row too');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.check_delete((select count(*)=0 from schedule_month_deletions),'controller cannot read deletion snapshots');
reset role;
set local role service_role;
select schedule_month_finish_delete(id,'00000000-0000-0000-0000-000000000001') from schedule_month_deletions;
reset role;
select pg_temp.check_delete((select count(*)=0 from schedule_uploads),'confirmed deletion removes official month');
select pg_temp.check_delete((select deleted_at is not null from schedule_operational_sheets),'operational version is retained as deleted');
select pg_temp.check_delete((select status='rejected' and policy_snapshot->>'deleted'='true' from schedule_generation_drafts),'approved version is retired without losing history');
select pg_temp.check_delete((select snapshot#>>'{notes,0,body}'='TEST NOTE' from schedule_month_deletions),'notes preserved before cascade');
select pg_temp.check_delete((select count(*)=1 from schedule_generation_events where changes->>'kind'='schedule_deleted'),'explicit deletion event retained');
set local role service_role;
select schedule_month_finish_delete(id,'00000000-0000-0000-0000-000000000001') from schedule_month_deletions;
reset role;
select pg_temp.check_delete((select count(*)=1 from schedule_generation_events where changes->>'kind'='schedule_deleted'),'retry does not duplicate deletion event');
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
 select '20000000-0000-0000-0000-000000000002',city,sector,schedule_month,2,payload,created_by from schedule_generation_drafts where revision=1;
insert into schedule_operational_sheets(id,draft_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,spreadsheet_url,planned_payload,current_payload,created_by)
 select '30000000-0000-0000-0000-000000000002',id,city,sector,schedule_month,'fixture-official','VT 2027-01 - 5X2',
 'https://docs.google.com/spreadsheets/d/fixture-official/edit#gid=100',payload,payload,created_by from schedule_generation_drafts where revision=2;
select pg_temp.check_delete((select count(*)=1 from schedule_operational_sheets where deleted_at is null),'new revision can reuse monthly tab name after deletion');
select pg_temp.check_delete((select count(*)=2 from schedule_generation_drafts),'both revisions remain in history');
select pg_temp.check_delete((select count(*)=0 from schedule_uploads),'regeneration alone never republishes official scale');
rollback;
