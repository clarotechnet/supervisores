-- Fixtures isoladas. Nenhuma conexão com o projeto Supabase ou Google Sheets.
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
 'public.schedule_operational_roster_sync_ready()','EXECUTE'),'roster migration gate is service only');
insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active');
with calendar as (
 select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
 jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') assignments
 from generate_series('2026-12-01'::date,'2026-12-31'::date,interval '1 day') day)
insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select '10000000-0000-0000-0000-000000000001','natal','controle-operacional','2026-12-01',1,
 jsonb_build_object('dates',dates,'codes','["T. 1"]'::jsonb,'people',jsonb_build_array(
 jsonb_build_object('name','EXISTING EMPLOYEE','jobTitle','CONTROLADOR','assignments',assignments))),
 '00000000-0000-0000-0000-000000000001' from calendar;
insert into schedule_operational_sheets(
 id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,sheet_tab,planned_payload,current_payload,created_by)
select '20000000-0000-0000-0000-000000000001',id,city,sector,schedule_month,
 '1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64','https://example.invalid/fixture',
 'Controle DEZEMBRO 26 - 5X2',payload,payload,created_by from schedule_generation_drafts;
select schedule_operational_publish(id,'00000000-0000-0000-0000-000000000001',updated_at,current_payload,'[]')
from schedule_operational_sheets;
create temp table roster_initial as select * from schedule_operational_sheets;
create function pg_temp.roster_sync(payload jsonb,changes jsonb default '[]',
 actor uuid default '00000000-0000-0000-0000-000000000001') returns void language sql as $$
 select schedule_operational_apply_sync(id,updated_at,actor,payload,changes) from schedule_operational_sheets
$$;
create temp table roster_next as
select jsonb_set(current_payload,'{people}',(current_payload->'people') ||
 jsonb_build_array(jsonb_build_object('name','NEW EMPLOYEE','login','','jobTitle','CONTROLADORA',
 'assignments',jsonb_build_object('2026-12-02','Folga')))) payload from schedule_operational_sheets;
grant select on roster_next to service_role;
select pg_temp.expect_error($$select pg_temp.roster_sync(payload,'[]',
 '00000000-0000-0000-0000-000000000002') from roster_next$$,'administrador');
set local role service_role;
select pg_temp.roster_sync(payload,'[{"employee_key":"NOME:NEW EMPLOYEE","employee_name":"NEW EMPLOYEE",
 "duty_date":"2026-12-02","planned_code":"","previous_code":"","current_code":"Folga"}]') from roster_next;
reset role;
select pg_temp.assert((select employee_count=2 and entry_count=62 and u.payload=n.payload
 from schedule_uploads u cross join roster_next n),'official employee and entry counts grow atomically');
select pg_temp.assert((select s.planned_payload=i.planned_payload and d.payload=i.planned_payload
 from schedule_operational_sheets s cross join roster_initial i cross join schedule_generation_drafts d),
 'roster sync preserves original planning and saved revision');
select pg_temp.assert((select count(*)=1 and min(changes->>'employee_count')='1'
 from schedule_generation_events where changes->>'kind'='employees_added_from_sheets'),'one roster inclusion audit');
select pg_temp.assert((select changes->'employees'->0->>'name'='NEW EMPLOYEE'
 from schedule_generation_events where changes->>'kind'='employees_added_from_sheets'),'inclusion audit identifies correct employee');
select pg_temp.assert((select count(*)=1 and min(previous_code)='' and min(planned_code)=''
 from schedule_operational_changes),'new marks audited from blank baseline');
select pg_temp.roster_sync(payload) from roster_next;
select pg_temp.assert((select count(*)=1 from schedule_generation_events
 where changes->>'kind'='employees_added_from_sheets'),'repeat import does not duplicate roster history');
select pg_temp.assert((select count(*)=1 from schedule_operational_changes),'repeat import does not duplicate mark history');
select pg_temp.expect_error($$select schedule_operational_apply_sync(s.id,i.updated_at,
 '00000000-0000-0000-0000-000000000001',s.current_payload,'[]')
 from schedule_operational_sheets s cross join roster_initial i$$,'Conflito');
select pg_temp.expect_error($$select pg_temp.roster_sync(planned_payload) from roster_initial$$,'remover ou renomear');
select pg_temp.expect_error($$select pg_temp.roster_sync(jsonb_set(payload,'{people,1,name}','"RENAMED EMPLOYEE"'))
 from roster_next$$,'remover ou renomear');
select pg_temp.expect_error($$select pg_temp.roster_sync(jsonb_set(payload,'{people,1,jobTitle}','""'))
 from roster_next$$,'função inválida');
select pg_temp.expect_error($$select pg_temp.roster_sync(jsonb_set(payload,'{people}',(payload->'people') ||
 jsonb_build_array(jsonb_set(payload->'people'->1,'{name}','"new employee"')))) from roster_next$$,'duplicada');
select pg_temp.expect_error($$select pg_temp.roster_sync(jsonb_set(payload,'{dates,0}','"2026-11-30"'))
 from roster_next$$,'Estrutura');
select pg_temp.expect_error($$select pg_temp.roster_sync(jsonb_set(payload,'{people}',(payload->'people') ||
 '[{"name":"THIRD EMPLOYEE","jobTitle":"CONTROLADOR","assignments":{}}]'),
 '[{"employee_key":"NOME:THIRD EMPLOYEE","employee_name":"THIRD EMPLOYEE","duty_date":"INVALID"}]')
 from roster_next$$,'INVALID');
select pg_temp.assert((select employee_count=2 and u.payload=n.payload from schedule_uploads u cross join roster_next n),
 'failed audit rolls back official inclusion');
select pg_temp.assert((select count(*)=1 from schedule_generation_events
 where changes->>'kind'='employees_added_from_sheets'),'failed audit rolls back inclusion event');
select pg_temp.assert((select s.current_payload=n.payload from schedule_operational_sheets s cross join roster_next n),
 'failed audit rolls back current roster');
-- Other fronts retain the exact original roster contract.
update schedule_generation_drafts set sector='vt';
update schedule_operational_sheets set sector='vt';
select pg_temp.expect_error($$select pg_temp.roster_sync(payload) from roster_next$$,'Estrutura');
rollback;
