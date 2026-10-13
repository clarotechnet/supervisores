-- Somente no banco isolado com os perfis sintéticos ...001 admin, ...002 supervisor, ...003 controlador.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.quality_imports(id,kind,source_file,imported_by,row_count,chunk_count)
values('30000000-0000-0000-0000-000000000001','certification','adesao.csv',auth.uid(),1,1),
      ('30000000-0000-0000-0000-000000000002','technical_visit','visita.csv',auth.uid(),1,1),
      ('30000000-0000-0000-0000-000000000003','certification','pending.csv',auth.uid(),1,1);
insert into public.quality_certification_data(import_id,chunk_index,records)
values('30000000-0000-0000-0000-000000000001',0,'[{"login":"Z1","points":"127"}]');
insert into public.quality_technical_visit_data(import_id,chunk_index,records)
values('30000000-0000-0000-0000-000000000002',0,'[{"login":"Z1","points":"150"}]');
select public.publish_quality_import('30000000-0000-0000-0000-000000000001');
select public.publish_quality_import('30000000-0000-0000-0000-000000000002');
do $$ begin
  if (select records->0->>'points' from public.quality_certification_data
      where import_id='30000000-0000-0000-0000-000000000001') <> '127' then
    raise exception 'A base anterior foi alterada';
  end if;
  if (select records->0->>'points' from public.quality_technical_visit_data
      where import_id='30000000-0000-0000-0000-000000000002') <> '150' then
    raise exception 'Visita técnica foi misturada à outra base';
  end if;
  begin
    insert into public.quality_technical_visit_data(import_id,chunk_index,records)
      values('30000000-0000-0000-0000-000000000003',0,'[{"login":"Z1"}]');
    raise exception 'Base de outra categoria entrou na tabela de visitas';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  begin
    insert into public.quality_technical_visit_data(import_id,chunk_index,records)
      values('30000000-0000-0000-0000-000000000002',1,'[{"login":"Z1"}]');
    raise exception 'Alteração após publicação foi permitida';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.quality_imports(id,kind,source_file,imported_by,row_count,chunk_count,base_import_id)
values('30000000-0000-0000-0000-000000000004','technical_visit','incomplete.csv',auth.uid(),2,2,'30000000-0000-0000-0000-000000000002');
insert into public.quality_technical_visit_data(import_id,chunk_index,records)
values('30000000-0000-0000-0000-000000000004',0,'[{"login":"Z1"}]');
do $$ begin
  begin
    perform public.publish_quality_import('30000000-0000-0000-0000-000000000004');
    raise exception 'Publicação incompleta permitida';
  exception when check_violation then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.quality_technical_visit_data) <> 1 then
    raise exception 'Supervisor não consulta somente dados publicados';
  end if;
  begin
    insert into public.quality_imports(kind,source_file,imported_by,row_count,chunk_count)
      values('technical_visit','proibido.csv',auth.uid(),1,1);
    raise exception 'Supervisor importou visita técnica';
  exception when insufficient_privilege then null; end;
  begin
    update public.quality_technical_visit_data set records='[{"points":0}]';
    raise exception 'Supervisor alterou a base';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from public.quality_technical_visit_data) then
    raise exception 'Controlador acessou visita técnica';
  end if;
  if has_table_privilege('anon','public.quality_technical_visit_data','select')
    or has_table_privilege('authenticated','public.quality_technical_visit_data','delete') then
    raise exception 'Privilégios excessivos na tabela nova';
  end if;
end $$;
rollback;
