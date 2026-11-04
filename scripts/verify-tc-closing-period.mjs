// Real renderer, synthetic rows, all external network calls blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const br = (day) => day.split("-").reverse().join("/");
const row = (wo, day, month, noteAt, points) => ({
  login: "Z1",
  name: "Técnico A",
  company: "JCR-DMV",
  baseUnit: "JCR-DMV",
  mapSource: "base",
  qr: "0",
  tnum: "1",
  tden: "1",
  points: String(points),
  day,
  month,
  year: 2026,
  city: "Recife",
  sub: "Recife",
  group: "Instalação",
  type: "1",
  uf: "PE",
  wo,
  finish: `${br(day)} ${wo === "FIM" ? "23:59:59" : "00:00:00"}`,
  contract: wo,
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  noteAt,
});
const records = [
  row("ANTES", "2026-10-21", 10, "30/10/2026", 500),
  row("INICIO", "2026-10-22", 10, "31/10/2026", 150),
  row("MEIO", "2026-10-23", 11, "01/11/2026", 180),
  row("FIM", "2026-11-21", 12, "01/12/2026", 210),
  row("DEPOIS", "2026-11-22", 12, "02/12/2026", 900),
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [],
  screenshots = [];
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
    await page.route("**/tc-closing-check", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body style="margin:0"><div id="host" style="height:100vh;container-type:size;container-name:quality-frame"></div></body></html>',
      }),
    );
    await page.goto("http://127.0.0.1:5175/tc-closing-check");
    await page.evaluate(
      async ({ technicalVisit, records }) => {
        const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
        const { mountTC } = await import("/src/components/quality/reference/tc-engine.js");
        const { tcStyle, tcMarkup } =
          await import("/src/components/quality/reference/templates.ts");
        const { default: presentationCss } =
          await import("/src/components/quality/reference/tc-presentation.css?inline");
        const parent = {
          getSupervisorMap: () => ({ Z1: { name: "Técnico A", supervisor: "Equipe A" } }),
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
        // A previous manual/suggested end must not override the confirmed QQ closing.
        scope.environment.localStorage.setItem(
          "tc_projection_plans_v1",
          JSON.stringify({ "2026-11": { end: "2026-11-20" } }),
        );
        window.engine = mountTC(scope.environment);
        window.engine.loadProjectData({ rows: records });
        window.engine.setUnifiedMonths(["2026-11"]);
      },
      { technicalVisit, records },
    );
    const root = page.locator("#host");
    const state = () => page.evaluate(() => window.engine.getProjectState());
    const source = (await state()).rows;
    const expectedCount = technicalVisit ? 1 : 3;
    const checkNovember = async () => {
      assert.equal(await root.locator("#tcResults").getAttribute("data-current-month"), "2026-11");
      const result = (await state()).result[0];
      assert.equal(result.os, expectedCount);
      assert.equal(result.points, technicalVisit ? 180 : 540);
      assert.equal(result.prod, 180);
      assert.equal(result.tec1, 1);
      assert.equal(result.revisit, 0);
      assert.equal(
        await root
          .locator('#tbody tr:has([data-tc-current-login="Z1"]) .tc-fixed-volume b')
          .innerText(),
        String(expectedCount),
      );
      assert.match(
        await root.locator("#tcProjectionToolbar").innerText(),
        technicalVisit ? /20\/11\/2026/ : /22\/10\/2026 a 21\/11\/2026/,
      );
    };
    await checkNovember();
    await root.locator("#tcProjectionPlanner").evaluate((el) => {
      el.open = true;
      el.dispatchEvent(new Event("toggle"));
    });
    assert.equal(
      await root.locator("#tcProjectionEnd").inputValue(),
      technicalVisit ? "2026-11-20" : "2026-11-21",
    );
    assert.equal(
      (await root.locator("#tcProjectionEnd").getAttribute("readonly")) !== null,
      !technicalVisit,
    );
    await root.locator("#tcProjectionPlanner").evaluate((el) => {
      el.open = false;
      el.dispatchEvent(new Event("toggle"));
    });
    await root.locator('[data-tc-current-login="Z1"]').click();
    const summary = await root.locator("#modalBody").innerText();
    assert.match(summary, /23\/10\/2026/);
    if (!technicalVisit) {
      assert.match(summary, /22\/10\/2026/);
      assert.match(summary, /21\/11\/2026/);
      assert.match(summary, /540 pontos ÷ 3 dias com pontos = 180,0/);
    } else assert.doesNotMatch(summary, /21\/10\/2026|21\/11\/2026/);
    await root.locator('#modalBody [data-tc-metric="prod"]').first().click();
    await root.locator("#tcWholeBase").click();
    assert.equal(await root.locator(".tc-contract-table tbody tr").count(), expectedCount);
    assert.deepEqual(
      await root.locator(".tc-contract-link").allTextContents(),
      technicalVisit ? ["MEIO"] : ["INICIO", "MEIO", "FIM"],
    );
    await root.locator("#modalClose").click();
    await page.evaluate(() =>
      window.engine.setUnifiedDates({ start: "2026-10-21", end: "2026-10-21" }),
    );
    assert.equal((await state()).result.length, 0);
    await page.evaluate(() =>
      window.engine.setUnifiedDates({ start: "2026-10-22", end: "2026-10-22" }),
    );
    assert.equal((await state()).result.length, technicalVisit ? 0 : 1);
    if (!technicalVisit) assert.equal((await state()).result[0].os, 1);
    await page.evaluate(() => window.engine.setUnifiedDates({ start: "", end: "" }));
    for (const [month, count] of [
      ["2026-10", technicalVisit ? 2 : 1],
      ["2026-12", technicalVisit ? 2 : 1],
    ]) {
      await page.evaluate((month) => window.engine.setUnifiedMonths([month]), month);
      assert.equal((await state()).result[0].os, count);
    }
    await page.evaluate(() => window.engine.setUnifiedMonths(["2026-10", "2026-11", "2026-12"]));
    assert.equal((await state()).result[0].os, records.length);
    await page.evaluate(() => {
      window.engine.setUnifiedMonths(["2026-11"]);
      window.engine.setUnifiedSupervisors(["Equipe A"]);
      window.engine.setUnifiedPresentation(true);
    });
    await checkNovember();
    const screenshot = join(tmpdir(), `tc-november-closing-${technicalVisit ? "vt" : "qq"}.png`);
    await page.screenshot({ path: screenshot, animations: "disabled" });
    screenshots.push(screenshot);
    await page.evaluate(() => {
      window.slideSnapshot = window.engine.technetSlides.begin();
      window.engine.technetSlides.show({ panel: "tc", city: "Recife", supervisor: "Equipe A" });
    });
    await checkNovember();
    await page.evaluate(() => window.engine.technetSlides.restore(window.slideSnapshot));
    assert.deepEqual((await state()).rows, source);
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify({
      exactQQPeriod: "22/10/2026 a 21/11/2026 inclusive",
      noAdjacentMonthDuplicates: true,
      dailyAndContractDetails: true,
      immutableSourceAndImports: true,
      presentationAndSlides: true,
      unchangedVT: true,
      productionWrites: 0,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
