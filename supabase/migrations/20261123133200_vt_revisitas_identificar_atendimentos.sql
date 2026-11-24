-- The same O.S. can have different attendances, including visits with the
-- same WO on different dates. Mirror vtOrderKey in src/lib/vt-revisitas.ts.
begin;

create function private.vt_revisita_order_key(p_row jsonb)
returns text language sql immutable set search_path = '' as $$
  select 'OS:' || replace(replace(coalesce(p_row->>'os',''), '%', '%25'), '|', '%7C')
      || '|WO:' || replace(replace(coalesce(p_row->>'wo',''), '%', '%25'), '|', '%7C')
      || '|D:' || coalesce(p_row->>'day','');
$$;

revoke all on function private.vt_revisita_order_key(jsonb) from public, anon, authenticated, service_role;

-- CREATE OR REPLACE preserves the existing restricted function grants.
create or replace function private.vt_revisita_apply(p_city text, p_period date, p_revision integer, p_kind text, p_payload jsonb)
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
       or length(private.vt_revisita_order_key(i.row)) > 180
       or (i.row->>'id') not in (
         private.vt_revisita_order_key(i.row),
         case when coalesce(i.row->>'os','') <> '' then 'OS:' || (i.row->>'os') else 'WO:' || (i.row->>'wo') end
       )
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

  -- Re-key open O.S. only on an order import. A legacy O.S.-only ID must
  -- match the same attendance, not overwrite a later attendance of that O.S.
  select jsonb_agg(
    case when p_kind = 'orders' then jsonb_set(m.row, '{id}', to_jsonb(m.record_key))
         else m.row end
    order by m.record_key
  ) into merged from (
    select distinct on (record_key) record_key, row
    from (
      select row, priority, position,
        case when p_kind = 'orders' then private.vt_revisita_order_key(row)
             else row->>'id' end as record_key
      from (
        select row, 0 as priority, position from jsonb_array_elements(
          case p_kind when 'orders' then base.orders when 'days' then base.days else base.entries end
        ) with ordinality as o(row, position)
        union all
        select row, 1, position from jsonb_array_elements(incoming) with ordinality as i(row, position)
      ) changes
    ) keyed
    order by record_key, priority desc, position desc
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

commit;
