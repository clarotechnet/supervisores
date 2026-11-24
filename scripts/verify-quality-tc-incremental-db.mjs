// Ephemeral PostgreSQL through PGlite. This script cannot touch Supabase or local data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { tcRowKey } from "../src/lib/quality-math.js";

const runtime = process.argv[2];
if (!runtime || !path.isAbsolute(runtime)) throw Error("Provide the absolute PGlite install path.");
const { PGlite } = createRequire(path.join(runtime, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const supervisor = "00000000-0000-0000-0000-000000000002";
const controller = "00000000-0000-0000-0000-000000000003";
const otherAdmin = "00000000-0000-0000-0000-000000000004";
const json = JSON.stringify;
const sql = (file) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8");
const one = async (text, params = []) => (await db.query(text, params)).rows[0]?.value;
const row = (wo, day, overrides = {}) => ({
  login: "Z1",
  wo,
  day,
  finish: `${day.split("-").reverse().join("/")} 08:15:00`,
  points: "120",
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)),
  file: "base.csv",
  ...overrides,
});
const manifest = () => one("select public.quality_tc_incremental_manifest() as value");
const page = (id, after = 0) =>
  one("select public.quality_tc_incremental_page($1,$2) as value", [id, after]);
const start = (base, total, changes, meta = { files: ["novo.csv"] }) =>
  one("select public.quality_tc_incremental_start($1,'novo.csv',$2,$3,$4) as value", [
    base,
    total,
    changes,
    json(meta),
  ]);
const append = (id, block, records) =>
  db.query("select public.quality_tc_incremental_append($1,$2,$3)", [id, block, json(records)]);
const finish = (id, cancel = false) =>
  one("select public.quality_tc_incremental_finish($1,$2) as value", [id, cancel]);
async function asUser(id) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function legacy(kind, records, base = null, pending = false) {
  const id = await one(
    `insert into public.quality_imports(kind, source_file, imported_by, row_count, chunk_count, base_import_id)
      values ($1,'antigo.csv',auth.uid(),$2,1,$3) returning id as value`,
    [kind, records.length, base],
  );
  const table = {
    certification: "certification",
    technical_visit: "technical_visit",
    quebra: "quebra",
  }[kind];
  await db.query(
    `insert into public.quality_${table}_data(import_id,chunk_index,records) values($1,0,$2)`,
    [id, json(records)],
  );
  if (!pending) await db.query("select public.publish_quality_import($1)", [id]);
  return id;
}

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key, role text, status text);
    insert into public.profiles values ('${admin}','admin','active'),
      ('${supervisor}','supervisor','active'), ('${controller}','controller','active'),
      ('${otherAdmin}','admin','active');`);
  await db.exec(sql("migrations/20261013130908_add_quality_dashboard.sql"));
  await db.exec(sql("migrations/20261013160016_add_technical_visit_certification.sql"));
  await asUser(admin);

  const old = row("OS-AGOSTO", "2026-08-31");
  const fixed = row("01097|OS-CORRIGIDA", "2026-10-02");
  const duplicate = { ...fixed, points: "130", finish: "2/10/2026 8:15" };
  const otherTime = { ...fixed, finish: "02/10/2026 09:00:00" };
  const previousId = await legacy("certification", [old]);
  const baseline = [old, fixed, otherTime, duplicate];
  const baselineId = await legacy("certification", baseline, previousId);
  const pendingLegacy = await legacy("certification", [old], baselineId, true);
  const vtId = await legacy("technical_visit", [old]);
  const qqId = await legacy("quebra", [{ b: 1 }]);
  await db.exec("reset role");
  await db.exec(sql("migrations/20261124124711_quality_tc_importacao_incremental.sql"));
  assert.equal(await one("select count(*)::int as value from private.quality_tc_patches"), 0);
  assert.equal(await one("select count(*)::int as value from private.quality_tc_current"), 0);
  await asUser(admin);
  assert.equal(await manifest(), null);

  const first = await start(baselineId, 4, 2);
  const correction = { ...fixed, points: "168", file: "novo.csv" };
  const newRow = row("OS-NOVEMBRO", "2026-11-10");
  const keys = [
    old,
    fixed,
    duplicate,
    otherTime,
    { ...fixed, login: "Z2" },
    { ...fixed, finish: "" },
  ];
  await db.exec("reset role");
  for (const record of keys) {
    assert.equal(
      await one("select private.quality_tc_record_key($1) as value", [json(record)]),
      tcRowKey(record),
    );
  }
  await asUser(admin);
  await assert.rejects(finish(first), /incompleta/);
  await assert.rejects(append(first, 0, [correction]), /incompleto/);
  await assert.rejects(append(first, 0, [correction, { ...newRow, login: null }]), /inválido/);
  await append(first, 0, [newRow, correction]);
  await asUser(otherAdmin);
  await assert.rejects(finish(first), /não encontrada/);
  await finish(first, true);
  await asUser(supervisor);
  assert.equal(await manifest(), null);
  await assert.rejects(start(baselineId, 4, 1), /Somente gestores/);
  await assert.rejects(append(first, 0, []), /Somente gestores/);
  await asUser(admin);

  const published = await finish(first);
  assert.equal(published.kind, "certification");
  assert.equal(published.row_count, 4);
  assert.deepEqual(await manifest(), {
    manifest: published,
    baseline: { id: baselineId, row_count: 4, chunk_count: 1 },
    patch_count: 2,
  });
  assert.deepEqual((await page(first)).records, [newRow, correction]);
  await assert.rejects(legacy("certification", [old], baselineId), /Recarregue/);
  await assert.rejects(
    db.query("select public.publish_quality_import($1)", [pendingLegacy]),
    /Recarregue/,
  );
  assert(await legacy("technical_visit", [old], vtId));
  assert(await legacy("quebra", [{ b: 1 }], qqId));

  const stale = await start(first, 5, 1);
  await append(stale, 0, [row("CONCORRENTE", "2026-11-11")]);
  const second = await start(first, 5, 2);
  // Descending key order checks that the publication order is not alphabetical.
  const added = row("A-OS-NOVA", "2026-11-13");
  const newCorrection = { ...correction, points: "179" };
  await append(second, 0, [newCorrection, added]);
  await finish(second);
  assert.deepEqual((await page(second)).records, [newRow, newCorrection, added]);
  await assert.rejects(page(first), /mudou durante a leitura/);
  await assert.rejects(finish(stale), /Outra pessoa atualizou/);
  await finish(stale, true);

  // A retried unchanged delta does not rewrite either record or publish a new revision.
  const same = await start(second, 5, 1, { files: ["renomeado.csv"] });
  await append(same, 0, [{ ...newCorrection, file: "renomeado.csv" }]);
  assert.equal((await finish(same)).id, second);
  assert.deepEqual((await page(second)).records, [newRow, newCorrection, added]);
  const duplicateKeys = await start(second, 6, 2);
  await append(duplicateKeys, 0, [added, added]);
  await assert.rejects(finish(duplicateKeys), /a mesma chave/);
  await finish(duplicateKeys, true);
  const metaOnly = await start(second, 5, 0, { corrections: { Z1: "Cadastro" } });
  await finish(metaOnly);
  assert.equal((await manifest()).patch_count, 3);
  assert.equal((await manifest()).manifest.metadata.corrections.Z1, "Cadastro");
  const stored = await one(
    "select records as value from public.quality_certification_data where import_id=$1",
    [baselineId],
  );
  assert.deepEqual(stored, baseline);
  assert.equal(
    await one("select count(*)::int as value from public.quality_certification_data"),
    3,
  );

  await asUser(supervisor);
  assert.equal((await manifest()).manifest.id, metaOnly);
  assert.equal((await page(metaOnly)).records.length, 3);
  await assert.rejects(db.query("select * from private.quality_tc_patches"), /permission denied/);
  await asUser(controller);
  await assert.rejects(manifest(), /Sem permissão/);
  await assert.rejects(page(metaOnly), /Sem permissão/);
  await db.exec("reset role; set role anon");
  await assert.rejects(manifest(), /permission denied/);
  await asUser(admin);
  const many = Array.from({ length: 1003 }, (_, i) => row(`LOTE-${i}`, "2026-11-19"));
  const batched = await start(metaOnly, 5 + many.length, many.length);
  for (let i = 4; i >= 0; i--) await append(batched, i, many.slice(i * 250, (i + 1) * 250));
  await finish(batched);
  const head = await page(batched);
  const tail = await page(batched, head.cursor);
  assert.equal(head.records.length, 1000);
  assert.equal(tail.records.length, 6);
  assert.deepEqual([...head.records, ...tail.records], [newRow, newCorrection, added, ...many]);
  await db.exec("reset role");
  assert.equal(await one("select count(*)::int as value from private.quality_tc_uploads"), 0);
  assert.equal(await one("select count(*)::int as value from private.quality_tc_upload_blocks"), 0);
  console.log(
    "PostgreSQL: base original intacta; deltas, reenvio, leitura, concorrência e permissões verificados.",
  );
} finally {
  await db.close();
}
