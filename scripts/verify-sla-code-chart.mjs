// Browser regression for this card only. Synthetic fixtures; external traffic is blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const detailed = (contract, city, codes) => ({
  NM_INDICADOR_NEGOCIO_BI: "Sla Garantia Total",
  DT_NOTA: "01/10/2026",
  NR_CONTRATO: contract,
  NR_ORDEM_SERVICO: `OS-${contract}`,
  MUNICIPIO: city,
  UF: city === "Fortaleza" ? "CE" : city === "Recife" ? "PE" : "RN",
  NM_CLUSTER: city,
  NM_UNIDADE_NEGOCIO_TECNICO: "QA",
  DSC_TIPO_OS: "INSTALAÇÃO",
  CD_LOGIN_TECNICO: "QA",
  NM_TIPO_FECHAMENTO_SOLIC_BI: "EXECUTADA",
  DSC_QUALIFICADOR_OS: codes.length ? "SEM PADRAO" : "COM PADRAO",
  QTD_ATEND_PADRAO: Number(!codes.length),
  QT_LOG_VISITA: codes.length,
  LIST_NR_ORDEM_SERVICO_OFENSOR: codes.map((_, index) => `${contract}-${index}`).join(","),
  LIST_COD_BX_OS_OFENSOR: codes.join(","),
});
const rows = [
  detailed("QA1", "Natal", [39, 42, 99, 100, 106]),
  detailed("QA2", "Fortaleza", [100, 555]),
  detailed("QA3", "Natal", []),
  detailed("QA4", "Recife", [39]),
];
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
  await page.route("**/sla-code-chart-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0"><div id="host" style="height:100vh"></div></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:5175/sla-code-chart-check");
  await page.evaluate(async (rows) => {
    const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
    const { mountSla } = await import("/src/components/quality/sla-reference/sla-engine.js");
    const { slaStyle, slaMarkup } =
      await import("/src/components/quality/sla-reference/templates.ts");
    const { normalizeSlaRows } = await import("/src/lib/sla-math.js");
    const { slaPresentation } = await import("/src/components/quality/sla-presentation.ts");
    const { default: presentationStyle } =
      await import("/src/components/quality/sla-presentation.css?inline");
    const parent = {
      getSupervisorMap: () => ({}),
      refreshUnifiedMonth() {},
      setUnifiedMonths() {},
      setUnifiedDates() {},
      applyUnifiedDates() {},
      clearUnifiedDates() {},
      show() {},
    };
    const scope = referenceScope(
      document.getElementById("host"),
      `${slaStyle}\n${presentationStyle}`,
      slaMarkup,
      parent,
      true,
      async () => {
        throw Error("No imports allowed in QA");
      },
    );
    window.slaEngine = mountSla(scope.environment);
    window.slaPresentation = slaPresentation(scope);
    const normalized = normalizeSlaRows(rows);
    window.originalRows = structuredClone(normalized.records);
    window.slaEngine.loadProjectData({
      current: { source: "QA local", sourceType: "CSV", ...normalized },
    });
  }, rows);
  const root = page.locator("#host");
  const bars = () => root.locator("#codigoChart .bar-row");
  const readBars = () =>
    bars().evaluateAll((nodes) =>
      nodes.map((node) => ({
        code: node.querySelector(".name").textContent,
        value: node.querySelector(".value").textContent,
      })),
    );
  const expected = [
    { code: "100", value: "2 · 25,00%" },
    { code: "106", value: "1 · 12,50%" },
    { code: "555", value: "1 · 12,50%" },
  ];
  assert.equal(await root.locator("#codeTitle").textContent(), "Códigos de baixa · ofensores");
  assert.deepEqual(await readBars(), expected);
  assert.equal(await root.locator("#kLogs").innerText(), "8");
  assert.equal(await root.locator("#kTotal").innerText(), "4");
  assert.equal(await root.locator("#kSlaValue").innerText(), "8,33%");
  assert.match(await root.locator("#codeSourceNote").innerText(), /códigos ≥ 100/);
  await bars().first().click();
  assert.equal(await root.locator("#drillDialog").isVisible(), true);
  assert.equal(await root.locator("#drillBody tr").count(), 2);
  assert.match(await root.locator("#drillBody").innerText(), /39/);
  await root.locator("#drillClose").click();
  await root.locator("#fLocButton").click();
  await root.locator('#fLocOptions input[data-location="Recife"]').check();
  await root.locator("#fLocButton").click();
  assert.equal(await bars().count(), 0, "A low-code-only selection has no eligible bars");
  assert.equal(
    await root.locator("#kLogs").innerText(),
    "1",
    "Low-code logs still contribute to SLA",
  );
  assert.equal(await root.locator("#kTotal").innerText(), "1");
  assert.match(await root.locator("#codigoChart").innerText(), /Sem registros/);
  await root.locator("#clearFiltersBtn").click();
  assert.deepEqual(await readBars(), expected);
  await root.locator("#metricTasks").click();
  assert.deepEqual(await readBars(), expected);
  assert.equal(await root.locator("#kLogs").innerText(), "8");
  await root.locator("#metricAttendance").click();
  const state = await page.evaluate(() => ({
    rows: window.slaEngine.getProjectState().rows,
    original: window.originalRows,
  }));
  assert.deepEqual(
    state.rows,
    state.original,
    "The display rule never changes stored/imported rows",
  );
  const screenshots = [];
  for (const [width, presenting] of [
    [1440, false],
    [1366, true],
    [520, true],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((value) => window.slaPresentation.setPresenting(value), presenting);
    assert.deepEqual(await readBars(), expected);
    const path = join(tmpdir(), `sla-offender-codes-${width}.png`);
    await root.locator(".card.codes").screenshot({ path });
    screenshots.push(path);
  }
  await page.evaluate(async () => {
    const { normalizeSlaRows } = await import("/src/lib/sla-math.js");
    const normalized = normalizeSlaRows([
      {
        DAT_NOTA: "01/10/2026",
        DAT_BAIXA: "01/09/2026",
        NUM_CONTA: "QA-CONSOLIDATED",
        COD_OS: "QA-CONSOLIDATED",
        DSC_MUNICIPIO_BI: "Natal",
        DSC_SGL_ESTADO: "RN",
        DSC_CLUSTER_BI: "Natal",
        DSC_UNIDADE_NEGOCIO_UNIF: "QA",
        UN: "QA",
        DSC_TIPO_ORDEM_SERVICO: "INSTALAÇÃO",
        COD_LOGIN_TECNICO: "QA",
        DSC_QUALIFICADOR_OS: "SEM PADRAO",
        QTD_OS_ATEND_PADRAO: 0,
        QTD_LOG_OS_VT: 1,
        QTD_TAREFAS: 2,
        COD_BAIXA_OFENSOR: 39,
        COD_OFENSOR: "39 · CONSOLIDADO",
      },
    ]);
    window.slaEngine.loadProjectData({
      current: { source: "QA consolidated", sourceType: "Excel", ...normalized },
    });
  });
  assert.equal(
    await root.locator("#codeTitle").textContent(),
    "Ofensor selecionado · código de baixa",
  );
  assert.deepEqual(
    await readBars(),
    [{ code: "39 · CONSOLIDADO", value: "1 · 100,00%" }],
    "The other code chart is unchanged",
  );
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify({
      chartOnly: true,
      numericCodeThreshold: 100,
      unchangedSla: true,
      unchangedLogDenominator: true,
      preservedRawData: true,
      clickableBars: true,
      filterReset: true,
      emptyState: true,
      presentationAndNarrow: true,
      consolidatedChartUnchanged: true,
      externalRequests,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
