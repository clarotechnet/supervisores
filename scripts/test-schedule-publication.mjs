// Isolated contract test. Requires a NEW, empty local PostgreSQL database ending in _test.
// Never reads .env or connects to the linked Supabase project.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const url = process.env["SCHEDULE_PUBLICATION_TEST_URL"];
if (!url)
  throw Error("Set SCHEDULE_PUBLICATION_TEST_URL to an empty local database ending in _test.");
const target = new URL(url);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  !target.pathname.endsWith("_test")
)
  throw Error("Only isolated localhost databases ending in _test are allowed.");
const schema = fs.readFileSync(
  "supabase/migrations/20260922124401_create_schedule_uploads.sql",
  "utf8",
);
const uploadStart = schema.indexOf("create table public.schedule_uploads");
const uploadEnd = schema.indexOf("alter table public.schedule_uploads enable row level security");
const notes = fs.readFileSync(
  "supabase/migrations/20260922135118_add_schedule_suggestions_and_date_notes.sql",
  "utf8",
);
const notesStart = notes.indexOf("create table public.schedule_date_notes");
const access = fs.readFileSync(
  "supabase/migrations/20261028170001_control_schedule_access.sql",
  "utf8",
);
const scopeStart = access.indexOf("create function public.schedule_can_manage_scope(");
const scopeEnd = access.indexOf("$$;", scopeStart);
if (scopeStart < 0 || scopeEnd < 0) throw Error("Cannot locate schedule management scope DDL.");
if (notesStart < 0) throw Error("Cannot locate schedule_date_notes DDL.");
if (uploadStart < 0 || uploadEnd < 0) throw Error("Cannot locate schedule_uploads DDL.");
const bootstrap = `
do $$ begin
 if exists (select 1 from information_schema.tables where table_schema='public') then
  raise exception 'Database must be empty';
 end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
-- Minimal auth substrate; schedule tables and RPCs use the REAL migration DDL.
create table public.profiles(id uuid primary key,role text not null,status text not null);
grant select on public.profiles to service_role;
create function public.is_admin(id uuid) returns boolean language sql stable as $$
 select exists(select 1 from profiles where profiles.id=$1 and role='admin' and status='active')
$$;
create function public.can_access_schedules(id uuid) returns boolean language sql stable as $$ select true $$;
create function public.can_manage_schedules(id uuid) returns boolean language sql stable as $$ select true $$;
create function public.set_updated_at() returns trigger language plpgsql as $$
 begin new.updated_at=clock_timestamp(); return new; end
$$;
`;
const migrations = [
  "20261027202647_schedule_rules_and_drafts.sql",
  "20261028100000_schedule_operational_sheets.sql",
  "20261028141000_schedule_draft_archive.sql",
  "20261028160000_schedule_operational_shared_workbook_tabs.sql",
  "20261028170000_publish_operational_schedule.sql",
  "20261029132008_schedule_month_deletion.sql",
  "20261030153159_schedule_publish_saved_revision.sql",
  "20261030164120_schedule_confirmed_tab_deletion.sql",
  "20261030191159_schedule_control_roster_sync.sql",
]
  .map((file) => fs.readFileSync("supabase/migrations/" + file, "utf8"))
  .join("\n");
const sql =
  bootstrap +
  schema.slice(uploadStart, uploadEnd) +
  "\ngrant all on public.schedule_uploads to service_role;\n" +
  notes.slice(notesStart) +
  "\n" +
  access.slice(scopeStart, scopeEnd + 3) +
  "\n" +
  migrations +
  "\n" +
  fs.readFileSync("tests/schedule-publication.sql", "utf8") +
  "\n" +
  fs.readFileSync("tests/schedule-publication-revision.sql", "utf8") +
  "\n" +
  fs.readFileSync("tests/schedule-control-roster.sql", "utf8");
const result = spawnSync(
  process.env["PSQL_PATH"] || "psql",
  [url, "-X", "-v", "ON_ERROR_STOP=1", "-q"],
  {
    input: sql,
    encoding: "utf8",
    env: { ...process.env, PGCLIENTENCODING: "UTF8" },
  },
);
if (result.error) throw result.error;
if (result.status === 0) {
  process.stdout.write(
    "Schedule publication/deletion SQL: " +
      (result.stderr.match(/PASS:/g) || []).length +
      " checks passed.\n",
  );
} else {
  process.stderr.write(result.stderr);
}
process.exitCode = result.status ?? 1;
