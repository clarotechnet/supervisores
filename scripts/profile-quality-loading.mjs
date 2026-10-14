// Read-only local benchmark. Provided HTML data is never sent to a remote endpoint.
// Usage: node scripts/profile-quality-loading.mjs "C:/path/reference.html"
import fs from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { extractQualityHtml, QUALITY_CHUNK_SIZE } from "../src/lib/quality.ts";
const source = process.argv[2];
if (!source) throw Error("Informe o HTML de referência como argumento.");
const seed = extractQualityHtml(fs.readFileSync(source, "utf8"));
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const actor = "00000000-0000-0000-0000-000000000001";
let tc = [],
  ready = false,
  delay = 0,
  start = 0,
  reads = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket("**/*", (ws) => ws.close());
  await page.addInitScript(
    ({ actor }) => {
      const now = Math.floor(Date.now() / 1000),
        user = {
          id: actor,
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
          JSON.stringify({
            sub: actor,
            aud: "authenticated",
            role: "authenticated",
            exp: now + 3600,
          }),
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
    { actor },
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    if (route.request().method() !== "GET") throw Error("Benchmark attempted a remote write");
    const table = url.pathname.split("/").at(-1),
      begun = performance.now() - start;
    let body = [];
    if (table === "profiles")
      body = {
        id: actor,
        role: "admin",
        status: "active",
        full_name: "QA local",
        email: "qa@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_imports") {
      const kind = url.searchParams.get("kind")?.slice(3),
        rows = kind === "quebra" ? seed.quebra.records : tc;
      body = !ready
        ? null
        : {
            id: kind,
            kind,
            source_file: "reference-benchmark",
            imported_by: actor,
            created_at: "2026-10-13T00:00:00Z",
            published_at: "2026-10-13T00:00:00Z",
            row_count: rows.length,
            chunk_count: Math.ceil(rows.length / QUALITY_CHUNK_SIZE),
            metadata: kind === "quebra" ? { names: seed.quebra.names } : seed.certificationMetadata,
            base_import_id: null,
          };
    }
    if (table === "quality_quebra_data" || table === "quality_certification_data") {
      const rows = table === "quality_quebra_data" ? seed.quebra.records : tc,
        ranges = url.searchParams.getAll("chunk_index");
      const lo = Number(ranges.find((x) => x.startsWith("gte."))?.slice(4) || 0),
        hi = Number(ranges.find((x) => x.startsWith("lt."))?.slice(3) || 8);
      body = Array.from(
        { length: Math.max(0, Math.min(hi, Math.ceil(rows.length / QUALITY_CHUNK_SIZE)) - lo) },
        (_, n) => ({
          chunk_index: lo + n,
          records: rows.slice((lo + n) * QUALITY_CHUNK_SIZE, (lo + n + 1) * QUALITY_CHUNK_SIZE),
        }),
      );
    }
    if (table === "quality_supervisor_registry") body = { registry: seed.registry };
    const json = JSON.stringify(body);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ status: 200, contentType: "application/json", body: json });
    if (ready && table.startsWith("quality_"))
      reads.push({
        table,
        begun,
        finished: performance.now() - start,
        bytes: Buffer.byteLength(json),
      });
  });
  await page.goto("http://127.0.0.1:5175/qualidade");
  await page.locator("#referenceQQ #msg").waitFor({ state: "attached" });
  tc = await page.evaluate(
    async ({ csv, metadata }) => {
      const { parseTC } = await import("/src/lib/quality-import.ts");
      return parseTC(csv, "reference-benchmark.csv", metadata);
    },
    { csv: seed.certificationCsv, metadata: seed.certificationMetadata },
  );
  ready = true;
  console.log(
    JSON.stringify({
      source: "provided reference HTML; mock server only",
      qqRows: seed.quebra.records.length,
      tcRows: tc.length,
    }),
  );
  const painted = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const waitQQ = () =>
    page.waitForFunction(
      (count) =>
        document
          .getElementById("referenceQQ")
          ?.shadowRoot?.getElementById("msg")
          ?.textContent.includes(count + " registros") &&
        !document.querySelector(".reference-loading"),
      seed.quebra.records.length.toLocaleString("pt-BR"),
      { timeout: 120000 },
    );
  const waitTC = () =>
    page.waitForFunction(
      (count) =>
        document
          .getElementById("referenceTC")
          ?.shadowRoot?.getElementById("fileMeta")
          ?.textContent.includes(count + " registros") &&
        !document.querySelector(".reference-loading"),
      tc.length.toLocaleString("pt-BR"),
      { timeout: 120000 },
    );
  const waitCache = async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const complete = await page.evaluate(async () => {
        const db = await new Promise((resolve) => {
          const request = indexedDB.open("technet-quality-cache-v1", 1);
          request.onsuccess = () => resolve(request.result);
        });
        try {
          return await new Promise((resolve) => {
            const r = db.transaction("datasets").objectStore("datasets").count();
            r.onsuccess = () => resolve(r.result === 2);
          });
        } finally {
          db.close();
        }
      });
      if (complete) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error("Timed out waiting for compressed cache writes");
  };
  for (const mode of ["cold-0ms", "cold-200ms", "cached-200ms"]) {
    if (mode !== "cached-200ms")
      await page.evaluate(async (actor) => {
        const { clearQualityCache } = await import("/src/lib/quality-cache.ts");
        await clearQualityCache(actor);
      }, actor);
    else {
      await waitCache();
    }
    delay = mode === "cold-0ms" ? 0 : 200;
    reads = [];
    start = performance.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitQQ();
    await painted();
    const qqReadyMs = Math.round(performance.now() - start),
      initialTCRequests = reads.filter((x) => x.table === "quality_certification_data").length;
    await page.locator("#goTC").click();
    await waitTC();
    await painted();
    const summarize = (table) => {
      const calls = reads.filter((x) => x.table === table);
      return {
        requests: calls.length,
        lastResponseMs: Math.round(calls.at(-1)?.finished || 0),
        MiB: Number((calls.reduce((sum, x) => sum + x.bytes, 0) / 1048576).toFixed(2)),
      };
    };
    console.log(
      JSON.stringify({
        mode,
        qqReadyMs,
        bothPanelsReadyMs: Math.round(performance.now() - start),
        initialTCRequests,
        qualityRequests: reads.length,
        qq: summarize("quality_quebra_data"),
        tc: summarize("quality_certification_data"),
      }),
    );
    if (mode !== "cached-200ms") await waitCache();
  }
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
