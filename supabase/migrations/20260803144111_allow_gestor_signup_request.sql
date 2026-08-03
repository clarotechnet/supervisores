-- Permite que o futuro gestor escolha o setor Gestor no cadastro público.
-- A escolha de setor nunca concede privilégios: todo perfil continua nascendo
-- como supervisor pendente e precisa ser promovido/aprovado por um admin existente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector uuid;
begin
  select id into v_sector
  from public.sectors
  where slug = nullif(new.raw_user_meta_data ->> 'sector_slug', '')
    and is_active = true;

  insert into public.profiles (id, email, full_name, sector_id, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_sector,
    'supervisor',
    'pending'
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;
