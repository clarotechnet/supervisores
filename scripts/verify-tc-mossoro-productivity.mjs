// Local native TC renderer; synthetic fixtures and blocked external traffic.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const url = process.env.QUALITY_QA_URL || "http://127.0.0.1:5173";
const make = (login, city, points, extra = {}) => ({
  login,
  name: `Técnico ${login}`,
  city,
  uf: city === "Recife" ? "PE" : "RN",
  baseUnit: city === "Mossoró" ? "MRO-DMV" : "JCR-DMV",
  company: city === "Mossoró" ? "MRO-DMV" : "JCR-DMV",
  mapSource: "base",
  qr: "0",
  tnum: "95",
  tden: "100",
  points: String(points),
  day: "2026-11-05",
  month: 11,
  year: 2026,
  sub: city,
  group: "Instalação",
  type: "1",
  wo: login,
  finish: "05/11/2026 08:00:00",
  noteAt: "15/11/2026",
  contract: login,
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  ...extra,
});
const rows = [
  make("M100", "Mossoró", 100),
  make("M127", "Mossoró", 127.5),
  make("M143", "Mossoró", 143.3),
  make("M099", "Mossoró", 99.9),
  make("MTEC", "Mossoró", 100, { tnum: "94" }),
  make("MREV", "Mossoró", 100, { qr: "1" }),
  make("M175", "Mossoró", 175),
  make("R127", "Recife", 127.5),
  make("R150", "Recife", 150),
  make("G100", "GOIANIA", 100),
  make("N100", "Natal", 100),
  make("MIX", "Mossoró", 60, { wo: "MIX-M" }),
  make("MIX", "Recife", 60, { wo: "MIX-R" }),
  make("M143", "Mossoró", 100, {
    wo: "OUTUBRO",
    contract: "OUTUBRO",
    month: 10,
    day: "2026-10-05",
    finish: "05/10/2026 08:00:00",
    noteAt: "15/10/2026",
  }),
];
const registry = Object.fromEntries(
  rows.map((r) => [
    r.login,
    { name: r.name, supervisor: r.city === "Mossoró" ? "Equipe Mossoró" : "Equipe demais" },
  ]),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let externalRequests = 0,
  writes = 0;
const errors = [],
  screenshots = [];
try {
  for (const technicalVisit of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
    page.on("pageerror", (error) => errors.push(error.stack));
    await page.routeWebSocket("**/*", (socket) => socket.close());
    await page.route("**/*", (route) => {
      const request = route.request(),
        target = new URL(request.url());
      if (!["GET", "HEAD"].includes(request.method())) {
        writes++;
        return route.abort();
      }
      if (target.origin !== new URL(url).origin) {
        externalRequests++;
        return route.abort();
      }
      if (target.pathname === "/tc-mossoro-check")
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="pt-BR"><body style="margin:0"><div id="host" style="height:100vh;overflow:auto;container:quality-frame/size"></div></body></html>',
        });
      return route.continue();
    });
    await page.goto(`${url}/tc-mossoro-check`);
    await page.evaluate(
      async ({ rows, registry, technicalVisit }) => {
        const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
        const { mountTC } = await import("/src/components/quality/reference/tc-engine.js");
        const { tcStyle, tcMarkup } =
          await import("/src/components/quality/reference/templates.ts");
        const { default: css } =
          await import("/src/components/quality/reference/tc-presentation.css?inline");
        const scope = referenceScope(
          document.getElementById("host"),
          `${tcStyle}\n${css}`,
          tcMarkup,
          {
            getSupervisorMap: () => registry,
            refreshUnifiedMonth() {},
            setUnifiedMonths() {},
            setUnifiedDates() {},
            applyUnifiedDates() {},
            clearUnifiedDates() {},
            show() {},
          },
          false,
          async () => {
            throw Error("No imports in QA");
          },
        );
        scope.environment.technicalVisit = technicalVisit;
        scope.environment.localStorage.setItem(
          "tc_projection_plans_v1",
          JSON.stringify({
            "2026-11": { reference: "2026-11-05", end: "2026-11-21", workDays: 2 },
          }),
        );
        window.tcMossoro = mountTC(scope.environment);
        window.tcMossoro.loadProjectData({ rows });
        window.tcMossoro.setUnifiedMonths(["2026-11"]);
        window.tcMossoroOriginal = JSON.stringify(window.tcMossoro.getProjectState().rows);
      },
      { rows, registry, technicalVisit },
    );
    const root = page.locator("#host");
    const row = (login) => root.locator(`#tbody tr:has([data-tc-current-login="${login}"])`);
    const prod = (login) =>
      row(login).locator('td[data-month="2026-11"][data-indicator="prod"] button');
    const city = (name) => root.locator(`#presentationCityStrip [data-city="${name}"]`);
    const read = () =>
      page.evaluate(() =>
        window.tcMossoro
          .getProjectState()
          .result.map((a) => ({
            login: a.loginText,
            status: a.status,
            fails: a.fails,
            prod: a.prod,
          })),
      );
    const target = technicalVisit ? 175 : 100;
    await city("Mossoró").waitFor();
    if (!technicalVisit) {
      const result = await read();
      for (const login of ["M100", "M127", "M143", "M175", "R150"])
        assert.equal(result.find((r) => r.login === login).status, true, login);
      for (const login of ["M099", "MTEC", "MREV", "R127", "G100", "N100", "MIX"])
        assert.equal(result.find((r) => r.login === login).status, false, login);
      assert.deepEqual(result.find((r) => r.login === "MTEC").fails, ["TEC1"]);
      assert.deepEqual(result.find((r) => r.login === "MREV").fails, ["REV"]);
      assert.equal(await prod("M127").evaluate((el) => el.classList.contains("good")), true);
      assert.equal(await prod("R127").evaluate((el) => el.classList.contains("bad")), true);
      assert.match(await root.locator("#tcHead").innerText(), /Mossoró ≥ 100 · demais ≥ 150/);

      // Detail and projections must use the technician's goal even in Todas.
      await prod("M127").click();
      assert.match(await root.locator("#modalBody").innerText(), /Meta ≥ 100 pontos\/dia/);
      assert.match(await root.locator("#tcOnlyOffenders").innerText(), /\(0\)/);
      await root.locator("#modalClose").click();
      await row("M127").locator('[data-tc-projection-metric="prod"]').click();
      assert.match(await root.locator("#modalBody").innerText(), /Meta ≥ 100 pontos\/dia/);
      assert.match(await root.locator("#modalBody").innerText(), /172,5 pontos adicionais/);
      await root.locator("#modalClose").click();
      await row("R127").locator('[data-tc-projection-metric="prod"]').click();
      assert.match(await root.locator("#modalBody").innerText(), /Meta ≥ 150 pontos\/dia/);
      assert.match(await root.locator("#modalBody").innerText(), /322,5 pontos adicionais/);
      await root.locator("#modalClose").click();
      await root.locator("#tabDaily").click();
      await root.locator('.metricbtn[data-metric="prod"]').click();
      assert.match(
        await root
          .locator('#matrix tbody tr:has-text("Técnico M127") td.avg')
          .getAttribute("class"),
        /cellgood/,
      );
      assert.match(
        await root
          .locator('#matrix tbody tr:has-text("Técnico R127") td.avg')
          .getAttribute("class"),
        /cellbad/,
      );
      await root.locator("#tabPanel").click();
    }
    await city("Mossoró").click();
    assert.match(await root.locator("#tcHead").innerText(), new RegExp(`≥ ${target} pontos/dia`));
    assert.equal((await root.locator("#prodMeta").innerText()).trim(), `≥ ${target} pontos/dia`);
    assert.equal(
      await prod("M127").evaluate((el) => el.classList.contains("good")),
      !technicalVisit,
    );
    assert.equal((await read()).find((r) => r.login === "M100").status, !technicalVisit);
    assert.equal((await read()).find((r) => r.login === "M175").status, true);
    if (!technicalVisit) {
      assert.doesNotMatch(await root.locator("#tcHead").innerText(), /150/);
      await page.evaluate(() => window.tcMossoro.setUnifiedMonths(["2026-10", "2026-11"]));
      assert.equal(
        await row("M143")
          .locator('td[data-month="2026-10"][data-indicator="prod"] button')
          .evaluate((el) => el.classList.contains("good")),
        true,
      );
      await page.evaluate(() => window.tcMossoro.setUnifiedMonths(["2026-11"]));
      await root.locator('#tcSupervisorControls [data-sv-mode="supervisor"]').click();
      assert.match(await root.locator("#tcSupervisorTable thead").innerText(), /≥ 100 pontos\/dia/);
      await root.locator('#tcSupervisorControls [data-sv-mode="technician"]').click();
      await city("Recife").click();
      assert.match(await root.locator("#tcHead").innerText(), /≥ 150 pontos\/dia/);
      assert.equal(await prod("R127").evaluate((el) => el.classList.contains("bad")), true);
      await city("Mossoró").click();
    }
    await page.evaluate(() => window.tcMossoro.setUnifiedPresentation(true));
    assert.match(await root.locator("#tcHead").innerText(), new RegExp(`≥ ${target} pontos/dia`));
    const screenshot = join(
      tmpdir(),
      `tc-mossoro-productivity-${technicalVisit ? "vt" : "qq"}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);
    assert.equal(
      await page.evaluate(
        () => JSON.stringify(window.tcMossoro.getProjectState().rows) === window.tcMossoroOriginal,
      ),
      true,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mossoro: 100,
        otherQQCities: 150,
        technicalVisit: 175,
        inclusiveBoundary: true,
        allCitiesAndHistoricalStatus: true,
        metricColorsAndHeaders: true,
        contractsAndProjections: true,
        dailyMatrixAndSupervisorView: true,
        immutableSource: true,
        externalRequests,
        writes,
        screenshots,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
