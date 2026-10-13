// Differential checks against the reference using the real supplied files.
// Everything runs locally; no calls to production Supabase are permitted.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const [htmlPath, qqPath, tcPath, ...directoryFiles] = process.argv.slice(2);
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.route("https://*.supabase.co/**", (route) => route.abort());
  await page.route("**/native-math-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Local validation</body></html>",
    }),
  );
  await page.goto("http://127.0.0.1:5175/native-math-check");
  const file = (path) => ({
    data: fs.readFileSync(path).toString("base64"),
    name: path.split(/[\\/]/).at(-1),
  });
  const result = await page.evaluate(
    async ({ qq, tc, dirs }) => {
      const math = await import("/src/lib/quality-math.js"),
        parsers = await import("/src/lib/quality-import.ts");
      const directory = await import("/src/lib/quality-directory.ts");
      const toFile = ({ data, name }) =>
        new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name);
      const q = (await parsers.importQQ(toFile(qq), undefined)).snapshot,
        t = (await parsers.importTC(toFile(tc))).snapshot;
      const values = math.aggregate(t.records);
      math.applyStatus(values);
      const metric = (a) => ({
        login: a.loginText,
        revisit: a.revisit,
        tec1: a.tec1,
        prod: a.prod,
        os: a.os,
        status: a.status,
      });
      const parsed = (
        await Promise.all(dirs.map((x) => directory.readDirectoryWorkbook(toFile(x))))
      ).flat();
      const joined = directory.associateDirectory(parsed, []);
      return {
        q,
        t,
        qqStats: math.stat(q.records),
        tcStats: values.map(metric),
        joined: {
          entries: joined.entries.length,
          associated: joined.entries.filter((r) => r.city && r.sector && r.supervisor).length,
          unmatched: joined.entries.filter((r) => !r.supervisor).length,
          pendingNames: joined.unmatchedNames.length,
        },
      };
    },
    { qq: file(qqPath), tc: file(tcPath), dirs: directoryFiles.map(file) },
  );
  const reference = await browser.newPage();
  await reference.route("**/quality-reference", (route) =>
    route.fulfill({ body: fs.readFileSync(htmlPath, "utf8"), contentType: "text/html" }),
  );
  await reference.goto("http://127.0.0.1:5175/quality-reference");
  await reference.waitForFunction(
    () =>
      document.getElementById("frameQQ")?.contentWindow.qqDataReady &&
      document.getElementById("frameTC")?.contentWindow.eval("state.ready"),
    { timeout: 60000 },
  );
  const originalQQ = reference.frames()[1],
    originalTC = reference.frames()[2];
  const originalStats = await originalQQ.evaluate((records) => stat(records), result.q.records);
  const originalTCStats = await originalTC.evaluate((records) => {
    const values = aggregate(records);
    applyStatus(values);
    return values.map((a) => ({
      login: a.loginText,
      revisit: a.revisit,
      tec1: a.tec1,
      prod: a.prod,
      os: a.os,
      status: a.status,
    }));
  }, result.t.records);
  assert.deepEqual(result.qqStats, originalStats);
  assert.deepEqual(result.tcStats, originalTCStats);
  // Compare parser output as well, rather than only running both calculators on the same records.
  const originalQQRows = await originalQQ.evaluate(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return (await qqReadWorkbook(bytes.buffer)).map(toRec).filter(Boolean).map(qqNormalize409);
  }, file(qqPath));
  assert.deepEqual(result.q.records, originalQQRows);
  const originalTCRows = await originalTC.evaluate(async ({ data, name }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return parseCsvCompact(await decodeFile(new File([bytes], name)), name);
  }, file(tcPath));
  const dataOnly = (rows) => rows.map(({ name, company, mapped, mapSource, ...data }) => data);
  assert.deepEqual(dataOnly(result.t.records), dataOnly(originalTCRows));
  console.log(
    JSON.stringify({
      qqRecords: result.q.records.length,
      tcRecords: result.t.records.length,
      parsersMatch: true,
      calculationsMatch: true,
      evaluated: result.tcStats.length,
      certified: result.tcStats.filter((r) => r.status).length,
      directory: result.joined,
    }),
  );
} finally {
  await browser.close();
}
