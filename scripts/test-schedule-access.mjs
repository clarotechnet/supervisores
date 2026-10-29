// Uses REAL schedule migrations in an EMPTY LOCAL PostgreSQL test database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const url = process.env["SCHEDULE_ACCESS_TEST_URL"];
if (!url)
  throw Error("Set SCHEDULE_ACCESS_TEST_URL to a new empty local database ending in _test.");
const target = new URL(url);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.search ||
  !target.pathname.endsWith("_test")
)
  throw Error("Only isolated local test databases are allowed.");
const bootstrap = `
do $$ begin
 if exists(select 1 from information_schema.tables where table_schema='public') then
  raise exception 'Database must be empty';
 end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create type public.app_role as enum('admin','supervisor','controller');
create type public.user_status as enum('active','inactive','pending');
-- Auth substrate only; all schedule DDL and RLS are loaded from real migrations.
create table public.profiles(id uuid primary key,role public.app_role not null,
 status public.user_status not null,full_name text default 'TEST USER',email text,sector_id uuid);
-- Empty messaging substrate required by the actual security-hardening migration.
create table public.conversation_messages(
 manager_id uuid,supervisor_id uuid,sender_id uuid,created_at timestamptz,read_at timestamptz
);
grant select on public.profiles to authenticated,service_role;
create function public.is_admin(_uid uuid) returns boolean language sql stable
 security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=_uid and role='admin' and status='active')
$$;
create function public.can_access_schedules(_uid uuid) returns boolean language sql stable
 security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=_uid and status='active')
$$;
create function public.can_manage_schedules(_uid uuid) returns boolean language sql stable
 security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=_uid and role in('admin','supervisor') and status='active')
$$;
alter table public.profiles enable row level security;
create policy profiles_test_read on public.profiles for select to authenticated
 using(id=(select auth.uid()) or public.is_admin((select auth.uid())));
create function public.set_updated_at() returns trigger language plpgsql as $$
 begin new.updated_at=clock_timestamp(); return new; end
$$;
`;
const upload = fs.readFileSync(
  "supabase/migrations/20260922124401_create_schedule_uploads.sql",
  "utf8",
);
const start = upload.indexOf("create table public.schedule_uploads");
if (start < 0) throw Error("Cannot locate upload DDL.");
const migrations = [
  "20260922135118_add_schedule_suggestions_and_date_notes.sql",
  "20260922141345_restrict_schedule_mutations_to_managers_and_supervisors.sql",
  "20260924190737_harden_security_definer_functions.sql",
  "20261027202647_schedule_rules_and_drafts.sql",
  "20261028100000_schedule_operational_sheets.sql",
  "20261028141000_schedule_draft_archive.sql",
  "20261028160000_schedule_operational_shared_workbook_tabs.sql",
  "20261028170000_publish_operational_schedule.sql",
  "20261028170001_control_schedule_access.sql",
  "20261028170002_schedule_official_edit.sql",
]
  .map((file) => fs.readFileSync("supabase/migrations/" + file, "utf8"))
  .join("\n");
// Reproduce the production failure before applying the narrow grant repair.
const missingPrivatePermission = `
begin;
set local role service_role;
do $$ begin
 begin
  perform public.can_manage_schedules('00000000-0000-0000-0000-000000000000');
  raise exception 'Missing private permission was not reproduced';
 exception when insufficient_privilege then
  if sqlerrm not like '%schema private%' then raise; end if;
  raise notice 'PASS: reproduced permission denied for schema private before repair';
 end;
end $$;
rollback;
`;
const input =
  bootstrap +
  upload.slice(start) +
  migrations +
  missingPrivatePermission +
  fs.readFileSync(
    "supabase/migrations/20261028194624_schedule_private_helpers_service_role.sql",
    "utf8",
  ) +
  "\n" +
  fs.readFileSync("tests/schedule-private-helper-permissions.sql", "utf8") +
  "\n" +
  fs.readFileSync("tests/schedule-control-access.sql", "utf8") +
  "\n" +
  fs.readFileSync("tests/schedule-official-edit.sql", "utf8") +
  "\n" +
  fs.readFileSync("supabase/migrations/20261029132008_schedule_month_deletion.sql", "utf8") +
  "\n" +
  fs.readFileSync("tests/schedule-month-deletion.sql", "utf8");
// Windows may close a large stdin pipe early; let psql read a UTF-8 file.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-access-test-"));
let result;
try {
  const sqlFile = path.join(tempDir, "test.sql");
  fs.writeFileSync(sqlFile, input, "utf8");
  result = spawnSync(
    process.env["PSQL_PATH"] || "psql",
    [url, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", sqlFile],
    {
      encoding: "utf8",
      env: { ...process.env, PGCLIENTENCODING: "UTF8" },
    },
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (result.error) throw result.error;
if (result.status === 0) {
  const checks = (result.stderr.match(/PASS:/g) || []).length;
  process.stdout.write("Schedule access SQL: " + checks + " checks passed.\n");
} else {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
process.exitCode = result.status ?? 1;
