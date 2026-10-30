-- Publicação manual de uma revisão nova na MESMA aba mensal já existente.
-- Não executa publicação, não escreve no Google e não modifica versões históricas.
begin;
create or replace function public.schedule_operational_publish_revision(
 p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid,
 p_expected_updated_at timestamptz, p_planned_payload jsonb,
 p_payload jsonb, p_changes jsonb
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
 v_sheet public.schedule_operational_sheets%rowtype;
 v_previous public.schedule_generation_drafts%rowtype;
 v_selected public.schedule_generation_drafts%rowtype;
 v_official_id uuid;
begin
 if not exists(select 1 from public.profiles
   where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode aprovar/publicar';
 end if;
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id;
 if not found then raise exception 'Planilha operacional não encontrada'; end if;
 perform pg_advisory_xact_lock(hashtextextended(
  jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id for update;
 if v_sheet.updated_at is distinct from p_expected_updated_at then
  raise exception using errcode='40001',message='Conflito: a aba mudou; recarregue antes de publicar';
 end if;
 if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
  raise exception 'A aba foi excluída ou está em exclusão';
 end if;
 select * into v_selected from public.schedule_generation_drafts where id=p_draft_id for update;
 if not found or v_selected.archived_at is not null
    or v_selected.status not in ('draft','approved') then
  raise exception 'A versão selecionada não pode ser publicada';
 end if;
 if v_selected.city<>v_sheet.city or v_selected.sector<>v_sheet.sector
    or v_selected.schedule_month<>v_sheet.schedule_month then
  raise exception 'A versão e a aba devem pertencer à mesma cidade, frente e competência';
 end if;
 if v_sheet.draft_id=p_draft_id then
  return public.schedule_operational_publish(
   p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes);
 end if;
 select * into v_previous from public.schedule_generation_drafts
  where id=v_sheet.draft_id for update;
 if not found or v_previous.status='approved' or v_selected.status<>'draft' then
  raise exception 'Uma aba de versão aprovada não pode ser transferida para outro rascunho';
 end if;
 if v_previous.city<>v_sheet.city or v_previous.sector<>v_sheet.sector
    or v_previous.schedule_month<>v_sheet.schedule_month then
  raise exception 'Vínculo anterior com escopo divergente';
 end if;
 if exists(select 1 from public.schedule_operational_sheets where draft_id=p_draft_id) then
  raise exception 'A versão selecionada já possui outra aba vinculada';
 end if;
 if exists(select 1 from jsonb_array_elements(v_selected.warnings) n
   where n->>'level'='blocking') then
  raise exception 'A versão possui pendências que impedem publicação';
 end if;
 if jsonb_typeof(p_planned_payload->'dates') is distinct from 'array'
    or jsonb_typeof(p_planned_payload->'people') is distinct from 'array'
    or not ((p_planned_payload->'dates') @> (v_selected.payload->'dates'))
    or jsonb_array_length(p_planned_payload->'people') <>
       jsonb_array_length(v_selected.payload->'people')
    or exists(
     select 1 from jsonb_array_elements(v_selected.payload->'people') person
     where not exists(
      select 1 from jsonb_array_elements(p_planned_payload->'people') planned
      where planned->>'name'=person->>'name'
       and planned->>'jobTitle'=person->>'jobTitle'
       and (planned->'assignments') @> (person->'assignments')
     )
    ) then
  raise exception 'O planejamento não corresponde à versão selecionada';
 end if;
 -- O registro operacional e sua auditoria de células mantêm o mesmo ID.
 -- A fotografia completa do vínculo anterior permanece no histórico da versão anterior.
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_previous.id,p_actor_id,'edited',jsonb_build_object(
  'kind','operational_revision_replaced','next_draft_id',v_selected.id,
  'next_revision',v_selected.revision,'previous_sheet',to_jsonb(v_sheet)));
 update public.schedule_operational_sheets
  set draft_id=v_selected.id,planned_payload=p_planned_payload where id=v_sheet.id;
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_selected.id,p_actor_id,'edited',jsonb_build_object(
  'kind','existing_month_tab_selected','previous_draft_id',v_previous.id,
  'previous_revision',v_previous.revision,'sheet_id',v_sheet.id,'tab',v_sheet.sheet_tab));
 -- A RPC existente valida origem oficial, avisos, concorrência e publica.
 -- Qualquer erro desfaz TAMBÉM a troca de vínculo e ambos os eventos.
 v_official_id := public.schedule_operational_publish(
  p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes);
 return v_official_id;
end $$;
revoke all on function public.schedule_operational_publish_revision(
 uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.schedule_operational_publish_revision(
 uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
