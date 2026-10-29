
-- Synthetic fixtures only; never connects to production.
begin;
create function pg_temp.check_edit(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','controller','active');
with fixture as (
 select jsonb_build_object('dates',jsonb_agg(to_char(day,'YYYY-MM-DD') order by day),'codes',jsonb_build_array('M. 1'),'people',jsonb_build_array(jsonb_build_object('name','FIXTURE','login','ZTEST','jobTitle','TEST','assignments',jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'M. 1')))) payload
 from generate_series('2026-12-01'::timestamp,'2026-12-31'::timestamp,'1 day') day
)
insert into schedule_generation_drafts(id,city,sector,schedule_month,payload,created_by)
select '20000000-0000-0000-0000-000000000001','natal','vt','2026-12-01',payload,'00000000-0000-0000-0000-000000000001' from fixture;
insert into schedule_operational_sheets(id,draft_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,spreadsheet_url,planned_payload,current_payload,created_by)
select '30000000-0000-0000-0000-000000000001',id,city,sector,schedule_month,'fixture-official','VT 2026-12 - 5X2','https://example.invalid/fixture',payload,payload,created_by from schedule_generation_drafts;
select pg_temp.check_edit((select count(*)=0 from schedule_uploads),'migration does not publish any scale');
select pg_temp.check_edit(not has_table_privilege('authenticated','schedule_sheet_edits','INSERT'),'browser cannot forge edit history');
set local role service_role;
select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',updated_at,current_payload,'[]') from schedule_operational_sheets;
reset role;
select pg_temp.check_edit((select count(*)=1 from schedule_uploads where sector='vt'),'admin publishes VT in original monthly link');
select pg_temp.check_edit((select status='approved' from schedule_generation_drafts),'explicit approval preserved');
select pg_temp.check_edit((select count(*)=1 from schedule_generation_events where action='approved'),'publication audit preserved');
select pg_temp.check_edit((select planned_payload=current_payload from schedule_operational_sheets),'baseline preserved');
set local role service_role;
insert into schedule_sheet_edits(schedule_upload_id,actor_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,cell_a1,employee_name,duty_date,previous_code,current_code)
select id,'00000000-0000-0000-0000-000000000002',city,sector,schedule_month,'fixture-official',source_sheet,'D3','FIXTURE','2026-12-01','M. 1','AT' from schedule_uploads;
update schedule_sheet_edits set status='unconfirmed';
select pg_temp.check_edit((select status='unconfirmed' from schedule_sheet_edits),'uncertain Google writes remain auditable without claiming success');
update schedule_sheet_edits set status='applied',completed_at=now();
select schedule_operational_apply_sync(id,updated_at,'00000000-0000-0000-0000-000000000002',jsonb_set(current_payload,'{people,0,assignments,2026-12-01}','"AT"'),jsonb_build_array(jsonb_build_object('employee_key','NOME:FIXTURE','employee_name','FIXTURE','duty_date','2026-12-01','planned_code','M. 1','previous_code','M. 1','current_code','AT'))) from schedule_operational_sheets;
reset role;
select pg_temp.check_edit((select payload#>>'{people,0,assignments,2026-12-01}'='AT' from schedule_uploads),'API updates same VT official record');
select pg_temp.check_edit((select planned_payload#>>'{people,0,assignments,2026-12-01}'='M. 1' from schedule_operational_sheets),'original planning snapshot remains unchanged');
select pg_temp.check_edit((select count(*)=1 from schedule_uploads),'no parallel official schedule created');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.check_edit((select count(*)=0 from schedule_sheet_edits),'controller cannot read management edit log');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.check_edit((select count(*)=1 from schedule_sheet_edits),'active supervisor can inspect other-front edit history');
reset role;
-- Clear unrelated legacy RESTRICT references in this synthetic fixture only.
update schedule_operational_sheets set synced_by='00000000-0000-0000-0000-000000000001';
update schedule_uploads set imported_by='00000000-0000-0000-0000-000000000001';
update schedule_operational_changes set actor_id='00000000-0000-0000-0000-000000000001';
delete from profiles where id='00000000-0000-0000-0000-000000000002';
select pg_temp.check_edit((select actor_id is null and previous_code='M. 1' and current_code='AT' from schedule_sheet_edits),'account deletion retains cell edit audit');
rollback;
