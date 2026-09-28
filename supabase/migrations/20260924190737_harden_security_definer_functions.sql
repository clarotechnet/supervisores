-- Reduz a superficie exposta pela Data API sem alterar o comportamento das
-- politicas RLS. As funcoes que precisam ignorar a RLS ficam no schema
-- privado; as poucas fachadas publicas restantes usam SECURITY INVOKER e
-- aceitam somente o proprio auth.uid() quando chamadas pela API.

begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Impede que novas funcoes recebam EXECUTE de PUBLIC automaticamente. Cada
-- RPC nova deve conceder acesso explicitamente aos papeis necessarios.
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema private
  revoke execute on functions from public;

-- Mantem os mesmos OIDs ao mover os helpers. Assim as politicas RLS ja
-- existentes passam a apontar para private.* sem precisarem ser recriadas.
-- Cada movimento e condicional porque algumas instalacoes nao possuem todos
-- os helpers antigos e uma tentativa anterior pode ter parado no meio.
do $migration$
begin
  if to_regprocedure('private.is_admin(uuid)') is null
     and to_regprocedure('public.is_admin(uuid)') is not null then
    execute 'alter function public.is_admin(uuid) set schema private';
  end if;

  if to_regprocedure('private.is_active_user(uuid)') is null
     and to_regprocedure('public.is_active_user(uuid)') is not null then
    execute 'alter function public.is_active_user(uuid) set schema private';
  end if;

  if to_regprocedure('private.user_sector(uuid)') is null
     and to_regprocedure('public.user_sector(uuid)') is not null then
    execute 'alter function public.user_sector(uuid) set schema private';
  end if;

  if to_regprocedure('private.can_access_schedules(uuid)') is null
     and to_regprocedure('public.can_access_schedules(uuid)') is not null then
    execute 'alter function public.can_access_schedules(uuid) set schema private';
  end if;

  if to_regprocedure('private.can_manage_schedules(uuid)') is null
     and to_regprocedure('public.can_manage_schedules(uuid)') is not null then
    execute 'alter function public.can_manage_schedules(uuid) set schema private';
  end if;

  if to_regprocedure('private.is_controller(uuid)') is null
     and to_regprocedure('public.is_controller(uuid)') is not null then
    execute 'alter function public.is_controller(uuid) set schema private';
  end if;
end;
$migration$;

-- Recria os corpos com search_path vazio e nomes totalmente qualificados.
create or replace function private.is_admin(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = _uid
      and profile.role = 'admin'::public.app_role
      and profile.status = 'active'::public.user_status
  );
$$;

create or replace function private.is_active_user(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = _uid
      and profile.status = 'active'::public.user_status
      and profile.role in (
        'supervisor'::public.app_role,
        'admin'::public.app_role
      )
  );
$$;

create or replace function private.user_sector(_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.sector_id
  from public.profiles as profile
  where profile.id = _uid;
$$;

create or replace function private.can_access_schedules(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = _uid
      and profile.status = 'active'::public.user_status
      and profile.role in (
        'supervisor'::public.app_role,
        'controller'::public.app_role,
        'admin'::public.app_role
      )
  );
$$;

create or replace function private.can_manage_schedules(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = _uid
      and profile.status = 'active'::public.user_status
      and profile.role in (
        'supervisor'::public.app_role,
        'admin'::public.app_role
      )
  );
$$;

create or replace function private.is_controller(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = _uid
      and profile.status = 'active'::public.user_status
      and profile.role = 'controller'::public.app_role
  );
$$;

revoke all on function private.is_admin(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.is_active_user(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.user_sector(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_access_schedules(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_manage_schedules(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.is_controller(uuid)
  from public, anon, authenticated, service_role;

-- As politicas RLS sao avaliadas como authenticated e, por isso, precisam de
-- USAGE no schema e EXECUTE nos helpers. O schema private nao esta exposto no
-- Data API, portanto esses helpers nao viram endpoints /rest/v1/rpc/*.
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_active_user(uuid) to authenticated;
grant execute on function private.user_sector(uuid) to authenticated;
grant execute on function private.can_access_schedules(uuid) to authenticated;
grant execute on function private.can_manage_schedules(uuid) to authenticated;
grant execute on function private.is_controller(uuid) to authenticated;

-- Fachadas de compatibilidade para funcoes e codigo antigos. Elas nao elevam
-- privilegios e um usuario da API so consegue consultar o proprio UUID.
create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.is_admin(_uid))
    else false
  end;
$$;

create or replace function public.is_active_user(_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.is_active_user(_uid))
    else false
  end;
$$;

create or replace function public.user_sector(_uid uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.user_sector(_uid))
    else null::uuid
  end;
$$;

create or replace function public.can_access_schedules(_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.can_access_schedules(_uid))
    else false
  end;
$$;

create or replace function public.can_manage_schedules(_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.can_manage_schedules(_uid))
    else false
  end;
$$;

create or replace function public.is_controller(_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when _uid = (select auth.uid())
      or current_user in ('postgres', 'supabase_admin', 'service_role')
      then (select private.is_controller(_uid))
    else false
  end;
$$;

revoke all on function public.is_admin(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_active_user(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.user_sector(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_access_schedules(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_manage_schedules(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_controller(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.user_sector(uuid) to authenticated;
grant execute on function public.can_access_schedules(uuid) to authenticated;
grant execute on function public.can_manage_schedules(uuid) to authenticated;
grant execute on function public.is_controller(uuid) to authenticated;

-- A listagem de gestores e uma RPC intencional. A parte privilegiada fica
-- privada e a RPC publica passa a ser somente uma fachada SECURITY INVOKER.
do $migration$
begin
  if to_regprocedure('private.list_my_conversation_managers()') is null
     and to_regprocedure('public.list_my_conversation_managers()') is not null then
    execute 'alter function public.list_my_conversation_managers() set schema private';
  end if;
end;
$migration$;

create or replace function private.list_my_conversation_managers()
returns table (
  manager_id uuid,
  manager_name text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    messages.manager_id,
    manager.full_name as manager_name,
    max(messages.created_at) as last_message_at,
    count(*) filter (
      where messages.read_at is null
        and messages.sender_id is distinct from (select auth.uid())
    ) as unread_count
  from public.conversation_messages as messages
  join public.profiles as manager on manager.id = messages.manager_id
  where messages.supervisor_id = (select auth.uid())
    and messages.manager_id is not null
    and manager.role = 'admin'::public.app_role
    and manager.status = 'active'::public.user_status
    and (select private.is_active_user((select auth.uid())))
  group by messages.manager_id, manager.full_name
  order by max(messages.created_at) desc;
$$;

revoke all on function private.list_my_conversation_managers()
  from public, anon, authenticated, service_role;
grant execute on function private.list_my_conversation_managers()
  to authenticated;

create or replace function public.list_my_conversation_managers()
returns table (
  manager_id uuid,
  manager_name text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.list_my_conversation_managers();
$$;

revoke all on function public.list_my_conversation_managers()
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_conversation_managers()
  to authenticated;

-- Funcoes de trigger nao devem ser RPCs. Revogar EXECUTE nao interfere no
-- disparo dos triggers associados a elas.
-- rls_auto_enable existe no banco remoto, mas nao no historico local. Apenas
-- removemos a chamada direta; os triggers continuam ligados ao mesmo OID.
do $migration$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke all on function public.handle_new_user() from public, anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.protect_profile_fields()') is not null then
    execute 'revoke all on function public.protect_profile_fields() from public, anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$migration$;

commit;
