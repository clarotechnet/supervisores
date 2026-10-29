-- Fixture data only, executed after migrations in an isolated localhost DB.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare message text;
begin
 begin execute statement;
 exception when others then get stacked diagnostics message=MESSAGE_TEXT; end;
 if message is null or message !~* expected then raise exception 'FAIL: expected %, got %',expected,message; end if;
 raise notice 'PASS: rejected %',expected;
end $$;
insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','controller','active'),
 ('00000000-0000-0000-0000-000000000004','controller','active'),
 ('00000000-0000-0000-0000-000000000005','admin','inactive');
insert into schedule_uploads(id,city,sector,schedule_month,source_file,source_sheet,payload,imported_by)
select id::uuid,city,sector,month::date,'TEST','TEST',
 '{"dates":["2026-12-01"],"people":[{"name":"TEST","jobTitle":"TEST","assignments":{"2026-12-01":"T. 1"}}],"codes":["T. 1"]}',
 '00000000-0000-0000-0000-000000000001' from(values
 ('10000000-0000-0000-0000-000000000001','natal','controle-operacional','2026-12-01'),
 ('10000000-0000-0000-0000-000000000002','natal','controle-operacional','2026-11-01'),
 ('10000000-0000-0000-0000-000000000003','fortaleza','controle-operacional','2026-12-01'),
 ('10000000-0000-0000-0000-000000000004','natal','adesao-servico','2026-12-01')
) v(id,city,sector,month);
insert into schedule_generation_drafts(id,city,sector,schedule_month,payload,created_by)
select ('20000000-0000-0000-0000-00000000000'||row_number()over(order by id))::uuid,
 city,sector,schedule_month,payload,imported_by from schedule_uploads where id in(
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');
insert into schedule_generation_policies(city,sector,rules)
values('natal','controle-operacional','{}'),('natal','adesao-servico','{}');
insert into schedule_operational_sheets(
 draft_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,spreadsheet_url,
 planned_payload,current_payload,created_by)
select id,city,sector,schedule_month,id::text,'TEST','https://example.invalid/test',payload,payload,created_by
 from schedule_generation_drafts;
insert into schedule_generation_events(draft_id,actor_id,action)
select id,created_by,'generated' from schedule_generation_drafts;
insert into schedule_operational_changes(sheet_id,actor_id,employee_key,employee_name,duty_date)
select id,created_by,'TEST','TEST','2026-12-01' from schedule_operational_sheets;
insert into schedule_date_notes(schedule_upload_id,note_date,body,author_id)
select id,'2026-12-01','TEST NOTE',imported_by from schedule_uploads where schedule_month='2026-12-01';
insert into schedule_suggestions(author_id,schedule_upload_id,city,sector,schedule_month,category,title,message)
select '00000000-0000-0000-0000-000000000003',id,city,sector,schedule_month,'other','TEST','TEST MESSAGE'
 from schedule_uploads where city='natal' and schedule_month='2026-12-01';
select pg_temp.assert((select count(*)=0 from schedule_control_access),'migration grants nobody automatically');
select pg_temp.assert(not has_function_privilege('authenticated','schedule_control_request(uuid,text,text)','EXECUTE'),
 'browser cannot forge requests through service RPC');
select pg_temp.assert(not has_function_privilege('authenticated','schedule_control_review(uuid,uuid,text,timestamptz,text)','EXECUTE'),
 'browser cannot approve directly');
select pg_temp.assert(not has_table_privilege('authenticated','schedule_control_access','UPDATE'),
 'browser has no grant-table write privilege');
select pg_temp.assert(not has_table_privilege('authenticated','schedule_control_access_events','INSERT'),
 'browser cannot forge history');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from schedule_uploads where sector='controle-operacional'),
 'controller cannot read any Control official before approval');
select pg_temp.assert((select count(*)=1 from schedule_uploads where sector='adesao-servico'),'other front remains readable');
select pg_temp.assert((select count(*)=0 from schedule_generation_drafts where sector='controle-operacional'),'drafts hidden');
select pg_temp.assert((select count(*)=1 from schedule_generation_drafts where sector='adesao-servico'),'other drafts unchanged');
select pg_temp.assert((select count(*)=0 from schedule_operational_sheets where sector='controle-operacional'),'Sheets URLs hidden');
select pg_temp.assert((select count(*)=1 from schedule_operational_sheets where sector='adesao-servico'),'other operational records unchanged');
select pg_temp.assert((select count(*)=1 from schedule_generation_events),'Control version events hidden');
select pg_temp.assert((select count(*)=1 from schedule_operational_changes),'Control cell history hidden');
select pg_temp.assert((select count(*)=1 from schedule_date_notes),'Control notes hidden');
select pg_temp.assert((select count(*)=1 from schedule_suggestions),'Control suggestions hidden');
select pg_temp.assert((select count(*)=1 from schedule_generation_policies),'Control policies hidden');
select pg_temp.expect_error($$
 insert into schedule_suggestions(author_id,schedule_upload_id,city,sector,category,title,message)
 values('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
 'natal','adesao-servico','other','TEST','TEST MESSAGE')
$$,'security|seguran|política|permiss');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=0 from schedule_uploads where sector='controle-operacional'),'supervisor also requires approval');
select pg_temp.assert(public.schedule_can_manage_scope(auth.uid(),'natal','adesao-servico'),'supervisor keeps management in other fronts');
select pg_temp.assert(not public.schedule_can_manage_scope(auth.uid(),'natal','controle-operacional'),'supervisor cannot manage Control');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=3 from schedule_uploads where sector='controle-operacional'),'administrator has direct access');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select pg_temp.assert((select count(*)=0 from schedule_uploads),'inactive admin has no access');
reset role;

set local role service_role;
select public.schedule_control_request('00000000-0000-0000-0000-000000000003','natal','Consultation test');
select public.schedule_control_request('00000000-0000-0000-0000-000000000003','natal','Duplicate');
select pg_temp.assert((select count(*)=1 from schedule_control_access_events),'pending retries are idempotent');
select pg_temp.assert((select status='pending' from schedule_control_access),'request never self-approves');
select pg_temp.expect_error($$select public.schedule_control_request('00000000-0000-0000-0000-000000000005','natal','')$$,
 'não pode solicitar');
select pg_temp.expect_error($$
 select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000002','approved',updated_at,'')
 from schedule_control_access
$$,'administrador ativo');
select pg_temp.expect_error($$
 select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000005','approved',updated_at,'')
 from schedule_control_access
$$,'administrador ativo');
select pg_temp.expect_error($$
 select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','approved',updated_at-interval '1 second','')
 from schedule_control_access
$$,'Conflito');
reset role;
create function pg_temp.audit_failure() returns trigger language plpgsql as $$
begin
 if current_setting('test.audit_failure',true)='yes' and new.action='approved' then
  raise exception 'TEST_AUDIT_FAILURE';
 end if;
 return new;
end $$;
create trigger audit_failure before insert on schedule_control_access_events
 for each row execute function pg_temp.audit_failure();
select set_config('test.audit_failure','yes',true);
set local role service_role;
select pg_temp.expect_error($$
 select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','approved',updated_at,'')
 from schedule_control_access
$$,'TEST_AUDIT_FAILURE');
select pg_temp.assert((select status='pending' from schedule_control_access),'audit failure rolls back approval');
select pg_temp.assert((select count(*)=1 from schedule_control_access_events),'audit failure preserves exact history');
select set_config('test.audit_failure','no',true);
select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','approved',updated_at,'Consulta autorizada')
 from schedule_control_access;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=2 from schedule_uploads where sector='controle-operacional' and city='natal'),
 'approval covers all months of the same city/front');
select pg_temp.assert((select count(*)=0 from schedule_uploads where city='fortaleza'),'approval does not expand to another city');
select pg_temp.assert((select count(*)=1 from schedule_uploads where sector='adesao-servico'),'approval does not change other fronts');
select pg_temp.assert((select count(*)=0 from schedule_generation_drafts where sector='controle-operacional'),'consultation excludes private drafts');
select pg_temp.assert((select count(*)=0 from schedule_operational_sheets where sector='controle-operacional'),'consultation excludes Sheets URLs');
select pg_temp.assert((select count(*)=1 from schedule_control_access),'owner sees own permission');
select pg_temp.assert((select count(*)=2 from schedule_control_access_events),'owner can inspect decision history');
select pg_temp.expect_error($$update schedule_control_access set status='approved'$$,'permission|permiss');
select pg_temp.expect_error($$
 insert into schedule_uploads(city,sector,schedule_month,source_file,source_sheet,payload)
 values('natal','controle-operacional','2027-01-01','TEST','TEST','{"dates":[],"people":[]}')
$$,'security|seguran|política|permiss');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select pg_temp.assert((select count(*)=0 from schedule_control_access),'another user cannot see or inherit this grant');
select pg_temp.assert((select count(*)=0 from schedule_uploads where sector='controle-operacional'),'another user stays blocked');
reset role;

set local role service_role;
select pg_temp.expect_error($$
 select public.schedule_operational_apply_sync(id,updated_at,'00000000-0000-0000-0000-000000000002',current_payload,'[]')
 from schedule_operational_sheets where sector='controle-operacional'
$$,'administrador');
select public.schedule_operational_apply_sync(id,updated_at,'00000000-0000-0000-0000-000000000002',current_payload,'[]')
 from schedule_operational_sheets where sector='adesao-servico';
select pg_temp.assert((select synced_by='00000000-0000-0000-0000-000000000002'
 from schedule_operational_sheets where sector='adesao-servico'),'supervisor synchronization in other fronts is unchanged');
select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','revoked',updated_at,'Revogação de teste')
 from schedule_control_access;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from schedule_uploads where sector='controle-operacional'),
 'revocation blocks the SAME JWT immediately on the database');
select pg_temp.assert((select count(*)=1 from schedule_uploads where sector='adesao-servico'),'revocation keeps other fronts normal');
reset role;
set local role service_role;
select public.schedule_control_request('00000000-0000-0000-0000-000000000003','natal','Novo pedido');
select pg_temp.assert((select count(*)=4 from schedule_control_access_events),'re-request retains approval and revocation history');
select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','denied',updated_at,'Sem necessidade')
 from schedule_control_access;
select pg_temp.assert((select status='denied' and review_note='Sem necessidade' from schedule_control_access),'denial and reason recorded');
select public.schedule_control_request('00000000-0000-0000-0000-000000000003','natal','Outra solicitação');
select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','approved',updated_at,'')
 from schedule_control_access;
reset role;
update profiles set status='inactive' where id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from schedule_uploads),'deactivated user loses access despite approved grant');
reset role;
select pg_temp.assert((select count(*)=7 from schedule_control_access_events),'full lifecycle retains all seven audit events');
select pg_temp.assert((select role='controller' from profiles where id='00000000-0000-0000-0000-000000000003'),'approval never changes account role');
set local role service_role;
select public.schedule_control_request('00000000-0000-0000-0000-000000000002','natal','Supervisor consulta');
select public.schedule_control_review(id,'00000000-0000-0000-0000-000000000001','approved',updated_at,'')
 from schedule_control_access where user_id='00000000-0000-0000-0000-000000000002';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=2 from schedule_uploads where sector='controle-operacional' and city='natal'),
 'approved supervisor can consult official Control schedules');
with changed as (
 update schedule_uploads set imported_by='00000000-0000-0000-0000-000000000002',source_file='UNAUTHORIZED'
 where sector='controle-operacional' returning id
) select pg_temp.assert((select count(*)=0 from changed),'approved supervisor still cannot edit Control');
with removed as (
 delete from schedule_uploads where sector='controle-operacional' returning id
) select pg_temp.assert((select count(*)=0 from removed),'approved supervisor cannot delete Control');
select pg_temp.expect_error($$
 insert into schedule_uploads(city,sector,schedule_month,source_file,source_sheet,payload,imported_by)
 values('natal','controle-operacional','2027-01-01','TEST','TEST','{"dates":[],"people":[]}',
 '00000000-0000-0000-0000-000000000002')
$$,'security|seguran|política|permiss');
with changed as (
 update schedule_uploads set imported_by='00000000-0000-0000-0000-000000000002',source_file='AUTHORIZED OTHER'
 where sector='adesao-servico' returning id
) select pg_temp.assert((select count(*)=1 from changed),'same supervisor can still edit other fronts');
reset role;
-- Existing administrator publication and Google synchronization must still work.
with calendar as (
 select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
  jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') assignments
 from generate_series('2027-01-01'::date,'2027-01-31'::date,interval '1 day') day
)
insert into schedule_generation_drafts(id,city,sector,schedule_month,payload,created_by)
select '30000000-0000-0000-0000-000000000001','natal','controle-operacional','2027-01-01',
 jsonb_build_object('dates',dates,'codes',jsonb_build_array('T. 1'),'people',jsonb_build_array(
 jsonb_build_object('name','TEST','jobTitle','TEST','assignments',assignments))),
 '00000000-0000-0000-0000-000000000001' from calendar;
insert into schedule_operational_sheets(
 draft_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,spreadsheet_url,
 planned_payload,current_payload,created_by)
select id,city,sector,schedule_month,'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64',
 'Controle JANEIRO 27 - 5X2','https://example.invalid/test',payload,payload,created_by
 from schedule_generation_drafts where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',updated_at,current_payload,'[]')
 from schedule_operational_sheets where schedule_month='2027-01-01';
reset role;
select pg_temp.assert((select status='approved' from schedule_generation_drafts
 where id='30000000-0000-0000-0000-000000000001'),'administrator publication still works');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=1 from schedule_uploads where schedule_month='2027-01-01'),
 'existing approved consultation includes a new official month');
reset role;
set local role service_role;
select public.schedule_operational_apply_sync(id,updated_at,'00000000-0000-0000-0000-000000000001',
 jsonb_set(current_payload,'{people,0,assignments,2027-01-02}','"AT"'),
 '[{"employee_key":"NOME:TEST","employee_name":"TEST","duty_date":"2027-01-02",
 "planned_code":"T. 1","previous_code":"T. 1","current_code":"AT"}]')
 from schedule_operational_sheets where schedule_month='2027-01-01';
reset role;
select pg_temp.assert((select payload->'people'->0->'assignments'->>'2027-01-02'='AT'
 from schedule_uploads where schedule_month='2027-01-01'),'administrator sync still updates the official schedule');
select pg_temp.assert((select changes->'published_payload'->'people'->0->'assignments'->>'2027-01-02'='T. 1'
 from schedule_generation_events where draft_id='30000000-0000-0000-0000-000000000001' and action='approved'),
 'operational sync still preserves original publication history');
delete from profiles where id='00000000-0000-0000-0000-000000000003';
select pg_temp.assert((select count(*)=1 from schedule_control_access where user_id is null),
 'account deletion remains possible without deleting permission history');
select pg_temp.assert((select count(*)=9 from schedule_control_access_events),
 'account deletion preserves every audit event');
rollback;
