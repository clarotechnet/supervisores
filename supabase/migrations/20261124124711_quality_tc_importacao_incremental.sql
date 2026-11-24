-- Somente Técnico Certificado em /qualidade (kind = 'certification').
-- A última publicação antiga vira a base imutável na primeira importação incremental.
-- Nenhum atendimento é copiado ou removido ao instalar esta migration.
begin;

create table private.quality_tc_current (
  singleton boolean primary key default true check (singleton),
  id uuid not null,
  baseline_id uuid references public.quality_imports(id),
  base_import_id uuid,
  row_count integer not null check (row_count between 1 and 1000000),
  patch_count integer not null check (patch_count between 0 and row_count),
  source_file text not null,
  imported_by uuid not null,
  metadata jsonb not null,
  created_at timestamptz not null,
  published_at timestamptz not null
);

create table private.quality_tc_patches (
  record_key text collate "C" primary key check (octet_length(record_key) <= 2000),
  ordinal bigint generated always as identity unique,
  record jsonb not null
);

create table private.quality_tc_uploads (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid not null,
  base_import_id uuid,
  source_file text not null check (length(source_file) between 1 and 500),
  row_count integer not null check (row_count between 1 and 1000000),
  change_count integer not null check (change_count between 0 and row_count),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index quality_tc_uploads_author_idx on private.quality_tc_uploads(imported_by, created_at);

create table private.quality_tc_upload_blocks (
  upload_id uuid not null references private.quality_tc_uploads(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null,
  primary key (upload_id, chunk_index)
);

alter table private.quality_tc_current enable row level security;
alter table private.quality_tc_patches enable row level security;
alter table private.quality_tc_uploads enable row level security;
alter table private.quality_tc_upload_blocks enable row level security;
revoke all on private.quality_tc_current, private.quality_tc_patches,
  private.quality_tc_uploads, private.quality_tc_upload_blocks from public, anon, authenticated;

-- Mesma identidade de tcRowKey: WO + login + fim normalizado (segundos opcionais).
create function private.quality_tc_record_key(p_record jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(p_record->>'wo', '') || '|' || (p_record->>'login') || '|' ||
    case when d is null then btrim(f) else
      d[3] || '-' || lpad(d[2], 2, '0') || '-' || lpad(d[1], 2, '0') || 'T' ||
      coalesce(lpad(t[1], 2, '0') || ':' || t[2] || ':' || coalesce(t[3], '00'), '00:00:00') end
  from (select coalesce(p_record->>'finish', '') as f) s,
  lateral (select regexp_match(btrim(f), '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})') as d,
    regexp_match(f, '\s([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?') as t) m;
$$;

create function private.quality_tc_manifest_json(p_state private.quality_tc_current)
returns jsonb language sql stable set search_path = '' as $$
  select (to_jsonb(p_state) - 'singleton' - 'baseline_id' - 'patch_count') ||
    jsonb_build_object('kind', 'certification', 'chunk_count', (p_state.row_count + 249) / 250);
$$;

create function private.quality_tc_incremental_manifest()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.can_access_quality()) then
    raise exception 'Sem permissão para consultar Técnico Certificado.' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'manifest', private.quality_tc_manifest_json(s),
    'baseline', case when i.id is not null then
      jsonb_build_object('id', i.id, 'row_count', i.row_count, 'chunk_count', i.chunk_count) end,
    'patch_count', s.patch_count
  ) from private.quality_tc_current s
    left join public.quality_imports i on i.id = s.baseline_id where s.singleton);
end;
$$;

create function private.quality_tc_incremental_page(p_import_id uuid, p_after bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.can_access_quality()) then
    raise exception 'Sem permissão para consultar Técnico Certificado.' using errcode = '42501';
  end if;
  -- STABLE: a conferência da versão e a página usam o mesmo snapshot MVCC.
  if not exists (select 1 from private.quality_tc_current where singleton and id = p_import_id) then
    raise exception 'A base mudou durante a leitura. Atualize para tentar novamente.' using errcode = '40001';
  end if;
  return (select jsonb_build_object('records', coalesce(jsonb_agg(p.record order by p.ordinal), '[]'),
    'cursor', coalesce(max(p.ordinal), p_after))
    from (select ordinal, record from private.quality_tc_patches
      where ordinal > p_after order by ordinal limit 1000) p);
end;
$$;

create function private.quality_tc_incremental_start(p_base_import_id uuid, p_source_file text,
  p_row_count integer, p_change_count integer, p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare upload_id uuid;
begin
  if not (select private.can_manage_quality()) then
    raise exception 'Somente gestores podem importar dados.' using errcode = '42501';
  end if;
  -- Somente uploads incrementais incompletos do próprio usuário; preserva as versões antigas.
  delete from private.quality_tc_uploads where imported_by = (select auth.uid())
    and created_at < now() - interval '1 day';
  insert into private.quality_tc_uploads(base_import_id, source_file, row_count,
    change_count, metadata, imported_by) values (p_base_import_id, p_source_file, p_row_count,
    p_change_count, p_metadata, auth.uid()) returning id into upload_id;
  return upload_id;
end;
$$;

create function private.quality_tc_incremental_append(p_upload_id uuid, p_chunk_index integer,
  p_records jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare changes integer;
begin
  if not (select private.can_manage_quality()) then
    raise exception 'Somente gestores podem importar dados.' using errcode = '42501';
  end if;
  select change_count into changes from private.quality_tc_uploads
    where id = p_upload_id and imported_by = (select auth.uid()) for share;
  if not found then
    raise exception 'Importação incremental não encontrada para este gestor.' using errcode = '42501';
  end if;
  if p_chunk_index is null or p_chunk_index < 0 or p_chunk_index >= (changes + 249) / 250
    or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Bloco de alterações inválido.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_records) <> least(250, changes - p_chunk_index * 250) or exists (
    select 1 from jsonb_array_elements(p_records) r
      where jsonb_typeof(r) is distinct from 'object'
        or jsonb_typeof(r->'login') is distinct from 'string' or coalesce(r->>'login', '') = ''
        or coalesce(r->>'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or jsonb_typeof(r->'year') is distinct from 'number'
        or jsonb_typeof(r->'month') is distinct from 'number'
        or octet_length(private.quality_tc_record_key(r)) > 2000
  ) then
    raise exception 'Bloco de alterações inválido ou incompleto.' using errcode = '23514';
  end if;
  insert into private.quality_tc_upload_blocks values (p_upload_id, p_chunk_index, p_records);
end;
$$;

create function private.quality_tc_incremental_finish(p_upload_id uuid, p_cancel boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pending private.quality_tc_uploads;
  current_tc private.quality_tc_current;
  legacy public.quality_imports;
  stored_count integer;
  changes_written integer;
  previous_id uuid;
  baseline_id uuid;
begin
  if not (select private.can_manage_quality()) then
    raise exception 'Somente gestores podem importar dados.' using errcode = '42501';
  end if;
  if p_cancel is true then
    delete from private.quality_tc_uploads where id = p_upload_id and imported_by = (select auth.uid());
    return null;
  end if;
  select * into pending from private.quality_tc_uploads
    where id = p_upload_id and imported_by = (select auth.uid()) for update;
  if not found then
    raise exception 'Importação incremental não encontrada para este gestor.' using errcode = '42501';
  end if;
  if (select count(*) from private.quality_tc_upload_blocks where upload_id = pending.id)
    <> (pending.change_count + 249) / 250 then
    raise exception 'Importação incremental incompleta.' using errcode = '23514';
  end if;
  if exists (select 1 from private.quality_tc_upload_blocks s,
      lateral jsonb_array_elements(s.records) as record
    where s.upload_id = pending.id group by private.quality_tc_record_key(record) having count(*) > 1) then
    raise exception 'A importação incremental contém a mesma chave mais de uma vez.' using errcode = '23514';
  end if;

  -- Serializa com publicações legadas e impede sobrescrever correções feitas em outra sessão.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('quality:certification'));
  select * into current_tc from private.quality_tc_current where singleton;
  if current_tc.id is null then
    select * into legacy from public.quality_imports where kind = 'certification'
      and published_at is not null order by published_at desc, id desc limit 1;
  end if;
  previous_id := coalesce(current_tc.id, legacy.id);
  baseline_id := case when current_tc.id is null then legacy.id else current_tc.baseline_id end;
  if pending.base_import_id is distinct from previous_id then
    raise exception 'Outra pessoa atualizou esta base. Clique em Atualizar e importe novamente o arquivo.' using errcode = '40001';
  end if;
  if current_tc.id is not null and pending.row_count < current_tc.row_count then
    raise exception 'Quantidade de registros incompatível com a base publicada.' using errcode = '23514';
  end if;

  insert into private.quality_tc_patches as existing(record_key, record)
    select private.quality_tc_record_key(r.record), r.record
      from private.quality_tc_upload_blocks s,
        lateral jsonb_array_elements(s.records) with ordinality as r(record, position)
      where s.upload_id = pending.id order by s.chunk_index, r.position
    on conflict (record_key) do update set record = excluded.record
      where (existing.record - 'file') is distinct from (excluded.record - 'file');
  get diagnostics changes_written = row_count;
  select count(*) into stored_count from private.quality_tc_patches;
  if stored_count > pending.row_count or (baseline_id is null and stored_count <> pending.row_count)
    or (current_tc.id is not null and pending.row_count > current_tc.row_count + changes_written) then
    raise exception 'Quantidade de registros incompatível com as alterações.' using errcode = '23514';
  end if;

  delete from private.quality_tc_uploads where id = pending.id;
  if changes_written = 0 and pending.row_count = coalesce(current_tc.row_count, legacy.row_count)
    and (pending.metadata - 'files') = (coalesce(current_tc.metadata, legacy.metadata) - 'files') then
    return case when current_tc.id is not null then private.quality_tc_manifest_json(current_tc)
      else to_jsonb(legacy) end;
  end if;

  insert into private.quality_tc_current as state(id, baseline_id, base_import_id, row_count,
    patch_count, source_file, imported_by, metadata, created_at, published_at)
    values (pending.id, baseline_id, previous_id, pending.row_count, stored_count,
      pending.source_file, pending.imported_by, pending.metadata, pending.created_at, clock_timestamp())
    on conflict (singleton) do update set id = excluded.id, baseline_id = excluded.baseline_id,
      base_import_id = excluded.base_import_id, row_count = excluded.row_count,
      patch_count = excluded.patch_count, source_file = excluded.source_file,
      imported_by = excluded.imported_by, metadata = excluded.metadata,
      created_at = excluded.created_at, published_at = excluded.published_at
    returning state.* into current_tc;
  return private.quality_tc_manifest_json(current_tc);
end;
$$;

-- A versão antiga continua funcionando até a primeira publicação incremental.
-- Depois, abas antigas não podem voltar a publicar cópias da base inteira.
create function private.quality_tc_guard_legacy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('quality:certification'));
  if exists (select 1 from private.quality_tc_current where singleton) then
    raise exception 'Recarregue a página para importar pela versão incremental de Técnico Certificado.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger quality_tc_guard_legacy before insert or update on public.quality_imports
  for each row when (new.kind = 'certification') execute function private.quality_tc_guard_legacy();

-- Wrappers expostos com os privilégios do chamador; acesso efetivo checado em private.
create function public.quality_tc_incremental_manifest()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.quality_tc_incremental_manifest();
$$;
create function public.quality_tc_incremental_page(p_import_id uuid, p_after bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.quality_tc_incremental_page(p_import_id, p_after);
$$;
create function public.quality_tc_incremental_start(p_base_import_id uuid, p_source_file text,
  p_row_count integer, p_change_count integer, p_metadata jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.quality_tc_incremental_start(p_base_import_id, p_source_file, p_row_count, p_change_count, p_metadata);
$$;
create function public.quality_tc_incremental_append(p_upload_id uuid, p_chunk_index integer, p_records jsonb)
returns void language sql security invoker set search_path = '' as $$
  select private.quality_tc_incremental_append(p_upload_id, p_chunk_index, p_records);
$$;
create function public.quality_tc_incremental_finish(p_upload_id uuid, p_cancel boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.quality_tc_incremental_finish(p_upload_id, p_cancel);
$$;

revoke all on function private.quality_tc_record_key(jsonb),
  private.quality_tc_manifest_json(private.quality_tc_current), private.quality_tc_guard_legacy()
  from public, anon, authenticated;

revoke all on function public.quality_tc_incremental_manifest(),
  public.quality_tc_incremental_page(uuid, bigint),
  public.quality_tc_incremental_start(uuid, text, integer, integer, jsonb),
  public.quality_tc_incremental_append(uuid, integer, jsonb), public.quality_tc_incremental_finish(uuid, boolean),
  private.quality_tc_incremental_manifest(), private.quality_tc_incremental_page(uuid, bigint),
  private.quality_tc_incremental_start(uuid, text, integer, integer, jsonb),
  private.quality_tc_incremental_append(uuid, integer, jsonb), private.quality_tc_incremental_finish(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.quality_tc_incremental_manifest(),
  public.quality_tc_incremental_page(uuid, bigint),
  public.quality_tc_incremental_start(uuid, text, integer, integer, jsonb),
  public.quality_tc_incremental_append(uuid, integer, jsonb), public.quality_tc_incremental_finish(uuid, boolean),
  private.quality_tc_incremental_manifest(), private.quality_tc_incremental_page(uuid, bigint),
  private.quality_tc_incremental_start(uuid, text, integer, integer, jsonb),
  private.quality_tc_incremental_append(uuid, integer, jsonb), private.quality_tc_incremental_finish(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';
commit;
