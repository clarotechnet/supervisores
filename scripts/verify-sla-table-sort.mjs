// Synthetic, local-only interaction QA. No database reads, imports or writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const registry = {
  Z1: { name: "ZÉLIA EXEMPLO", supervisor: "PEDRO" },
  Z2: { name: "ÁLVARO EXEMPLO", supervisor: "MARIA" },
  Z3: { name: "BRUNO EXEMPLO", supervisor: "MARIA" },
};
const records = Array.from({ length: 93 }, (_, index) => ({
  DAT_NOTA: `${String((index % 28) + 1).padStart(2, "0")}/${index % 3 === 0 ? "09" : "10"}/2026`,
  DAT_BAIXA: new Date(
    Date.UTC(2026, index % 3 === 0 ? 8 : 9, (index % 28) + 1 - 30),
  ).toLocaleDateString("pt-BR", { timeZone: "UTC" }),
  NUM_CONTA: `C${index + 1}`,
  COD_OS: `OS${index + 1}`,
  DSC_MUNICIPIO_BI: index % 2 ? "Natal" : "Fortaleza",
  DSC_SGL_ESTADO: index % 2 ? "RN" : "CE",
  DSC_CLUSTER_BI: index % 2 ? "Natal" : "Fortaleza",
  DSC_UNIDADE_NEGOCIO_UNIF: index % 5 ? "QA1" : "QA2",
  UN: index % 5 ? "QA1" : "QA2",
  DSC_TIPO_ORDEM_SERVICO: ["INSTALAÇÃO", "MIGRAÇÃO", "ASSINATURA", "WIFI MESH"][index % 4],
  COD_LOGIN_TECNICO: `Z${(index % 7) + 1}`,
  DSC_QUALIFICADOR_OS: index % 3 ? "COM PADRAO" : "SEM PADRAO",
  QTD_OS_ATEND_PADRAO: index % 3 ? 1 : 0,
  QTD_LOG_OS_VT: index % 3 ? 0 : (index % 4) + 1,
  QTD_TAREFAS: ((index * 17) % 99) + 1,
}));
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
  await page.route("**/sla-sort-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0"><div id="host" style="height:100vh"></div></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:5175/sla-sort-check");
  await page.evaluate(
    async ({ records, registry }) => {
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
      const { default: sortingStyle } =
        await import("/src/components/quality/sla-table-sort.css?inline");
      window.registry = registry;
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
        `${slaStyle}\n${presentationStyle}\n${directoryStyle}\n${sortingStyle}`,
        slaMarkup,
        parent,
        true,
        async () => {
          throw Error("No imports in QA");
        },
      );
      window.engine = mountSla(scope.environment);
      window.presentation = slaPresentation(scope);
      window.engine.loadProjectData({
        current: { source: "QA", sourceType: "Excel", ...normalizeSlaRows(records) },
      });
    },
    { records, registry },
  );
  const root = page.locator("#host");
  await root.locator("#clearFiltersBtn").click();
  const state = () => page.evaluate(() => window.engine.getProjectState());
  const baseline = await state();
  assert.equal(baseline.groups.length, 93);
  const charts = await root
    .locator("svg")
    .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
  const footer = await root.locator("#serviceFoot").innerText();
  const header = (table, column) =>
    root.locator(`button[data-sla-sort="${table}"][data-column="${column}"]`);
  assert.equal(await root.locator(".sla-sort-header").count(), 23);
  const readCells = (table, column) =>
    root
      .locator(`#${table} tr`)
      .evaluateAll((rows, column) => rows.map((row) => row.children[column].innerText), column);
  const numeric = (value) => Number(value.replace(/\./g, "").replace(",", ".").replace("%", ""));
  const checkMonotonic = (values, type, direction) => {
    const keys = values.map((value) => (type === "number" ? numeric(value) : value));
    for (let i = 1; i < keys.length; i++) {
      const order =
        type === "number" ? keys[i - 1] - keys[i] : collator.compare(keys[i - 1], keys[i]);
      assert.ok(
        direction === "ascending" ? order <= 0 : order >= 0,
        `${type} ${direction}: ${keys[i - 1]} -> ${keys[i]}`,
      );
    }
  };
  for (const [table, types] of [
    ["serviceBody", ["text", "number", "number", "number", "number", "number", "number"]],
    ["techBody", ["text", "number", "number", "number", "number", "number"]],
  ]) {
    const originalRows = await root.locator(`#${table} tr`).allInnerTexts();
    for (const [index, type] of types.entries()) {
      for (let click = 0; click < 2; click++) {
        await header(table, index).click();
        const direction =
          type === "text"
            ? click
              ? "descending"
              : "ascending"
            : click
              ? "ascending"
              : "descending";
        assert.equal(
          await header(table, index).evaluate((button) =>
            button.parentElement.getAttribute("aria-sort"),
          ),
          direction,
        );
        checkMonotonic(await readCells(table, index), type, direction);
        assert.deepEqual(
          (await root.locator(`#${table} tr`).allInnerTexts()).sort(),
          [...originalRows].sort(),
        );
      }
    }
  }
  const name = (login) =>
    registry[login]
      ? `${registry[login].name} (${login}) · Supervisor: ${registry[login].supervisor}`
      : login;
  const detailColumns = [
    (row) => {
      const [d, m, y] = row.reportDate.split("/");
      return `${y}-${m}-${d}`;
    },
    (row) => row.contract,
    (row) => row.city,
    (row) => name(row.tech),
    (row) => row.businessUnit,
    (row) => row.os,
    (row) => row.taskCount,
    (row) => row.logs,
    (row) => (row.revisit ? "SEM PADRÃO" : "COM PADRÃO"),
    (row) => row.typeOS,
  ];
  const expectedDetails = (groups, column, direction) =>
    [...groups].sort((a, b) => {
      const x = detailColumns[column](a),
        y = detailColumns[column](b);
      const order = typeof x === "number" ? x - y : collator.compare(x, y);
      return direction === "ascending" ? order : -order;
    });
  const checkPage = async (groups, column, direction, offset = 0) => {
    const expected = expectedDetails(groups, column, direction)
      .slice(offset, offset + 40)
      .map((row) => row.contract);
    assert.deepEqual(await readCells("detailBody", 1), expected);
  };
  for (const column of detailColumns.keys()) {
    for (let click = 0; click < 2; click++) {
      await header("detailBody", column).click();
      const direction =
        column === 0 || column === 6 || column === 7
          ? click
            ? "ascending"
            : "descending"
          : click
            ? "descending"
            : "ascending";
      await checkPage(baseline.groups, column, direction);
      await root.locator("#nextBtn").click();
      await checkPage(baseline.groups, column, direction, 40);
    }
  }
  assert.deepEqual(
    await state(),
    baseline,
    "Sort must not alter data, grouping or KPI calculations",
  );
  assert.deepEqual(
    await root.locator("svg").evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
    charts,
  );
  assert.equal(await root.locator("#serviceFoot").innerText(), footer);
  assert.equal(
    await header("serviceBody", 6).evaluate((button) =>
      button.parentElement.getAttribute("aria-sort"),
    ),
    "ascending",
  );
  assert.equal(
    await header("techBody", 5).evaluate((button) =>
      button.parentElement.getAttribute("aria-sort"),
    ),
    "ascending",
  );
  // A new selection starts on page 1 and applies to all matching records.
  await header("detailBody", 6).click();
  await checkPage(baseline.groups, 6, "descending");
  assert.match(await root.locator("#pageInfo").innerText(), /Página 1 de 3/);
  await root.locator("#detailSearch").fill("Natal");
  await checkPage(
    baseline.groups.filter((row) => row.city === "Natal"),
    6,
    "descending",
  );
  await root.locator("#detailSearch").fill("");
  await root.locator("#fBU").selectOption("QA1");
  await checkPage((await state()).groups, 6, "descending");
  await root.locator("#clearFiltersBtn").click();
  await checkPage(baseline.groups, 6, "descending");
  // Dynamic heading is re-created by the original engine after filter changes.
  assert.match(await root.locator("#detailsOSHeader").innerText(), /OS registrada/);
  assert.equal(await root.locator("#detailsOSHeader .sla-sort-header").count(), 1);
  await header("detailBody", 6).focus();
  await page.keyboard.press("Enter");
  await checkPage(baseline.groups, 6, "ascending");
  await page.keyboard.press("Space");
  await checkPage(baseline.groups, 6, "descending");
  await root.locator("#detailBody tr").first().locator("td").nth(1).getByRole("button").click();
  assert.equal(await root.locator("#drillDialog").isVisible(), true);
  await root.locator("#drillClose").click();
  await root.locator("#serviceBody tr").first().locator("td").last().getByRole("button").click();
  assert.equal(await root.locator("#drillDialog").isVisible(), true);
  await root.locator("#drillClose").click();
  // Empty searches do not remove sortable headers or invent any rows.
  await root.locator("#detailSearch").fill("NO-SUCH-TECHNICIAN");
  await header("detailBody", 7).click();
  assert.match(await root.locator("#detailBody").innerText(), /Sem registros/);
  await root.locator("#detailSearch").fill("");
  // A late registry update reorders the name view but leaves all original keys intact.
  await header("techBody", 0).click();
  await page.evaluate(() => {
    window.registry.Z1 = { name: "AAAA ATUALIZADO", supervisor: "PEDRO" };
    window.engine.refreshSupervisorRegistry();
  });
  assert.match((await readCells("techBody", 0))[0], /AAAA ATUALIZADO/);
  assert.deepEqual(await state(), baseline);
  const screenshots = [];
  for (const width of [1440, 520]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const table of ["serviceBody", "techBody", "detailBody"]) {
      const container = root.locator(`#${table}`).locator("..").locator("..");
      await container.scrollIntoViewIfNeeded();
      const file = join(tmpdir(), `sla-sort-${width}-${table}.png`);
      await container.screenshot({ path: file });
      screenshots.push(file);
      const metrics = await container.evaluate((element) => ({
        right: element.getBoundingClientRect().right,
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      assert.ok(metrics.right <= width + 2, "Wide tables must scroll inside their panel");
    }
  }
  await page.evaluate(() => window.presentation.setPresenting(true));
  assert.equal(await header("detailBody", 0).isVisible(), true);
  await header("detailBody", 0).click();
  assert.deepEqual(await state(), baseline);
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify({
      passed: true,
      sortableHeaders: 23,
      independentTables: 3,
      allPagesSorted: true,
      calculationsAndChartsUnchanged: true,
      keyboardAndDrilldowns: true,
      filtersAndLiveRegistry: true,
      externalRequests,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
