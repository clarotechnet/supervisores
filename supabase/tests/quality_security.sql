-- Run only against the isolated test database with the three synthetic profiles
-- created by the validation harness: ...001 admin, ...002 supervisor, ...003 controller.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

insert into public.quality_imports(id,kind,source_file,imported_by,row_count,chunk_count)
values ('10000000-0000-0000-0000-000000000001','quebra','fixture.xlsx',auth.uid(),3,2),
  ('10000000-0000-0000-0000-000000000002','certification','pending.csv',auth.uid(),1,1);
insert into public.quality_quebra_data(import_id,chunk_index,records)
values ('10000000-0000-0000-0000-000000000001',0,'[{"d":"2026-10-01","b":1}]');

do $$
begin
  begin
    perform public.publish_quality_import('10000000-0000-0000-0000-000000000001');
    raise exception 'Incomplete publication was permitted';
  exception when check_violation then null; end;
  begin
    insert into public.quality_certification_data(import_id,chunk_index,records)
      values ('10000000-0000-0000-0000-000000000001',0,'[{"login":"T1"}]');
    raise exception 'Wrong dataset type was permitted';
  exception when foreign_key_violation then null; end;
end;
$$;
insert into public.quality_quebra_data(import_id,chunk_index,records)
values ('10000000-0000-0000-0000-000000000001',1,'[{"d":"2026-10-02","b":0},{"d":"2026-10-03","b":0}]');
select public.publish_quality_import('10000000-0000-0000-0000-000000000001');
insert into public.quality_imports(id,kind,source_file,imported_by,row_count,chunk_count)
values ('10000000-0000-0000-0000-000000000004','quebra','stale.xlsx',auth.uid(),1,1);
insert into public.quality_quebra_data(import_id,chunk_index,records)
values ('10000000-0000-0000-0000-000000000004',0,'[{"d":"2026-10-04","b":0}]');
do $$
begin
  begin
    perform public.publish_quality_import('10000000-0000-0000-0000-000000000004');
    raise exception 'Stale import replaced a newer publication';
  exception when serialization_failure then null; end;
end;
$$;
insert into public.quality_supervisor_registry(singleton,registry,updated_by)
values(true,'{"T1":{"name":"Teste","supervisor":"Gestor"}}',auth.uid());

do $$
begin
  begin
    insert into public.quality_quebra_data(import_id,chunk_index,records)
      values ('10000000-0000-0000-0000-000000000001',2,'[{"d":"2026-10-04"}]');
    raise exception 'Published data was modified';
  exception when insufficient_privilege then null; end;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
begin
  if (select count(*) from public.quality_imports) <> 1 then
    raise exception 'Supervisor could see an incomplete import';
  end if;
  if (select count(*) from public.quality_quebra_data) <> 2 then
    raise exception 'Supervisor could not read published data';
  end if;
  if (select count(*) from public.quality_supervisor_registry) <> 1 then
    raise exception 'Supervisor could not read registry';
  end if;
  begin
    insert into public.quality_imports(kind,source_file,imported_by,row_count,chunk_count)
      values('quebra','forbidden.xlsx',auth.uid(),1,1);
    raise exception 'Supervisor was permitted to import';
  exception when insufficient_privilege then null; end;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$
begin
  if (select count(*) from public.quality_imports) <> 0
    or (select count(*) from public.quality_quebra_data) <> 0
    or (select count(*) from public.quality_supervisor_registry) <> 0 then
    raise exception 'Controller could read quality data';
  end if;
  if has_function_privilege('anon','public.publish_quality_import(uuid)','execute') then
    raise exception 'Anonymous RPC execution was granted';
  end if;
end;
$$;
rollback;
