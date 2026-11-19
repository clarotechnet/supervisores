-- Revisita VT is independent of the Técnico Certificado imports.
begin;

create table public.vt_revisita_periodos (
  city text not null check (city in ('fortaleza','natal')),
  period date not null check (extract(day from period) = 1),
  revision integer not null default 0 check (revision >= 0),
  orders jsonb not null default '[]',
  days jsonb not null default '[]',
  entries jsonb not null default '[]',
  sources jsonb not null default '{}',
  closed_at timestamptz,
  closed_by uuid,
  snapshot jsonb,
  primary key (city, period),
  check ((closed_at is null and snapshot is null and closed_by is null)
      or (closed_at is not null and snapshot is not null and closed_by is not null))
);

alter table public.vt_revisita_periodos enable row level security;
revoke all on public.vt_revisita_periodos from public, anon, authenticated, service_role;
grant select on public.vt_revisita_periodos to authenticated;
create policy vt_revisita_read on public.vt_revisita_periodos for select to authenticated
  using ((select private.can_access_quality()));

create function private.vt_revisita_protect_closed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.closed_at is not null then
    raise exception 'Período fechado. Os registros e o pagamento são imutáveis.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.vt_revisita_protect_closed() from public, anon, authenticated, service_role;
create trigger vt_revisita_protect_closed before update or delete on public.vt_revisita_periodos
  for each row execute function private.vt_revisita_protect_closed();

create function private.vt_revisita_apply(p_city text, p_period date, p_revision integer, p_kind text, p_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  base public.vt_revisita_periodos%rowtype;
  incoming jsonb;
  merged jsonb;
  file_name text;
  source_stamp jsonb;
begin
  if (select auth.uid()) is null or not (select private.can_manage_quality()) then
    raise exception 'Somente administradores ativos podem importar ou fechar.' using errcode = '42501';
  end if;
  if p_city is null or p_city not in ('fortaleza','natal') or p_period is null
     or extract(day from p_period) <> 1 or p_period < date '2000-01-01' or p_period >= date '2100-01-01'
     or p_revision is null or p_revision < 0 or p_kind is null
     or p_kind not in ('orders','days','entries','close')
     or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Cidade, competência ou operação inválida.' using errcode = '22023';
  end if;

  -- The same city/month row serializes both imports and closure.
  insert into public.vt_revisita_periodos (city, period) values (p_city, p_period)
    on conflict (city, period) do nothing;
  select * into strict base from public.vt_revisita_periodos
    where city = p_city and period = p_period for update;
  if base.closed_at is not null then
    raise exception 'Este período está fechado e não aceita alterações.' using errcode = '55000';
  end if;
  if base.revision <> p_revision then
    raise exception 'A base foi atualizada. Recarregue e confira antes de continuar.' using errcode = '40001';
  end if;

  if p_kind = 'close' then
    if jsonb_array_length(base.orders) = 0 or jsonb_array_length(base.days) = 0 or jsonb_array_length(base.entries) = 0
       or jsonb_typeof(p_payload->'rules') is distinct from 'object'
       or jsonb_typeof(p_payload->'payments') is distinct from 'array' then
      raise exception 'Importe as três bases e confira os pagamentos antes de fechar.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payload->'payments') not between 1 and 1000
       or exists (select 1 from jsonb_array_elements(p_payload->'payments') p(row)
         where length(btrim(coalesce(p.row->>'technician',''))) = 0
            or jsonb_typeof(p.row->'total') is distinct from 'number'
            or jsonb_typeof(p.row->'days') is distinct from 'number'
            or jsonb_typeof(p.row->'entry') is distinct from 'number') then
      raise exception 'Há pagamentos com dados incompletos.' using errcode = '22023';
    end if;
    update public.vt_revisita_periodos
      set closed_at = now(), closed_by = (select auth.uid()), snapshot = p_payload, revision = base.revision + 1
      where city = p_city and period = p_period;
    return base.revision + 1;
  end if;

  incoming := p_payload->'rows';
  file_name := btrim(coalesce(p_payload->>'file',''));
  if jsonb_typeof(incoming) is distinct from 'array' or length(file_name) not between 1 and 240 then
    raise exception 'Arquivo ou registros inválidos.' using errcode = '22023';
  end if;
  if jsonb_array_length(incoming) not between 1 and 15000 or exists (
    select 1 from jsonb_array_elements(incoming) i(row)
    where jsonb_typeof(i.row) is distinct from 'object'
       or length(btrim(coalesce(i.row->>'id',''))) not between 1 and 180
       or length(btrim(coalesce(i.row->>'technician',''))) not between 1 and 200
  ) then raise exception 'Importação contém registros inválidos.' using errcode = '22023'; end if;

  if p_kind = 'orders' and exists (
    select 1 from jsonb_array_elements(incoming) i(row)
    where case when coalesce(i.row->>'day','') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
          then date_trunc('month', (i.row->>'day')::date)::date is distinct from p_period else true end
       or case when p_city = 'fortaleza'
             then coalesce(i.row->>'municipality','') not in ('FORTALEZA','FORTALEZA/CE','FORTALEZA - CE')
             else coalesce(i.row->>'municipality','') not in ('NATAL','PARNAMIRIM','NATAL/PARNAMIRIM','NATAL/RN','PARNAMIRIM/RN') end
       or not (coalesce(i.row->>'code','') ~ '^[0-9]{1,3}$')
       or i.row->>'id' is distinct from case when coalesce(i.row->>'os','') <> '' then 'OS:' || (i.row->>'os') else 'WO:' || (i.row->>'wo') end
       or (coalesce(i.row->>'os','') = '' and coalesce(i.row->>'wo','') = '')
       or length(btrim(coalesce(i.row->>'contract',''))) = 0
  ) then raise exception 'Há ordens incompatíveis com a cidade, competência ou formato selecionado.' using errcode = '22023'; end if;

  if p_kind in ('days','entries') and exists (
    select 1 from jsonb_array_elements(incoming) i(row)
    where case when jsonb_typeof(i.row->'value') = 'number' then
      (i.row->>'value')::numeric not between 0 and (case when p_kind = 'days' then 31 else 86399 end)
      or (p_kind = 'entries' and (i.row->>'value')::numeric <> trunc((i.row->>'value')::numeric))
    else true end
  ) then raise exception 'Dias ou horários importados estão fora dos limites.' using errcode = '22023'; end if;

  select jsonb_agg(m.row order by m.id) into merged from (
    select distinct on (row->>'id') row->>'id' id, row
    from (
      select row, 0 as priority, position from jsonb_array_elements(
        case p_kind when 'orders' then base.orders when 'days' then base.days else base.entries end
      ) with ordinality as o(row, position)
      union all
      select row, 1, position from jsonb_array_elements(incoming) with ordinality as i(row, position)
    ) changes order by row->>'id', priority desc, position desc
  ) m;
  if jsonb_array_length(merged) > 25000 then
    raise exception 'A competência ultrapassou o limite de 25.000 registros.' using errcode = '22023';
  end if;
  source_stamp := jsonb_build_object('file', file_name, 'count', jsonb_array_length(incoming), 'at', now());
  update public.vt_revisita_periodos set
    orders = case when p_kind = 'orders' then merged else base.orders end,
    days = case when p_kind = 'days' then merged else base.days end,
    entries = case when p_kind = 'entries' then merged else base.entries end,
    revision = base.revision + 1,
    sources = base.sources || jsonb_build_object(p_kind, source_stamp)
  where city = p_city and period = p_period;
  return base.revision + 1;
end;
$$;

revoke all on function private.vt_revisita_apply(text,date,integer,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function private.vt_revisita_apply(text,date,integer,text,jsonb) to authenticated;

create function public.vt_revisita_write(p_city text, p_period date, p_revision integer, p_kind text, p_payload jsonb)
returns integer language sql security invoker set search_path = '' as $$
  select private.vt_revisita_apply(p_city, p_period, p_revision, p_kind, p_payload);
$$;
revoke all on function public.vt_revisita_write(text,date,integer,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.vt_revisita_write(text,date,integer,text,jsonb) to authenticated;

commit;
