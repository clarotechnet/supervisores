-- Narrow, explicit repair of a stale gid at deletion time. No data is changed
-- by installing this function. Both the old binding and the live Google copy
-- are retained before the existing staged deletion protocol starts.
begin;
create function public.schedule_month_relink_begin_delete(
 p_sheet_id uuid,p_actor_id uuid,p_schedule_id uuid,p_grid_id integer,
 p_confirmation text,p_google_snapshot jsonb,
 p_expected_updated_at timestamptz,p_previous_grid_id integer
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_sheet public.schedule_operational_sheets%rowtype;
 v_result jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode conferir a exclusão';
 end if;
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id;
 if not found then raise exception 'Vínculo da escala não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id for update;
 if v_sheet.updated_at is distinct from p_expected_updated_at then
  raise exception using errcode='40001',message='O vínculo mudou. Reabra a confirmação de exclusão';
 end if;
 if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null
  or exists(select 1 from public.schedule_month_deletions where sheet_id=p_sheet_id) then
  raise exception 'Há uma exclusão anterior. Conclua-a sem trocar a aba';
 end if;
 if p_previous_grid_id is null or p_previous_grid_id::text is distinct from
  substring(v_sheet.spreadsheet_url from '[#&]gid=([0-9]+)') then
  raise exception 'O identificador anterior mudou. Confira o vínculo novamente';
 end if;
 if p_grid_id is null or p_grid_id<0 or p_grid_id=p_previous_grid_id
  or p_confirmation is distinct from 'EXCLUIR '||to_char(v_sheet.schedule_month,'YYYY-MM')||' ABA '||p_grid_id::text then
  raise exception 'Confirme a competência e o identificador da aba atual';
 end if;
 if jsonb_typeof(p_google_snapshot->'values') is distinct from 'array'
  or p_google_snapshot->'metadata'->>'title' is distinct from v_sheet.sheet_tab
  or p_google_snapshot->'metadata'->>'gridId' is distinct from p_grid_id::text then
  raise exception 'A fotografia da aba atual não confirma o vínculo';
 end if;
 update public.schedule_operational_sheets set spreadsheet_url=
  'https://docs.google.com/spreadsheets/d/'||v_sheet.spreadsheet_id||'/edit#gid='||p_grid_id::text
  where id=p_sheet_id;
 -- This existing RPC checks the approved CURRENT revision and official upload,
 -- not the archived revision that first created this monthly tab. Any failure
 -- rolls back the URL repair too; no Google deletion can follow a failed RPC.
 v_result:=public.schedule_month_begin_delete(p_sheet_id,p_actor_id,p_schedule_id,p_grid_id,
  'EXCLUIR '||to_char(v_sheet.schedule_month,'YYYY-MM'),
  p_google_snapshot||jsonb_build_object('previous_binding',to_jsonb(v_sheet)));
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_sheet.draft_id,p_actor_id,'edited',jsonb_build_object(
  'kind','deletion_tab_link_confirmed','previous_sheet',to_jsonb(v_sheet),
  'confirmed_grid_id',p_grid_id,'deletion_id',v_result->>'id'));
 return v_result;
end $$;
revoke all on function public.schedule_month_relink_begin_delete(uuid,uuid,uuid,integer,text,jsonb,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.schedule_month_relink_begin_delete(uuid,uuid,uuid,integer,text,jsonb,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;
