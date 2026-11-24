// Contract test. Uses only an empty, isolated localhost DB ending in _test.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const url = process.env.VT_REVISITAS_TEST_URL;
if (!url) throw Error("Informe VT_REVISITAS_TEST_URL para um PostgreSQL local vazio (_test).");
const target = new URL(url);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.search ||
  !target.pathname.endsWith("_test")
)
  throw Error("Banco de testes precisa ser local, sem parâmetros, e terminar em _test.");
const quality = readFileSync(
  "supabase/migrations/20261013130908_add_quality_dashboard.sql",
  "utf8",
);
const helpers = quality.slice(
  quality.indexOf("create schema if not exists private;"),
  quality.indexOf("create table public.quality_imports"),
);
const migrationBody = (file) =>
  // Keep both migrations and their fixtures in the test's single transaction.
  readFileSync(`supabase/migrations/${file}`, "utf8")
    .replace(/^begin;\r?$/im, "")
    .replace(/^commit;\r?$/im, "");
const migration = migrationBody("20261119181119_add_vt_revisita_periodos.sql");
const attendanceKeyMigration = migrationBody("20261123133200_vt_revisitas_identificar_atendimentos.sql");
const sql = `
begin;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public') then raise exception 'Banco de teste não está vazio'; end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles (id uuid primary key, status text, role text);
insert into public.profiles values
 ('00000000-0000-0000-0000-000000000001','active','admin'),
 ('00000000-0000-0000-0000-000000000002','active','supervisor'),
 ('00000000-0000-0000-0000-000000000003','pending','admin');
${helpers}
${migration}

-- Seed a period as it was genuinely written by the old function, before upgrading.
set role authenticated;
select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
select public.vt_revisita_write('fortaleza','2026-11-01',0,'orders',
  '{"file":"18.xlsx","rows":[{"id":"OS:1","os":"1","wo":"W","contract":"C1","day":"2026-11-18","municipality":"FORTALEZA","technician":"Ana","code":517}]}');
reset role;
${attendanceKeyMigration}

set role authenticated;
select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
do $$
declare
  ft jsonb := '{"file":"ftz.xlsx","rows":[{"id":"OS:1|WO:W|D:2026-11-18","os":"1","wo":"W","contract":"C1","day":"2026-11-18","municipality":"FORTALEZA","technician":"Ana","code":541},{"id":"OS:2|WO:W|D:2026-11-18","os":"2","wo":"W","contract":"C2","day":"2026-11-18","municipality":"FORTALEZA","technician":"Ana","code":505},{"id":"OS:1|WO:W|D:2026-11-19","os":"1","wo":"W","contract":"C1","day":"2026-11-19","municipality":"FORTALEZA","technician":"Ana","code":0},{"id":"OS:1|WO:W%7C2|D:2026-11-19","os":"1","wo":"W|2","contract":"C1","day":"2026-11-19","municipality":"FORTALEZA","technician":"Ana","code":555}]}';
  ntl text := '{"file":"ntl.xlsx","rows":[{"id":"OS:1","os":"1","wo":"W","contract":"C1","day":"2026-11-18","municipality":"PARNAMIRIM","technician":"Bia","code":400}]}';
  att jsonb := '{"file":"dias.xlsx","rows":[{"id":"LOGIN:Z1","technician":"Ana","login":"Z1","value":10}]}';
  hrs jsonb := '{"file":"hora.xlsx","rows":[{"id":"LOGIN:Z1","technician":"Ana","login":"Z1","value":29700}]}';
  snap jsonb := '{"rules":{"dailyCents":1200},"payments":[{"technician":"Ana","days":10,"entry":29700,"total":12000}]}';
begin
  if not exists (select 1 from public.vt_revisita_periodos where city='fortaleza'
    and orders->0->>'id'='OS:1' and revision=1) then raise exception 'Migração alterou dados antes da importação'; end if;
  begin
    perform public.vt_revisita_write('natal','2026-11-01',0,'orders',ft);
    raise exception 'Aceitou importação de outra cidade';
  exception when invalid_parameter_value then null; end;
  -- Import the later visit without altering the earlier, legacy-keyed record.
  if public.vt_revisita_write('fortaleza','2026-11-01',1,'orders',
    jsonb_set(ft, '{rows}', jsonb_build_array(ft #> '{rows,2}', ft #> '{rows,3}'))) <> 2 then
    raise exception 'Revisão inválida';
  end if;
  if not exists (select 1 from public.vt_revisita_periodos, jsonb_array_elements(orders) r
    where city='fortaleza' and jsonb_array_length(orders)=3
      and r->>'id'='OS:1|WO:W|D:2026-11-18' and (r->>'code')::integer=517) then
    raise exception 'Importação de outro dia alterou a visita anterior';
  end if;
  if public.vt_revisita_write('fortaleza','2026-11-01',2,'orders',ft) <> 3 then raise exception 'Revisão inválida'; end if;
  if public.vt_revisita_write('fortaleza','2026-11-01',3,'orders',ft) <> 4 then raise exception 'Revisão inválida'; end if;
  perform public.vt_revisita_write('natal','2026-11-01',0,'orders',ntl::jsonb);
  if not exists (select 1 from public.vt_revisita_periodos where city='fortaleza'
     and jsonb_array_length(orders)=4
     and (select count(*) from jsonb_array_elements(orders) r where r->>'os'='1')=3
     and (select count(*) from jsonb_array_elements(orders) r
          where r->>'id'='OS:1|WO:W|D:2026-11-18' and (r->>'code')::integer=541)=1
  ) then raise exception 'Atendimento repetido, descartado ou não atualizado'; end if;
  if not exists (select 1 from public.vt_revisita_periodos where city='natal' and jsonb_array_length(orders)=1 and orders->0->>'municipality'='PARNAMIRIM') then raise exception 'Cidades misturadas'; end if;
  begin
    perform public.vt_revisita_write('fortaleza','2026-11-01',3,'days',att);
    raise exception 'Aceitou revisão antiga';
  exception when serialization_failure then null; end;
  begin
    perform public.vt_revisita_write('fortaleza','2026-11-01',4,'close',snap);
    raise exception 'Fechou sem dias e horários';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.vt_revisita_write('fortaleza','2026-11-01',4,'orders',jsonb_set(ft,'{rows,0,id}','"outro-id"'));
    raise exception 'Aceitou identificador incompatível';
  exception when invalid_parameter_value then null; end;
  perform public.vt_revisita_write('fortaleza','2026-11-01',4,'days',att);
  perform public.vt_revisita_write('fortaleza','2026-11-01',5,'entries',hrs);
  perform public.vt_revisita_write('fortaleza','2026-11-01',6,'close',snap);
  if not exists (select 1 from public.vt_revisita_periodos where city='fortaleza' and closed_at is not null and snapshot=snap) then raise exception 'Cópia fechada não gravada'; end if;
  begin
    perform public.vt_revisita_write('fortaleza','2026-11-01',7,'orders',ft);
    raise exception 'Editou período fechado';
  exception when object_not_in_prerequisite_state then null; end;
  perform public.vt_revisita_write('natal','2026-11-01',1,'orders',ntl::jsonb);
end $$;

select set_config('test.uid','00000000-0000-0000-0000-000000000002',false);
do $$ begin
  if (select count(*) from public.vt_revisita_periodos) <> 2 then raise exception 'Supervisor não consegue consultar'; end if;
  begin
    perform public.vt_revisita_write('natal','2026-11-01',2,'days','{}');
    raise exception 'Supervisor conseguiu escrever';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.uid','00000000-0000-0000-0000-000000000003',false);
do $$ begin
  if (select count(*) from public.vt_revisita_periodos) <> 0 then raise exception 'Perfil pendente consegue consultar'; end if;
end $$;

reset role;
do $$ begin
  begin
    update public.vt_revisita_periodos set revision=100 where city='fortaleza';
    raise exception 'Trigger deixou alterar o fechamento';
  exception when object_not_in_prerequisite_state then null; end;
  if has_table_privilege('anon','public.vt_revisita_periodos','select') or has_table_privilege('authenticated','public.vt_revisita_periodos','update') then raise exception 'Permissões incorretas'; end if;
  if has_function_privilege('authenticated','private.vt_revisita_order_key(jsonb)','execute') then raise exception 'Exposição da função interna'; end if;
end $$;
select 'OK: atendimento por O.S., WO e dia; legado preservado; reimportação idempotente; acesso e fechamento intactos' as teste;
rollback;
`;

const run = spawnSync("psql", [url, "-X", "--no-password", "-v", "ON_ERROR_STOP=1"], {
  input: sql,
  encoding: "utf8",
  env: { ...process.env, PGCLIENTENCODING: "UTF8" },
});
if (run.error) throw run.error;
if (run.status !== 0) throw Error(run.stderr || run.stdout);
console.log(run.stdout);
