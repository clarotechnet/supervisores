-- Fixtures isoladas: os meses são relativos a São Paulo para o teste não envelhecer.
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
 'public.schedule_operational_apply_roster_sync(uuid,timestamptz,uuid,jsonb,jsonb,text[])','EXECUTE'),
 'future roster RPC is service only');
insert into profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active');
create temp table roster_periods as
select label,
 (date_trunc('month',timezone('America/Sao_Paulo',clock_timestamp())) + delta)::date as competence,
 gen_random_uuid() as draft_id, gen_random_uuid() as sheet_id
from (values ('past', '-1 month'::interval),('current', '0 month'),('future', '1 month')) p(label,delta);

insert into schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by)
select p.draft_id,'natal','controle-operacional',p.competence,1,
 jsonb_build_object('dates',calendar.dates,'codes','["T. 1","Folga"]'::jsonb,'people',jsonb_build_array(
 jsonb_build_object('name','PESSOA DESLIGADA','login','LOGIN-ANTIGO','jobTitle','CONTROLADOR','assignments',calendar.turnos),
 jsonb_build_object('name','PESSOA QUE FICA','jobTitle','ANALISTA','assignments',calendar.folgas))),
 '00000000-0000-0000-0000-000000000001'
from roster_periods p cross join lateral (
 select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
  jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') turnos,
  jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'Folga') folgas
 from generate_series(p.competence::timestamp,p.competence + interval '1 month - 1 day',interval '1 day') day
) calendar;
insert into schedule_operational_sheets(
 id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,sheet_tab,planned_payload,current_payload,created_by)
select p.sheet_id,d.id,d.city,d.sector,d.schedule_month,
 '1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64','https://example.invalid/fixture',
 'Controle ' || p.label,d.payload,d.payload,d.created_by
from roster_periods p join schedule_generation_drafts d on d.id=p.draft_id;
select schedule_operational_publish(s.id,'00000000-0000-0000-0000-000000000001',s.updated_at,s.current_payload,'[]')
from schedule_operational_sheets s join roster_periods p on p.sheet_id=s.id;

create temp table roster_history as
select p.label,p.sheet_id,p.draft_id,to_jsonb(s) as sheet,to_jsonb(u) as official,d.payload as plan
from roster_periods p join schedule_operational_sheets s on s.id=p.sheet_id
join schedule_generation_drafts d on d.id=p.draft_id
join schedule_uploads u on u.schedule_month=p.competence;
create temp table roster_replacements as
select p.label,
 jsonb_set(s.current_payload,'{people}',jsonb_build_array(s.current_payload->'people'->1,
  jsonb_build_object('name','NOVATO 1','login','','jobTitle','CONTROLADOR','assignments',jsonb_build_object(p.competence::text,'Folga')))) payload
from roster_periods p join schedule_operational_sheets s on s.id=p.sheet_id;
grant select on roster_periods, roster_replacements to service_role;

create function pg_temp.apply_swap(period text, removed text[],
 actor uuid default '00000000-0000-0000-0000-000000000001', changes jsonb default '[]')
returns void language sql as $$
 select schedule_operational_apply_roster_sync(s.id,s.updated_at,actor,r.payload,changes,removed)
 from roster_periods p join schedule_operational_sheets s on s.id=p.sheet_id
 join roster_replacements r on r.label=p.label where p.label=period
$$;
select pg_temp.expect_error($$select pg_temp.apply_swap('past',array['PESSOA DESLIGADA'])$$,'competência futura');
select pg_temp.expect_error($$select pg_temp.apply_swap('current',array['PESSOA DESLIGADA'])$$,'competência futura');
select pg_temp.expect_error($$select pg_temp.apply_swap('future',array['PESSOA QUE FICA'])$$,'saídas não correspondem');
select pg_temp.expect_error($$select pg_temp.apply_swap('future',array['PESSOA DESLIGADA'],
 '00000000-0000-0000-0000-000000000002')$$,'administrador');
select pg_temp.expect_error($$select pg_temp.apply_swap('future',array['PESSOA DESLIGADA'],
 '00000000-0000-0000-0000-000000000001','[{"duty_date":"INVALida"}]')$$,'INVALida');
select pg_temp.assert((select to_jsonb(s)=h.sheet from roster_history h
 join schedule_operational_sheets s on s.id=h.sheet_id where h.label='future'),
 'failed audit does not apply a partial departure');

set local role service_role;
select pg_temp.apply_swap('future',array['PESSOA DESLIGADA']);
reset role;
select pg_temp.assert((select u.payload=r.payload and u.employee_count=2
 and u.entry_count=2*jsonb_array_length(u.payload->'dates')
 from roster_periods p join schedule_uploads u on u.schedule_month=p.competence
 join roster_replacements r on r.label=p.label where p.label='future'),
 'only the official roster for the selected future month was replaced');
select pg_temp.assert((select s.planned_payload=h.sheet->'planned_payload' and d.payload=h.plan
 and s.removed_roster_names=array['PESSOA DESLIGADA']
 from roster_history h join schedule_operational_sheets s on s.id=h.sheet_id
 join schedule_generation_drafts d on d.id=h.draft_id where h.label='future'),
 'future source history stays intact and does not require the departed person again');
select pg_temp.assert((select bool_and(to_jsonb(s)=h.sheet and to_jsonb(u)=h.official)
 from roster_history h join roster_periods p on p.sheet_id=h.sheet_id
 join schedule_operational_sheets s on s.id=h.sheet_id join schedule_uploads u on u.schedule_month=p.competence
 where h.label in ('past','current')),'past and current official schedules are byte-for-byte unchanged');
select pg_temp.assert((select count(*)=1 and min(changes->'employees'->0->>'login')='LOGIN-ANTIGO'
 from schedule_generation_events where changes->>'kind'='employees_removed_from_future_sheet'),
 'removal has its own audit with the previous employee identity');
select pg_temp.assert((select count(*)=1 and min(changes->'employees'->0->>'login')=''
 from schedule_generation_events where changes->>'kind'='employees_added_from_sheets'),
 'new employee is audited with no inherited identity');

-- Other actions keep using the old signature, including sync after the departure.
select schedule_operational_apply_sync(s.id,s.updated_at,'00000000-0000-0000-0000-000000000001',s.current_payload,'[]')
from roster_periods p join schedule_operational_sheets s on s.id=p.sheet_id where p.label='future';
select pg_temp.assert((select count(*)=1 from schedule_generation_events
 where changes->>'kind'='employees_removed_from_future_sheet'),'repeating sync does not duplicate departure audit');
rollback;
