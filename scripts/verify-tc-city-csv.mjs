// Real source records, a representative test directory, isolated renderer and no remote writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsvCompact, decodeFile } from "../src/lib/quality-math.js";

const source = process.argv[2];
if (!source) throw Error("Informe o CSV analítico para a verificação local.");
const bytes = await readFile(source);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceHash = digest(bytes);
const mappedLogins = [
  "Z131558",
  "Z193218",
  "Z595403",
  "Z654270",
  "Z676784",
  "Z686999",
  "Z672212",
  "Z549113",
  "Z697766",
];
const pendingLogins = ["Z643732", "Z657057", "Z677329"];
const selected = new Set([...mappedLogins, ...pendingLogins]);
const records = parseCsvCompact(
  await decodeFile(new File([bytes], "analitico.csv")),
  "analitico.csv",
).filter((row) => selected.has(row.login));
assert.equal(new Set(records.map((row) => row.login)).size, 12);
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.routeWebSocket("**/*", (ws) => ws.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname === "/__tc-csv-qa")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="test-host" style="height:740px"></div>',
      });
    return route.continue();
  });
  await page.goto("http://127.0.0.1:5175/__tc-csv-qa");
  const result = await page.evaluate(
    async ({ records, mappedLogins }) => {
      const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
      const { tcMarkup, tcStyle } = await import("/src/components/quality/reference/templates.ts");
      const { mountTC } = await import("/src/components/quality/reference/tc-engine.js");
      const directory = new Set(mappedLogins);
      const registry = Object.fromEntries(
        mappedLogins.map((login) => [
          login,
          {
            name: `Cadastro de teste ${login}`,
            supervisor: "Equipe de teste",
          },
        ]),
      );
      const host = document.getElementById("test-host");
      const scope = referenceScope(
        host,
        tcStyle,
        tcMarkup,
        {
          getSupervisorMap: () => registry,
          refreshUnifiedMonth: () => {},
        },
        false,
        async () => {
          throw Error("Importação não permitida nesta verificação.");
        },
      );
      const engine = mountTC(scope.environment);
      engine.loadProjectData({
        rows: records.map((row) =>
          directory.has(row.login) ? { ...row, city: "NATAL/PARNAMIRIM" } : row,
        ),
      });
      const initial = engine
        .getProjectState()
        .result.map((row) => row.loginText)
        .sort();
      host.shadowRoot.querySelector('[data-city="Natal / Parnamirim"]').click();
      const filtered = engine
        .getProjectState()
        .result.map((row) => row.loginText)
        .sort();
      const unitAccepted = engine.setUnifiedUnits(["NTL-DMV", "PWM-DMV"]);
      return { initial, filtered, unitAccepted, units: engine.getUnifiedUnits().selected };
    },
    { records, mappedLogins },
  );
  assert.deepEqual(
    result.filtered,
    result.initial,
    "O botão de cidade perdeu técnicos cadastrados.",
  );
  assert.deepEqual(result.filtered, [...selected].sort());
  assert.equal(result.unitAccepted, true);
  assert.deepEqual(result.units, ["NTL-DMV", "PWM-DMV"]);
  assert.equal(digest(await readFile(source)), sourceHash, "O CSV original foi modificado.");
  await page.screenshot({ path: join(tmpdir(), "tc-real-csv-city-test.png") });
  console.log(
    JSON.stringify({
      sourceRecordsInSample: records.length,
      technicians: result.filtered.length,
      registeredCityIncluded: mappedLogins.length,
      pendingIncluded: pendingLogins.length,
      csvUnchanged: true,
      multipleUnits: true,
      remoteWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
