-- Complementar a 20261013130908, já aplicada. Projeto supervisortechnet:
-- rwstmomeldwrjmczrmnp. Não altera usuários, Quark nem as bases QQ/TC.
begin;

create table public.quality_technician_directory (
  login text primary key check (login = upper(btrim(login))
    and length(login) between 1 and 100 and login !~ '\s'),
  full_name text not null check (length(btrim(full_name)) between 1 and 250),
  city text not null default '' check (length(city) <= 150),
  sector text not null default '' check (length(sector) <= 150),
  supervisor text not null default '' check (length(supervisor) <= 250),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quality_directory_updated_by_idx on public.quality_technician_directory(updated_by);
create index quality_directory_created_by_idx on public.quality_technician_directory(created_by);
alter table public.quality_technician_directory enable row level security;
revoke all on public.quality_technician_directory from public, anon, authenticated;
grant select, insert, update, delete on public.quality_technician_directory to authenticated;
grant all on public.quality_technician_directory to service_role;
create policy quality_directory_read on public.quality_technician_directory
  for select to authenticated using ((select private.can_access_quality()));
create policy quality_directory_create on public.quality_technician_directory
  for insert to authenticated with check ((select private.can_manage_quality())
    and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy quality_directory_update on public.quality_technician_directory
  for update to authenticated using ((select private.can_manage_quality()))
  with check ((select private.can_manage_quality()) and updated_by = (select auth.uid()));
create policy quality_directory_delete on public.quality_technician_directory
  for delete to authenticated using ((select private.can_manage_quality()));

-- Aproveita cadastros já salvos, sem inventar cidade/setor e sem apagar o legado.
with latest as (
  select distinct on (kind) * from public.quality_imports
  where published_at is not null order by kind, published_at desc
), candidates as (
  select upper(btrim(e.key)) login, e.value, r.updated_by actor, 0 priority
    from public.quality_supervisor_registry r cross join lateral jsonb_each(r.registry) e
  union all
  select upper(btrim(e.key)), jsonb_build_object('name',e.value), i.imported_by, 1
    from latest i cross join lateral jsonb_each(coalesce(i.metadata->'names','{}')) e
    where i.kind = 'quebra' and jsonb_typeof(e.value) = 'string'
  union all
  select upper(btrim(e.key)), e.value, i.imported_by, 2
    from latest i cross join lateral jsonb_each(coalesce(i.metadata->'techMap','{}')) e
    where i.kind = 'certification' and jsonb_typeof(e.value) = 'object'
), chosen as (
  select distinct on (login) * from candidates
  where length(login) between 1 and 100 and login !~ '\s'
  order by login, priority
)
insert into public.quality_technician_directory(login,full_name,supervisor,created_by,updated_by)
select login,left(coalesce(nullif(btrim(value->>'name'),''),login),250),
  left(coalesce(value->>'supervisor',''),250),actor,actor from chosen;

create or replace function private.stamp_quality_directory()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by = old.created_by; new.created_at = old.created_at;
    if new.login <> old.login then raise exception 'O login é a chave do cadastro.'; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.stamp_quality_directory() from public, anon, authenticated;
create trigger quality_directory_stamp before insert or update on public.quality_technician_directory
  for each row execute function private.stamp_quality_directory();

-- Lote transacional: ou salva todos os logins revisados ou nenhum.
create or replace function public.save_quality_directory(p_entries jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.can_manage_quality()) then
    raise exception 'Somente gestores podem editar logins.' using errcode = '42501';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Envie um lote de cadastros.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 10000 then
    raise exception 'Envie de 1 a 10000 cadastros.' using errcode = '23514';
  end if;
  insert into public.quality_technician_directory(login,full_name,city,sector,supervisor,created_by,updated_by)
  select upper(btrim(e.login)),btrim(e.full_name),btrim(coalesce(e.city,'')),
    btrim(coalesce(e.sector,'')),btrim(coalesce(e.supervisor,'')),auth.uid(),auth.uid()
    from jsonb_to_recordset(p_entries) as e(login text,full_name text,city text,sector text,supervisor text)
  on conflict(login) do update set full_name = excluded.full_name,
    city = excluded.city,sector = excluded.sector,supervisor = excluded.supervisor,
    updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.save_quality_directory(jsonb) from public, anon, authenticated;
grant execute on function public.save_quality_directory(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
