// Local ephemeral PostgreSQL (PGlite). Never connects to a Supabase project.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const packageRoot = process.argv[2];
if (!packageRoot || !path.isAbsolute(packageRoot))
  throw Error("Provide an absolute temporary PGlite installation path.");
const require = createRequire(path.join(packageRoot, "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001",
  supervisor = "00000000-0000-0000-0000-000000000002",
  controller = "00000000-0000-0000-0000-000000000003";
const metadata = {
  counts: { current: 2, history: 0, previousCsv: 0 },
  bases: { current: { source: "synthetic", sourceType: "CSV", stats: {} } },
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key,role text,status text);
    insert into public.profiles values ('${admin}','admin','active'),('${supervisor}','supervisor','active'),('${controller}','controller','active');
    create table public.quality_certification_data(id integer primary key,value text);
    insert into public.quality_certification_data values(1,'TC unchanged');`);
  const existing = fs.readFileSync(
    "supabase/migrations/20261013130908_add_quality_dashboard.sql",
    "utf8",
  );
  await db.exec(
    existing.slice(
      existing.indexOf("create schema"),
      existing.indexOf("create table public.quality_imports"),
    ),
  );
  await db.exec(
    fs.readFileSync("supabase/migrations/20261020154717_add_sla_warranty_dashboard.sql", "utf8"),
  );
  const rls = (
    await db.query(
      "select relname,relrowsecurity from pg_class where relname in ('sla_warranty_imports','sla_warranty_data') order by relname",
    )
  ).rows;
  assert(rls.length === 2 && rls.every((row) => row.relrowsecurity));
  const functions = (
    await db.query(
      "select proname,prosecdef,has_function_privilege('anon',oid,'execute') as anon_execute from pg_proc where proname like '%sla_warranty%'",
    )
  ).rows;
  assert(functions.length === 3 && functions.every((row) => !row.prosecdef && !row.anon_execute));
  const asUser = async (id) => {
    await db.exec("reset role; set role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const pending = async (baseId = null, meta = metadata) =>
    (
      await db.query(
        "insert into public.sla_warranty_imports(source_file,imported_by,row_count,chunk_count,metadata,base_import_id) values('test.csv',auth.uid(),2,1,$1,$2) returning id",
        [JSON.stringify(meta), baseId],
      )
    ).rows[0].id;
  await asUser(admin);
  const first = await pending();
  await assert.rejects(
    db.query("select public.publish_sla_warranty_import($1)", [first]),
    /incompleta/i,
  );
  await db.query("insert into public.sla_warranty_data values($1,'current',0,$2)", [
    first,
    JSON.stringify([{ id: 1 }, { id: 2 }]),
  ]);
  await db.query("select public.publish_sla_warranty_import($1)", [first]);
  assert(
    (await db.query("select published_at from public.sla_warranty_imports where id=$1", [first]))
      .rows[0].published_at,
  );
  await assert.rejects(
    db.query("insert into public.sla_warranty_data values($1,'history',0,'[{}]')", [first]),
    /published|publicada|policy/i,
  );
  const stale = await pending();
  await db.query("insert into public.sla_warranty_data values($1,'current',0,'[{},{}]')", [stale]);
  await assert.rejects(
    db.query("select public.publish_sla_warranty_import($1)", [stale]),
    /outra pessoa/i,
  );
  const invalid = await pending(first, {
    ...metadata,
    counts: { current: 3, history: 0, previousCsv: 0 },
  });
  await db.query("insert into public.sla_warranty_data values($1,'current',0,'[{},{}]')", [
    invalid,
  ]);
  await assert.rejects(
    db.query("select public.publish_sla_warranty_import($1)", [invalid]),
    /incompleta/i,
  );
  await assert.rejects(
    db.query("update public.sla_warranty_imports set metadata='{}' where id=$1", [first]),
    /permission/i,
  );
  await db.query("delete from public.sla_warranty_imports where id=$1", [first]);
  assert.equal(
    (await db.query("select id from public.sla_warranty_imports where published_at is not null"))
      .rows.length,
    1,
  );
  await asUser(supervisor);
  assert.equal((await db.query("select id from public.sla_warranty_imports")).rows.length, 1);
  assert.equal((await db.query("select import_id from public.sla_warranty_data")).rows.length, 1);
  await assert.rejects(pending(first), /policy/i);
  await assert.rejects(
    db.query("select public.publish_sla_warranty_import($1)", [first]),
    /gestores/i,
  );
  await asUser(controller);
  assert.equal((await db.query("select id from public.sla_warranty_imports")).rows.length, 0);
  assert.equal((await db.query("select import_id from public.sla_warranty_data")).rows.length, 0);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from public.sla_warranty_imports"), /permission/i);
  await db.exec("reset role;");
  assert.equal(
    (await db.query("select value from public.quality_certification_data")).rows[0].value,
    "TC unchanged",
  );
  console.log(
    JSON.stringify({
      localPostgres: true,
      migrationApplied: true,
      queriesVerified: true,
      rls: true,
      atomicPublication: true,
      incompleteRejected: true,
      staleRejected: true,
      publishedImmutable: true,
      supervisorsReadOnly: true,
      controllersBlocked: true,
      anonBlocked: true,
      tcUntouched: true,
      productionWrites: 0,
    }),
  );
} finally {
  await db.close();
}
