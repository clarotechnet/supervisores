// Synthetic regression for competence filtering. No production/network data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const row = (wo, month, day, noteAt, points = "180", login = "Z1") => ({
  login,
  name: login === "Z1" ? "Técnico A" : "Técnico B",
  company: "FTZ-DMV_01",
  baseUnit: "FTZ-DMV_01",
  mapSource: "base",
  qr: "0",
  tnum: "95",
  tden: "100",
  points,
  day,
  month,
  year: 2026,
  city: "Fortaleza",
  sub: "Fortaleza",
  group: "Instalação",
  type: "1",
  uf: "CE",
  wo,
  finish: `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)} 08:00:00`,
  contract: wo,
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  noteAt,
});
const records = [
  row("SET-1", 9, "2026-09-20", "30/09/2026", "120"),
  row("OUT-1", 10, "2026-09-21", "01/10/2026"),
  row("OUT-2", 10, "2026-10-20", "30/10/2026"),
  row("OUT-B", 10, "2026-10-19", "29/10/2026", "150", "Z2"),
  { ...row("NOV-1", 11, "2026-10-22", "01/11/2026", "10"), qr: "1", tnum: "1", tden: "10" },
  row("NOV-2", 11, "2026-10-25", "04/11/2026", "10"),
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const screenshots = [],
  errors = [];
let externalRequests = 0;
try {
  for (const technicalVisit of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    page.on("pageerror", (error) => errors.push(error.stack));
    await page.routeWebSocket("**/*", (socket) => socket.close());
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
      externalRequests++;
      return route.abort();
    });
    await page.route("**/tc-month-check", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body style="margin:0"><div id="host" style="height:100vh;container-type:size;container-name:quality-frame"></div></body></html>',
      }),
    );
    await page.goto("http://127.0.0.1:5175/tc-month-check");
    await page.evaluate(
      async ({ technicalVisit, records }) => {
        const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
        const { mountTC } = await import("/src/components/quality/reference/tc-engine.js");
        const { tcStyle, tcMarkup } =
          await import("/src/components/quality/reference/templates.ts");
        const { default: presentationCss } =
          await import("/src/components/quality/reference/tc-presentation.css?inline");
        const parent = {
          getSupervisorMap: () => ({
            Z1: { name: "Técnico A", supervisor: "Equipe A" },
            Z2: { name: "Técnico B", supervisor: "Equipe B" },
          }),
          refreshUnifiedMonth() {},
          setUnifiedMonths() {},
          setUnifiedDates() {},
          applyUnifiedDates() {},
          clearUnifiedDates() {},
          show() {},
        };
        const scope = referenceScope(
          document.getElementById("host"),
          `${tcStyle}\n${presentationCss}`,
          tcMarkup,
          parent,
          true,
          async () => {
            throw Error("No imports in QA");
          },
        );
        scope.environment.technicalVisit = technicalVisit;
        window.engine = mountTC(scope.environment);
        window.fixtureRows = records;
        window.engine.loadProjectData({ rows: records.filter((row) => row.month === 10) });
        window.engine.setUnifiedMonths(["2026-10"]);
        // A later upload adds November; the previous October selection must survive.
        window.engine.loadProjectData({ rows: records });
      },
      { technicalVisit, records },
    );
    const root = page.locator("#host");
    const state = () => page.evaluate(() => window.engine.getProjectState());
    const snapshotRows = (await state()).rows;
    const referenceMonth = async (month) => {
      assert.equal(await root.locator("#tcResults").getAttribute("data-current-month"), month);
      const label = month === "2026-10" ? "Outubro / 2026" : "Novembro / 2026";
      for (const selector of [
        ".tc-volume-head small",
        ".tc-status-head small:first-of-type",
        ".tc-projection-head small",
      ]) {
        assert.ok((await root.locator(`#tcResults ${selector}`).textContent()).includes(label));
      }
      assert.ok(
        (await root.locator("#tcProjectionToolbar").textContent()).includes(`Projeção · ${label}`),
      );
      assert.ok((await root.locator("#tcCurrentReferenceNote").textContent()).includes(label));
    };
    await referenceMonth("2026-10");
    assert.deepEqual(await page.evaluate(() => window.engine.getUnifiedMonths().selected), [
      "2026-10",
    ]);
    assert.match(await root.locator("#tcProjectionToolbar").textContent(), /21\/10\/2026/);
    assert.match(await root.locator("#tcProjectionToolbar").textContent(), /base até 20\/10\/2026/);
    assert.match(
      await root.locator("#tcProjectionToolbar").textContent(),
      /1 dias de trabalho previstos/,
    );
    const technician = root.locator('#tbody tr:has([data-tc-current-login="Z1"])');
    assert.equal(await technician.locator(".tc-fixed-volume b").innerText(), "2");
    assert.equal(
      await technician.locator(".tc-fixed-status").getAttribute("data-current-state"),
      "certified",
    );
    assert.equal(
      await root
        .locator('#tbody tr:has([data-tc-current-login="Z2"]) .tc-fixed-status')
        .getAttribute("data-current-state"),
      technicalVisit ? "offender" : "certified",
    );
    assert.equal(await root.locator("#kCert").innerText(), technicalVisit ? "1" : "2");
    assert.equal(await root.locator("#kEval").innerText(), "2");
    assert.ok(
      (await root.locator('#tcHead [data-sort="prod"]').textContent()).includes(
        technicalVisit ? "175" : "127",
      ),
    );
    const octoberMetrics = (await state()).result;
    assert.equal(octoberMetrics.find((person) => person.loginText === "Z1").prod, 180);
    assert.equal(
      await page.evaluate(
        () =>
          window.engine.getProjectState().result.find((person) => person.loginText === "Z1").days
            .size,
      ),
      2,
    );
    await root.locator('[data-tc-current-login="Z1"]').click();
    await root.locator("#modal.show").waitFor();
    assert.match(await root.locator("#modalBody").innerText(), /21\/09\/2026/);
    assert.match(await root.locator("#modalBody").innerText(), /20\/10\/2026/);
    assert.doesNotMatch(await root.locator("#modalBody").innerText(), /22\/10\/2026|25\/10\/2026/);
    await root.locator("#modalClose").click();
    // Work-date filters intersect the DATA_NOTA competence; they never replace it.
    await page.evaluate(() =>
      window.engine.setUnifiedDates({ start: "2026-09-21", end: "2026-10-21" }),
    );
    await referenceMonth("2026-10");
    assert.equal((await state()).result.find((person) => person.loginText === "Z1").os, 2);
    await page.evaluate(() =>
      window.engine.setUnifiedDates({ start: "2026-10-22", end: "2026-10-25" }),
    );
    await referenceMonth("2026-10");
    assert.equal((await state()).result.length, 0);
    assert.equal(await root.locator("#tbody tr").count(), 0);
    await page.evaluate(() => window.engine.setUnifiedDates({ start: "", end: "" }));
    // Planning stays saved per competence, rather than leaking November's end date.
    await root.locator("#tcProjectionPlanner summary").click();
    await root.locator("#tcProjectionEnd").fill("2026-10-22");
    await root.locator("#tcProjectionEnd").dispatchEvent("change");
    assert.match(
      await root.locator("#tcProjectionToolbar").textContent(),
      /fechamento 22\/10\/2026/,
    );
    await page.evaluate(() => window.engine.setUnifiedMonths(["2026-11"]));
    await referenceMonth("2026-11");
    assert.equal(
      await root
        .locator('#tbody tr:has([data-tc-current-login="Z1"]) .tc-fixed-volume b')
        .innerText(),
      "2",
    );
    assert.equal(
      await root
        .locator('#tbody tr:has([data-tc-current-login="Z1"]) .tc-fixed-status')
        .getAttribute("data-current-state"),
      "offender",
    );
    assert.match(await root.locator("#tcProjectionToolbar").textContent(), /20\/11\/2026/);
    await page.evaluate(() => window.engine.setUnifiedMonths(["2026-09", "2026-10"]));
    await referenceMonth("2026-10");
    assert.match(
      await root.locator("#tcProjectionToolbar").textContent(),
      /fechamento 22\/10\/2026/,
    );
    await page.evaluate(() => window.engine.setUnifiedMonths([]));
    await referenceMonth("2026-11");
    if (await root.locator("#tcProjectionPlanner").evaluate((element) => element.open))
      await root.locator("#tcProjectionPlanner summary").click();
    await page.evaluate(() => {
      window.engine.setUnifiedMonths(["2026-10"]);
      window.engine.setUnifiedSupervisors(["Equipe A"]);
      window.engine.setUnifiedPresentation(true);
    });
    await referenceMonth("2026-10");
    assert.equal((await state()).result.length, 1);
    await root.locator("#tcProjectionPlanner").evaluate((element) => {
      element.open = false;
      element.dispatchEvent(new Event("toggle"));
    });
    const file = join(tmpdir(), `tc-reference-month-${technicalVisit ? "vt" : "qq"}.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    screenshots.push(file);
    await page.evaluate(() => {
      window.slideSnapshot = window.engine.technetSlides.begin();
      window.engine.technetSlides.show({ panel: "tc", city: "Fortaleza", supervisor: "Equipe A" });
    });
    await referenceMonth("2026-10");
    assert.equal(
      await root
        .locator('#tbody tr:has([data-tc-current-login="Z1"]) .tc-fixed-volume b')
        .innerText(),
      "2",
    );
    await page.evaluate(() => {
      window.engine.technetSlides.restore(window.slideSnapshot);
      window.engine.setUnifiedPresentation(false);
      window.engine.setUnifiedSupervisors([]);
    });
    assert.deepEqual((await state()).rows, snapshotRows);
    assert.deepEqual((await state()).result, octoberMetrics);
    await referenceMonth("2026-10");
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify({
      selectedCompetenceRespected: true,
      novemberImportDoesNotChangeOctober: true,
      originalDataNotaLagAndWorkDays: true,
      noFallbackOnEmptyFilter: true,
      multiMonthAndAll: true,
      monthlyPlanning: true,
      sameAggregationsAndRules: true,
      qq127AndVT175: true,
      presentationAndSlides: true,
      productionWrites: 0,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
