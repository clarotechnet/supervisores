-- Exclusão explícita de uma competência 5x2 e da sua aba Google.
-- Preparar no banco, excluir SOMENTE a aba vinculada, confirmar no banco.
-- Auditoria/versões permanecem; nenhuma escala é excluída ao aplicar este SQL.
begin;
alter table public.schedule_operational_sheets
  add column deletion_requested_at timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete set null;
drop index if exists public.schedule_operational_spreadsheet_tab_uniq;
create unique index schedule_operational_spreadsheet_tab_uniq
 on public.schedule_operational_sheets(spreadsheet_id,sheet_tab) where deleted_at is null;

create table public.schedule_month_deletions (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null unique references public.schedule_operational_sheets(id) on delete restrict,
 schedule_upload_id uuid not null,
 actor_id uuid references public.profiles(id) on delete set null,
 city text not null, sector text not null, schedule_month date not null,
 spreadsheet_id text not null, sheet_tab text not null, grid_id integer not null check(grid_id>=0),
 status text not null default 'pending' check(status in ('pending','applied')),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 google_snapshot jsonb not null check(jsonb_typeof(google_snapshot)='object'),
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
alter table public.schedule_month_deletions enable row level security;
revoke all on public.schedule_month_deletions from public,anon,authenticated;
grant select on public.schedule_month_deletions to authenticated;
grant all on public.schedule_month_deletions to service_role;
create policy schedule_month_deletions_admin_read on public.schedule_month_deletions
 for select to authenticated using (public.is_admin((select auth.uid())));
create index schedule_month_deletions_scope on public.schedule_month_deletions(city,sector,schedule_month);

create function public.schedule_month_delete_guard() returns trigger
 language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='schedule_uploads' then
  if old.source_file='Google Sheets - Escala operacional oficial' and not exists (
   select 1 from public.schedule_month_deletions d
    where d.schedule_upload_id=old.id and d.status='applied'
  ) then raise exception 'Exclua a escala oficial pela ação que remove também sua aba no Sheets'; end if;
  return old;
 end if;
 if old.deleted_at is not null then
  raise exception 'A aba desta versão foi excluída; gere uma nova revisão';
 end if;
 if old.deletion_requested_at is not null and not (
  new.deleted_at is not null and exists (
   select 1 from public.schedule_month_deletions d where d.sheet_id=old.id and d.status='applied'
  )
 ) then raise exception 'Exclusão da escala em andamento; conclua a exclusão antes de sincronizar'; end if;
 return new;
end $$;
revoke all on function public.schedule_month_delete_guard() from public,anon,authenticated;
grant execute on function public.schedule_month_delete_guard() to service_role;
create trigger schedule_month_delete_guard before update on public.schedule_operational_sheets
 for each row execute function public.schedule_month_delete_guard();
create trigger schedule_upload_delete_guard before delete on public.schedule_uploads
 for each row execute function public.schedule_month_delete_guard();

create function public.schedule_month_begin_delete(
 p_sheet_id uuid,p_actor_id uuid,p_schedule_id uuid,p_grid_id integer,
 p_confirmation text,p_google_snapshot jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_sheet public.schedule_operational_sheets%rowtype;
 v_upload public.schedule_uploads%rowtype;
 v_draft public.schedule_generation_drafts%rowtype;
 v_op public.schedule_month_deletions%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode excluir uma escala oficial';
 end if;
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id;
 if not found then raise exception 'Vínculo da escala não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id for update;
 if p_confirmation is distinct from 'EXCLUIR '||to_char(v_sheet.schedule_month,'YYYY-MM') then
  raise exception 'Confirmação de exclusão inválida'; end if;
 if v_sheet.sheet_tab='ATUALIZADA' or v_sheet.sheet_tab !~ ' - 5X2$' then
  raise exception 'Somente abas mensais 5x2 gerenciadas podem ser excluídas'; end if;
 if p_grid_id is null or p_grid_id<0 or p_grid_id::text is distinct from
  substring(v_sheet.spreadsheet_url from '[#&]gid=([0-9]+)') then
  raise exception 'Identificador da aba não corresponde ao vínculo'; end if;
 select * into v_op from public.schedule_month_deletions where sheet_id=p_sheet_id for update;
 if found then
  if v_op.schedule_upload_id<>p_schedule_id or v_op.grid_id<>p_grid_id then
   raise exception 'Outra exclusão já está vinculada a esta versão'; end if;
  return to_jsonb(v_op);
 end if;
 if v_sheet.deleted_at is not null then raise exception 'Esta versão já foi excluída'; end if;
 select * into v_draft from public.schedule_generation_drafts where id=v_sheet.draft_id for update;
 select * into v_upload from public.schedule_uploads where id=p_schedule_id for update;
 if not found or v_upload.city<>v_sheet.city or v_upload.sector<>v_sheet.sector
  or v_upload.schedule_month<>v_sheet.schedule_month
  or v_upload.source_file<>'Google Sheets - Escala operacional oficial'
  or v_upload.source_sheet<>v_sheet.sheet_tab or v_draft.id is null or v_draft.status is distinct from 'approved'
  or v_draft.policy_snapshot->>'officialScheduleId' is distinct from p_schedule_id::text then
  raise exception 'A escala oficial não corresponde à versão e à aba selecionadas';
 end if;
 if jsonb_typeof(p_google_snapshot) is distinct from 'object' then raise exception 'Snapshot Google inválido'; end if;
 insert into public.schedule_month_deletions(
  sheet_id,schedule_upload_id,actor_id,city,sector,schedule_month,spreadsheet_id,sheet_tab,grid_id,snapshot,google_snapshot
 ) values (
  v_sheet.id,v_upload.id,p_actor_id,v_sheet.city,v_sheet.sector,v_sheet.schedule_month,
  v_sheet.spreadsheet_id,v_sheet.sheet_tab,p_grid_id,
  jsonb_build_object('sheet',to_jsonb(v_sheet),'official',to_jsonb(v_upload),'draft',to_jsonb(v_draft)),
  p_google_snapshot
 ) returning * into v_op;
 update public.schedule_operational_sheets set deletion_requested_at=clock_timestamp() where id=p_sheet_id;
 return to_jsonb(v_op);
end $$;
revoke all on function public.schedule_month_begin_delete(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.schedule_month_begin_delete(uuid,uuid,uuid,integer,text,jsonb) to service_role;

create function public.schedule_month_finish_delete(p_deletion_id uuid,p_actor_id uuid)
 returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_op public.schedule_month_deletions%rowtype;
 v_sheet public.schedule_operational_sheets%rowtype; v_notes jsonb; v_upload public.schedule_uploads%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode concluir a exclusão';
 end if;
 select * into v_op from public.schedule_month_deletions where id=p_deletion_id;
 if not found then raise exception 'Pedido de exclusão não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(v_op.city,v_op.sector,v_op.schedule_month)::text,0));
 select * into v_sheet from public.schedule_operational_sheets where id=v_op.sheet_id for update;
 select * into v_op from public.schedule_month_deletions where id=p_deletion_id for update;
 if v_op.status='applied' then return jsonb_build_object('deleted',true,'alreadyDeleted',true); end if;
 select * into v_upload from public.schedule_uploads where id=v_op.schedule_upload_id for update;
 if not found or v_upload.source_sheet<>v_op.sheet_tab or v_upload.city<>v_op.city
  or v_upload.sector<>v_op.sector or v_upload.schedule_month<>v_op.schedule_month then
  raise exception 'A escala oficial mudou durante a exclusão; confira o vínculo';
 end if;
 select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) into v_notes
  from (select * from public.schedule_date_notes where schedule_upload_id=v_upload.id for update) n;
 update public.schedule_month_deletions set status='applied',completed_at=clock_timestamp(),
  snapshot=snapshot||jsonb_build_object('notes',v_notes,'finalized_by',p_actor_id) where id=v_op.id;
 update public.schedule_operational_sheets set deleted_at=clock_timestamp(),deleted_by=p_actor_id where id=v_sheet.id;
 update public.schedule_generation_drafts set status='rejected',reviewed_by=p_actor_id,reviewed_at=clock_timestamp(),
  policy_snapshot=policy_snapshot||jsonb_build_object('deleted',true,'deletionId',v_op.id)
  where id=v_sheet.draft_id;
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes) values (
  v_sheet.draft_id,p_actor_id,'rejected',jsonb_build_object('kind','schedule_deleted','deletion_id',v_op.id,
   'sheet_id',v_sheet.id,'official_schedule_id',v_upload.id,'spreadsheet_id',v_op.spreadsheet_id,'tab',v_op.sheet_tab));
 delete from public.schedule_uploads where id=v_upload.id;
 return jsonb_build_object('deleted',true,'alreadyDeleted',false);
end $$;
revoke all on function public.schedule_month_finish_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.schedule_month_finish_delete(uuid,uuid) to service_role;
-- Correções equivalentes de função/base vindas do Sheets entram na mesma transação de sincronização.
create function public.schedule_operational_audit_function_changes() returns trigger
 language plpgsql security invoker set search_path=public as $$
declare v_changes jsonb;
begin
 select jsonb_agg(jsonb_build_object('employee_name',n->>'name',
  'previous_function',o->>'jobTitle','current_function',n->>'jobTitle')) into v_changes
 from jsonb_array_elements(old.current_payload->'people') o
 join jsonb_array_elements(new.current_payload->'people') n on o->>'name'=n->>'name'
 where o->>'jobTitle' is distinct from n->>'jobTitle';
 if v_changes is not null then
  insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
  values(new.draft_id,new.synced_by,'edited',jsonb_build_object('kind','function_corrected_from_sheets',
    'sheet_id',new.id,'functions',v_changes));
 end if;
 return null;
end $$;
revoke all on function public.schedule_operational_audit_function_changes() from public,anon,authenticated;
grant execute on function public.schedule_operational_audit_function_changes() to service_role;
create trigger schedule_operational_audit_function_changes after update of current_payload
 on public.schedule_operational_sheets for each row execute function public.schedule_operational_audit_function_changes();
create function public.schedule_operational_metadata_audit_ready() returns boolean
 language sql stable security invoker set search_path=public as $$
 select exists(select 1 from pg_trigger where tgrelid='public.schedule_operational_sheets'::regclass
  and tgname='schedule_operational_audit_function_changes' and tgenabled<>'D')
$$;
revoke all on function public.schedule_operational_metadata_audit_ready() from public,anon,authenticated;
grant execute on function public.schedule_operational_metadata_audit_ready() to service_role;
notify pgrst,'reload schema';
commit;
