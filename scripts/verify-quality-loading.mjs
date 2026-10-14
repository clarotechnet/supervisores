// Browser regression: synthetic data only; all external HTTP/WS traffic is blocked or mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const actorA = "00000000-0000-0000-0000-000000000001";
const actorB = "00000000-0000-0000-0000-000000000002";
const qRows = Array.from({ length: 6001 }, (_, i) => ({
  d: "2026-10-01",
  lt: "Z1",
  un: "NTL-DMV",
  ci: "Natal",
  cl: "RN",
  f: "ND",
  gf: "ND",
  b: i % 2,
  c: { TEC1: 1 },
  w: String(i),
  contract: String(i),
  os: `OS${i}`,
  wo: `WO${i}`,
  baixa: "100",
  responsible: "TECNICO",
  rawCategory: "TEC1",
  treatment: "COM QUEBRA DE AGENDA",
  service: "INSTALACAO",
  osGroup: "INSTALACAO",
}));
const tRows = [
  {
    login: "Z1",
    name: "Técnico de teste",
    company: "NTL-DMV",
    baseUnit: "NTL-DMV",
    mapSource: "base",
    qr: "0",
    tnum: "95",
    tden: "100",
    points: "127",
    day: "2026-10-01",
    month: 10,
    year: 2026,
    city: "Natal",
    sub: "Natal",
    group: "Instalação",
    type: "1",
    uf: "RN",
    wo: "WO1",
    finish: "01/10/2026 08:00:00",
    contract: "1",
    orders: "",
    lowCodes: "100",
    revisitWo: "",
    noteAt: "01/10/2026",
  },
];
let denyTC = false;
let currentActor = actorA,
  revision = "qq-v1",
  denyQQ = false,
  badBlock = false;
let releaseTC,
  tcGate = new Promise((resolve) => {
    releaseTC = resolve;
  });
const reads = { qq: 0, tc: 0, qVersions: 0, tVersions: 0, writes: 0 };
let active = 0,
  maximum = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket("**/*", (ws) => ws.close());
  await page.addInitScript(
    ({ actorA }) => {
      const id = localStorage.getItem("qa-actor") || actorA;
      const now = Math.floor(Date.now() / 1000),
        user = {
          id,
          email: "qa@example.invalid",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        };
      const jwt =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(
          JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: now + 3600 }),
        ) +
        ".mock";
      localStorage.setItem(
        "sb-rwstmomeldwrjmczrmnp-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "mock",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user,
        }),
      );
    },
    { actorA },
  );
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    const table = url.pathname.split("/").at(-1);
    if (req.method() !== "GET" && !url.pathname.includes("/auth/")) reads.writes++;
    let body = [],
      status = 200;
    if (table === "profiles")
      body = {
        id: currentActor,
        role: "admin",
        status: "active",
        full_name: "QA local",
        email: "qa@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_technician_directory") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      body = [
        {
          login: "Z1",
          full_name: "Técnico de teste",
          city: "Natal",
          sector: "Adesão",
          supervisor: "Supervisor A",
        },
      ];
    }
    if (table === "quality_supervisor_registry") body = null;
    if (table === "quality_imports") {
      const kind = url.searchParams.get("kind")?.slice(3),
        rows = kind === "quebra" ? qRows : tRows;
      if (kind === "quebra") reads.qVersions++;
      else reads.tVersions++;
      if ((kind === "quebra" && denyQQ) || (kind === "certification" && denyTC)) {
        status = 403;
        body = { message: "Access denied", code: "42501" };
      } else
        body = {
          id: kind === "quebra" ? revision : "tc-v1",
          kind,
          source_file: "fixture",
          imported_by: currentActor,
          created_at: "2026-10-01T00:00:00Z",
          published_at: "2026-10-01T00:00:00Z",
          row_count: rows.length,
          chunk_count: Math.ceil(rows.length / 250),
          metadata: {},
          base_import_id: null,
        };
    }
    if (table === "quality_quebra_data" || table === "quality_certification_data") {
      const isQQ = table === "quality_quebra_data",
        rows = isQQ ? qRows : tRows;
      const ranges = url.searchParams.getAll("chunk_index");
      const lo = Number(ranges.find((x) => x.startsWith("gte."))?.slice(4) || 0),
        hi = Number(ranges.find((x) => x.startsWith("lt."))?.slice(3) || 8);
      if (isQQ) {
        reads.qq++;
        maximum = Math.max(maximum, ++active);
      } else {
        reads.tc++;
        await tcGate;
      }
      await new Promise((resolve) => setTimeout(resolve, isQQ ? 100 - (lo % 32) : 10));
      body = Array.from({ length: Math.min(hi, Math.ceil(rows.length / 250)) - lo }, (_, n) => ({
        chunk_index: lo + n,
        records: rows.slice((lo + n) * 250, (lo + n + 1) * 250),
      }));
      if (isQQ && badBlock && lo === 8) body.shift();
      if (isQQ) active--;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const waitQQ = () =>
    page.waitForFunction(
      () =>
        document
          .getElementById("referenceQQ")
          ?.shadowRoot?.getElementById("msg")
          ?.textContent.includes("6.001 registros") &&
        !document.querySelector(".reference-loading"),
    );
  const cacheEntries = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("technet-quality-cache-v1", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const r = db.transaction("datasets").objectStore("datasets").getAll();
          r.onsuccess = () =>
            resolve(r.result.map((x) => ({ user: x.user, revision: x.revision, key: x.key })));
          r.onerror = () => reject(r.error);
        });
      } finally {
        db.close();
      }
    });
  const waitCache = async (revision) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const entries = await cacheEntries();
      if (entries.some((x) => x.user === currentActor && x.revision === revision)) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error(`Cache write missing: ${revision}`);
  };
  await page.goto("http://127.0.0.1:5175/qualidade");
  console.log("Loading QA: initial QQ");
  await waitQQ();
  console.log("Loading QA: QQ ready, TC deferred");
  assert.equal(reads.tc, 0, "TC is not downloaded when opening QQ");
  assert.equal(reads.tVersions, 0, "Even its manifest is deferred until needed");
  assert.equal(reads.qq, 4);
  assert.equal(maximum, 4, "At most four concurrent chunk requests");
  const serviceRows = await page.evaluate(async () => {
    const { fetchQualityDataset } = await import("/src/services/quality.ts");
    const result = await fetchQualityDataset("quebra", {
      userId: "00000000-0000-0000-0000-000000000001",
    });
    return result.snapshot.records;
  });
  assert.deepEqual(serviceRows, qRows, "Out-of-order responses retain all records in order");
  console.log("Loading QA: record order checked");
  await page.locator("#goFS").click();
  await page.locator("#goSlides").click();
  await page.getByText("Preparando bases completas para os slides…", { exact: true }).waitFor();
  assert.equal(
    await page.locator("#slidePlayer").isVisible(),
    false,
    "Slides wait for complete TC",
  );
  for (let attempt = 0; reads.tc === 0 && attempt < 100; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(reads.tc, 1);
  releaseTC();
  await page
    .locator("#slidePlayer")
    .waitFor({ state: "visible" })
    .catch(async (e) => {
      console.log(
        "Slide startup",
        await page.locator(".reference-status").innerText(),
        await page.locator("#slidesFeedback").innerText(),
        errors,
      );
      throw e;
    });
  assert.match(await page.locator("#slidesPosition").innerText(), /\/ 6$/);
  console.log("Loading QA: slides visible");
  await page.locator("#slidesStop").click();
  console.log("Loading QA: slides stopped");
  await page.locator("#goFS").click();
  console.log("Loading QA: slides checked");
  await waitCache("qq-v1");
  await waitCache("tc-v1");
  let before = { ...reads };
  await page.reload();
  await waitQQ();
  assert.equal(reads.qq, before.qq, "Unchanged reload reads no QQ chunks");
  assert.equal(
    reads.qVersions,
    before.qVersions + 1,
    "Cache requires fresh authorized server version",
  );
  await page.locator("#goTC").click();
  await page.waitForFunction(() =>
    document
      .getElementById("referenceTC")
      ?.shadowRoot?.getElementById("fileMeta")
      ?.textContent.includes("1 registros"),
  );
  assert.equal(reads.tc, before.tc, "TC reload also reuses validated disk data");
  const cachedTC = await page.evaluate(async () => {
    const { readQualityCache } = await import("/src/lib/quality-cache.ts");
    return (
      await readQualityCache(
        "rwstmomeldwrjmczrmnp",
        "00000000-0000-0000-0000-000000000001",
        "certification",
        "tc-v1",
        1,
      )
    ).records;
  });
  assert.deepEqual(cachedTC, tRows, "Compression preserves every TC value and field");
  console.log("Loading QA: unchanged reload checked");
  denyTC = true;
  await page.reload();
  await waitQQ();
  const tcBeforeFailure = reads.tc;
  await page.locator("#goTC").click();
  await page.getByText("TC: Access denied", { exact: true }).waitFor();
  assert.equal(reads.tc, tcBeforeFailure, "Denied TC is not downloaded or restored from cache");
  await page.locator("#goQQ").click();
  await waitQQ();
  denyTC = false;
  revision = "qq-v2";
  qRows[0] = { ...qRows[0], b: 1 };
  before = { ...reads };
  await page.reload();
  await waitQQ();
  assert.equal(reads.qq, before.qq + 4, "A new version downloads fresh blocks");
  await waitCache("qq-v2");
  await page.evaluate(async () => {
    const { clearQualityCache } = await import("/src/lib/quality-cache.ts");
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("technet-quality-cache-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    try {
      const entry = await new Promise((resolve) => {
        const r = db.transaction("datasets").objectStore("datasets").getAll();
        r.onsuccess = () => resolve(r.result.find((x) => x.revision === "qq-v2"));
      });
      await clearQualityCache("00000000-0000-0000-0000-000000000001");
      await new Promise((resolve) => {
        const tx = db.transaction("datasets", "readwrite"),
          store = tx.objectStore("datasets");
        store.put({ ...entry, payload: new Blob(["corrupt"]) });
        tx.oncomplete = () => resolve();
      });
    } finally {
      db.close();
    }
  });
  before = { ...reads };
  await page.reload();
  await waitQQ();
  assert.equal(reads.qq, before.qq + 4, "Corrupt cache falls back to the server");
  console.log("Loading QA: changed and corrupt cache checked");
  badBlock = true;
  const integrityError = await page.evaluate(async () => {
    const { fetchQualityDataset } = await import("/src/services/quality.ts");
    try {
      await fetchQualityDataset("quebra");
      return "unexpected success";
    } catch (e) {
      return e.message;
    }
  });
  assert.match(integrityError, /incompleta/);
  badBlock = false;
  await waitCache("qq-v2");
  before = { ...reads };
  denyQQ = true;
  await page.reload();
  await page.getByText("QQ: Access denied", { exact: true }).waitFor();
  assert.equal(reads.qq, before.qq, "Denied version lookup never reads cached/chunk data");
  assert.equal(
    await page.locator(".reference-loading").isVisible(),
    true,
    "Denied cache is never rendered",
  );
  denyQQ = false;
  currentActor = actorB;
  await page.evaluate((actor) => localStorage.setItem("qa-actor", actor), actorB);
  before = { ...reads };
  await page.reload();
  await waitQQ();
  assert.equal(reads.qq, before.qq + 4, "Another account cannot reuse this user's cache");
  await waitCache("qq-v2");
  // Explicit logout clears the active account's cache and cancels any pending reads/writes.
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:5175/");
  for (let i = 0; i < 100 && (await cacheEntries()).some((x) => x.user === actorB); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    (await cacheEntries()).some((x) => x.user === actorB),
    false,
  );
  assert.equal(reads.writes, 0, "Loading never writes to the live or mocked database");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      boundedParallelism: true,
      orderedCompleteRecords: true,
      lazyTC: true,
      slidesWaitForCompleteBases: true,
      versionCheckedCache: true,
      newRevisionRefetched: true,
      corruptCacheRecovered: true,
      incompleteBaseRejected: true,
      deniedCacheNotDisplayed: true,
      accountIsolation: true,
      logoutClearsCache: true,
      losslessCache: true,
      tcFailureDoesNotBlockQQ: true,
      writes: reads.writes,
    }),
  );
} finally {
  releaseTC();
  await browser.close();
}
