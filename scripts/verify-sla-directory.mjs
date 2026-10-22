// Synthetic rendering QA. No real credentials, Sheets data or database requests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const raw = (id, login, changes = {}) => ({
  DAT_NOTA: "01/10/2026",
  DAT_BAIXA: "01/09/2026",
  NUM_CONTA: id,
  COD_OS: id,
  DSC_MUNICIPIO_BI: "Natal",
  DSC_SGL_ESTADO: "RN",
  DSC_CLUSTER_BI: "Natal",
  DSC_UNIDADE_NEGOCIO_UNIF: "QA",
  UN: "QA",
  DSC_TIPO_ORDEM_SERVICO: "INSTALAÇÃO",
  COD_LOGIN_TECNICO: login,
  DSC_QUALIFICADOR_OS: "COM PADRAO",
  QTD_OS_ATEND_PADRAO: 1,
  QTD_LOG_OS_VT: 0,
  QTD_TAREFAS: 1,
  ...changes,
});
const records = [
  raw("QA1", "Z1, Z2", {
    DSC_QUALIFICADOR_OS: "SEM PADRAO",
    QTD_OS_ATEND_PADRAO: 0,
    QTD_LOG_OS_VT: 1,
    QTD_TAREFAS: 3,
  }),
  raw("QA2", "Z3", { QTD_TAREFAS: 2 }),
  raw("QA3", "Z1"),
  raw("QA4", "Z1", { DAT_BAIXA: "21/09/2026" }),
];
const registry = {
  Z1: { name: "JOÃO DA CONCEIÇÃO EXEMPLO COM NOME COMPLETO", supervisor: "MARIA SUPERVISORA" },
  Z2: { name: "ANA TÉCNICA", supervisor: "PEDRO SUPERVISOR" },
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let externalRequests = 0;
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
    externalRequests++;
    return route.abort();
  });
  await page.route("**/sla-directory-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0"><div id="host" style="height:100vh"></div></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:5175/sla-directory-check");
  await page.evaluate(async (records) => {
    const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
    const { mountSla } = await import("/src/components/quality/sla-reference/sla-engine.js");
    const { slaMarkup, slaStyle } =
      await import("/src/components/quality/sla-reference/templates.ts");
    const { normalizeSlaRows } = await import("/src/lib/sla-math.js");
    const { slaPresentation } = await import("/src/components/quality/sla-presentation.ts");
    const { default: presentationStyle } =
      await import("/src/components/quality/sla-presentation.css?inline");
    const { default: directoryStyle } =
      await import("/src/components/quality/sla-directory.css?inline");
    window.registry = {};
    const parent = {
      getSupervisorMap: () => window.registry,
      refreshUnifiedMonth() {},
      setUnifiedMonths() {},
      setUnifiedDates() {},
      applyUnifiedDates() {},
      clearUnifiedDates() {},
      show() {},
    };
    const scope = referenceScope(
      document.getElementById("host"),
      `${slaStyle}\n${presentationStyle}\n${directoryStyle}`,
      slaMarkup,
      parent,
      true,
      async () => {
        throw Error("No imports allowed in QA");
      },
    );
    window.engine = mountSla(scope.environment);
    window.presentation = slaPresentation(scope);
    const normalized = normalizeSlaRows(records);
    window.originalRecords = structuredClone(normalized.records);
    window.engine.loadProjectData({
      current: { source: "QA", sourceType: "Excel", ...normalized },
    });
  }, records);
  const root = page.locator("#host");
  const snapshot = () => page.evaluate(() => window.engine.getProjectState());
  const before = await snapshot();
  assert.equal(before.metrics.total, 3);
  assert.equal(before.metrics.logs, 1);
  assert.equal(before.metrics.sla, 50);
  const exported = async () => {
    const ready = page.waitForEvent("download");
    await root.locator("#exportBtn").click();
    return readFileSync(await (await ready).path(), "utf8");
  };
  const originalCsv = await exported();
  await root.locator("#fMonth").selectOption("2026/10");
  await root.locator("#detailSearch").fill("MARIA SUPERVISORA");
  assert.match(await root.locator("#detailBody").innerText(), /Sem registros/);
  await page.evaluate((registry) => {
    window.registry = registry;
    window.engine.refreshSupervisorRegistry();
  }, registry);
  const after = await snapshot();
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.groups, before.groups);
  assert.deepEqual(after.metrics, before.metrics);
  assert.equal(await root.locator("#fMonth").inputValue(), "2026/10");
  assert.equal(await root.locator("#detailSearch").inputValue(), "MARIA SUPERVISORA");
  assert.equal(await root.locator("#detailBody tr").count(), 2);
  await root.locator("#detailSearch").fill("");
  assert.equal(
    await exported(),
    originalCsv,
    "Identity labels must not change the original analytic export",
  );
  assert.match(
    await root.locator("#techBody").innerText(),
    /JOÃO DA CONCEIÇÃO EXEMPLO COM NOME COMPLETO/,
  );
  assert.match(await root.locator("#techBody").innerText(), /MARIA SUPERVISORA/);
  assert.equal(await root.locator("#techBody tr").count(), 3);
  assert.equal(
    await root.locator('#techBody .sla-technician[data-login="Z3"]').count(),
    0,
    "Unknown login must not inherit another technician's name",
  );
  const shared = root.locator("#detailBody tr").filter({ hasText: "QA1" });
  assert.equal(await shared.locator(".sla-technician").count(), 2);
  assert.match(await shared.innerText(), /ANA TÉCNICA/);
  assert.match(await shared.innerText(), /PEDRO SUPERVISOR/);
  const point = root
    .locator('#techChart g[role="button"]')
    .filter({ has: page.locator("title").filter({ hasText: "JOÃO" }) })
    .first();
  await point.focus();
  assert.match(await point.getAttribute("aria-label"), /Z1.*MARIA SUPERVISORA/);
  await page.keyboard.press("Enter");
  assert.equal(await root.locator("#drillDialog").isVisible(), true);
  await page.evaluate(() => {
    window.registry = {
      ...window.registry,
      Z1: { name: "JOÃO ATUALIZADO", supervisor: "NOVA SUPERVISORA" },
    };
    window.engine.refreshSupervisorRegistry();
  });
  assert.match(await root.locator("#drillBody").innerText(), /JOÃO ATUALIZADO/);
  assert.match(await root.locator("#drillBody").innerText(), /NOVA SUPERVISORA/);
  await root.locator("#drillClose").click();
  await root.locator("#metricTasks").click();
  const weighted = await snapshot();
  assert.equal(weighted.metrics.total, 6);
  assert.equal(weighted.metrics.logs, 3);
  assert.equal(weighted.metrics.sla, 100 / 3);
  await root.locator("#metricAttendance").click();
  await root.locator("#indicatorRegular").click();
  assert.equal((await snapshot()).metrics.sla, 100);
  assert.match(await root.locator("#techBody").innerText(), /JOÃO ATUALIZADO/);
  await root.locator("#indicatorTotal").click();
  await page.evaluate(() => {
    const body = document.getElementById("host").shadowRoot;
    body.getElementById("techBody").closest("article").setAttribute("data-qa", "summary");
  });
  const screenshots = [];
  for (const width of [1440, 520]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.presentation.setPresenting(true));
    for (const [selector, suffix] of [
      [".card.tech", "chart"],
      ['[data-qa="summary"]', "summary"],
    ]) {
      const path = join(tmpdir(), `sla-directory-${width}-${suffix}.png`);
      await root.locator(selector).screenshot({ path });
      screenshots.push(path);
    }
  }
  const dense = Array.from({ length: 25 }, (_, index) =>
    raw(`DENSE-${index}`, index ? `Z${index + 100}` : "WWWWWWWWWWWWWWWWWWWW"),
  );
  await page.evaluate(async (dense) => {
    const { normalizeSlaRows } = await import("/src/lib/sla-math.js");
    window.registry = Object.fromEntries(
      dense.map((row) => [
        row.COD_LOGIN_TECNICO,
        { name: "WWWWWWWWWWWWWWWWWWWWWWWWWWWW", supervisor: "SUPERVISOR QA" },
      ]),
    );
    window.engine.loadProjectData({
      current: { source: "Dense QA", sourceType: "Excel", ...normalizeSlaRows(dense) },
    });
  }, dense);
  const outside = await root.locator("#techChart svg").evaluate((svg) => {
    const bounds = svg.getBoundingClientRect();
    return [...svg.querySelectorAll("text")]
      .filter((text) => {
        const r = text.getBoundingClientRect();
        return (
          r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1
        );
      })
      .map((text) => text.textContent);
  });
  assert.deepEqual(outside, [], "Name/login labels must stay inside the SVG");
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify({
      lateDirectory: true,
      liveUpdates: true,
      multipleTechnicians: true,
      unknownLoginSafe: true,
      originalKeysAndMetrics: true,
      originalExportBytes: true,
      attendanceAndTasks: true,
      thirtyAndTenDays: true,
      keyboardDrilldown: true,
      narrowAndPresentation: true,
      dense25NoClipping: true,
      externalRequests,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
