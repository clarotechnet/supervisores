-- Projeto supervisortechnet / rwstmomeldwrjmczrmnp. Base SLA independente.
-- Nao altera tabelas, calculos ou registros de QQ, TC, VT ou Quark.
begin;
do $$ begin
  if to_regprocedure('private.can_access_quality()') is null
     or to_regprocedure('private.can_manage_quality()') is null then
    raise exception 'Instale primeiro add_quality_dashboard no projeto supervisortechnet.';
  end if;
end $$;

create table public.sla_warranty_imports (
  id uuid primary key default gen_random_uuid(),
  source_file text not null check (length(source_file) between 1 and 500),
  imported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  row_count integer not null check (row_count between 1 and 1000000),
  chunk_count integer not null check (chunk_count between 1 and 4003),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  base_import_id uuid references public.sla_warranty_imports(id)
);
create index sla_warranty_published_idx on public.sla_warranty_imports(published_at desc)
  where published_at is not null;
create index sla_warranty_author_idx on public.sla_warranty_imports(imported_by);
create index sla_warranty_base_idx on public.sla_warranty_imports(base_import_id)
  where base_import_id is not null;
create table public.sla_warranty_data (
  import_id uuid not null references public.sla_warranty_imports(id) on delete cascade,
  source text not null check (source in ('current','history','previousCsv')),
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null check (jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) between 1 and 250),
  primary key(import_id,source,chunk_index)
);
alter table public.sla_warranty_imports enable row level security;
alter table public.sla_warranty_data enable row level security;
revoke all on public.sla_warranty_imports, public.sla_warranty_data from public, anon, authenticated;
grant select, insert, delete on public.sla_warranty_imports to authenticated;
grant update(published_at) on public.sla_warranty_imports to authenticated;
grant select, insert on public.sla_warranty_data to authenticated;
grant all on public.sla_warranty_imports, public.sla_warranty_data to service_role;
create policy sla_warranty_imports_read on public.sla_warranty_imports for select to authenticated
using ((select private.can_access_quality()) and (published_at is not null or imported_by = (select auth.uid())));
create policy sla_warranty_imports_create on public.sla_warranty_imports for insert to authenticated
with check ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null);
create policy sla_warranty_imports_publish on public.sla_warranty_imports for update to authenticated
using ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null)
with check ((select private.can_manage_quality()) and imported_by = (select auth.uid()));
create policy sla_warranty_imports_discard on public.sla_warranty_imports for delete to authenticated
using ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null);
create policy sla_warranty_data_read on public.sla_warranty_data for select to authenticated
using ((select private.can_access_quality()) and exists (
  select 1 from public.sla_warranty_imports i where i.id = import_id
  and (i.published_at is not null or i.imported_by = (select auth.uid()))));
create policy sla_warranty_data_create on public.sla_warranty_data for insert to authenticated
with check ((select private.can_manage_quality()) and exists (
  select 1 from public.sla_warranty_imports i where i.id = import_id
  and i.imported_by = (select auth.uid()) and i.published_at is null and chunk_index < i.chunk_count));

create function private.lock_sla_warranty_chunk()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare publication timestamptz;
begin
  select published_at into publication from public.sla_warranty_imports where id = new.import_id for update;
  if not found or publication is not null then
    raise exception 'Importacao SLA inexistente ou ja publicada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_sla_warranty_chunk() from public, anon, authenticated;
create trigger sla_warranty_chunk_lock before insert on public.sla_warranty_data
for each row execute function private.lock_sla_warranty_chunk();

create function private.validate_sla_warranty_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare latest uuid; source_name text; expected integer; blocks integer; rows bigint;
  first_index integer; last_index integer; total_blocks integer := 0; total_rows bigint := 0;
begin
  if old.published_at is not null or new.published_at is null then
    raise exception 'Publicacao SLA invalida.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sla_warranty'));
  select id into latest from public.sla_warranty_imports where published_at is not null
    order by published_at desc limit 1;
  if new.base_import_id is distinct from latest then
    raise exception 'Outra pessoa atualizou o SLA. Atualize a base e importe novamente.' using errcode = '40001';
  end if;
  if coalesce((new.metadata->'counts'->>'current')::integer,0) < 1 then
    raise exception 'A base atual de SLA esta vazia.' using errcode = '23514';
  end if;
  foreach source_name in array array['current','history','previousCsv'] loop
    expected := coalesce((new.metadata->'counts'->>source_name)::integer,0);
    select count(*),coalesce(sum(jsonb_array_length(records)),0),min(chunk_index),max(chunk_index)
      into blocks,rows,first_index,last_index from public.sla_warranty_data
      where import_id = new.id and source = source_name;
    if rows <> expected or (blocks > 0 and (first_index <> 0 or last_index <> blocks - 1)) then
      raise exception 'Base SLA incompleta: fonte %, % de % registros.', source_name,rows,expected using errcode = '23514';
    end if;
    total_blocks := total_blocks + blocks; total_rows := total_rows + rows;
  end loop;
  if total_blocks <> new.chunk_count or total_rows <> new.row_count then
    raise exception 'Blocos ou registros de SLA divergem do manifesto.' using errcode = '23514';
  end if;
  new.published_at := now(); return new;
end;
$$;
revoke all on function private.validate_sla_warranty_publication() from public, anon, authenticated;
create trigger sla_warranty_validate_publish before update on public.sla_warranty_imports
for each row execute function private.validate_sla_warranty_publication();
create function public.publish_sla_warranty_import(p_import_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.can_manage_quality()) then
    raise exception 'Somente gestores podem publicar SLA.' using errcode = '42501';
  end if;
  update public.sla_warranty_imports set published_at = now()
    where id = p_import_id and imported_by = (select auth.uid()) and published_at is null;
  if not found then raise exception 'Importacao SLA nao encontrada ou sem permissao.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.publish_sla_warranty_import(uuid) from public, anon, authenticated;
grant execute on function public.publish_sla_warranty_import(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
