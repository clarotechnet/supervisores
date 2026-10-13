-- Projeto supervisortechnet / rwstmomeldwrjmczrmnp.
-- Requer add_quality_dashboard. Não copia nem altera registros das bases anteriores.
begin;

alter table public.quality_imports drop constraint quality_imports_kind_check;
alter table public.quality_imports add constraint quality_imports_kind_check
  check (kind in ('quebra','certification','technical_visit'));

create table public.quality_technical_visit_data (
  import_id uuid not null,
  kind text not null default 'technical_visit' check (kind = 'technical_visit'),
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null check (jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) between 1 and 500),
  primary key(import_id,chunk_index),
  foreign key(import_id,kind) references public.quality_imports(id,kind) on delete cascade
);
alter table public.quality_technical_visit_data enable row level security;
revoke all on public.quality_technical_visit_data from public, anon, authenticated;
grant select, insert on public.quality_technical_visit_data to authenticated;
grant all on public.quality_technical_visit_data to service_role;
create policy quality_technical_visit_read on public.quality_technical_visit_data
for select to authenticated using ((select private.can_access_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and (i.published_at is not null or i.imported_by = (select auth.uid()))));
create policy quality_technical_visit_create on public.quality_technical_visit_data
for insert to authenticated with check ((select private.can_manage_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and i.imported_by = (select auth.uid()) and i.published_at is null
    and i.kind = 'technical_visit' and chunk_index < i.chunk_count));
create trigger quality_technical_visit_lock before insert on public.quality_technical_visit_data
for each row execute function private.lock_quality_chunk();

-- Mantém publicação atômica, validação dos blocos e isolamento de versões por base.
create or replace function private.validate_quality_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare blocks integer; rows bigint; last_index integer; latest uuid;
begin
  if old.published_at is not null or new.published_at is null then
    raise exception 'Publicacao invalida.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('quality:' || new.kind));
  select id into latest from public.quality_imports
    where kind = new.kind and published_at is not null order by published_at desc limit 1;
  if new.base_import_id is distinct from latest then
    raise exception 'Outra pessoa atualizou esta base. Clique em Atualizar e importe novamente o arquivo.' using errcode = '40001';
  end if;
  if new.kind = 'quebra' then
    select count(*), coalesce(sum(jsonb_array_length(records)),0), max(chunk_index)
      into blocks, rows, last_index from public.quality_quebra_data where import_id = new.id;
  elsif new.kind = 'technical_visit' then
    select count(*), coalesce(sum(jsonb_array_length(records)),0), max(chunk_index)
      into blocks, rows, last_index from public.quality_technical_visit_data where import_id = new.id;
  else
    select count(*), coalesce(sum(jsonb_array_length(records)),0), max(chunk_index)
      into blocks, rows, last_index from public.quality_certification_data where import_id = new.id;
  end if;
  if blocks <> new.chunk_count or rows <> new.row_count or last_index <> blocks - 1 then
    raise exception 'Importacao incompleta: % de % blocos; % de % registros.', blocks, new.chunk_count, rows, new.row_count
      using errcode = '23514';
  end if;
  new.published_at = now();
  return new;
end;
$$;
revoke all on function private.validate_quality_publication() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
