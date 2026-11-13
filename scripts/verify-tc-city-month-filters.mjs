// Full React integration with synthetic data; no authentication or production writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const url = process.env.QUALITY_QA_URL || "http://127.0.0.1:5178";
const tc = [9, 10, 11].flatMap((month) =>
  [
    ["REC", "Recife", 200],
    ["GOI", "GOIANIA", 100],
    ["SHARED", "Recife", 180],
    ["SHARED", "GOIANIA", 80],
  ].map(([login, city, points], index) => ({
    login,
    name: `Técnico ${login}`,
    company: "JCR-DMV",
    baseUnit: "JCR-DMV",
    mapSource: "base",
    qr: city === "Recife" ? "0" : "1",
    tnum: city === "Recife" ? "100" : "80",
    tden: "100",
    points: String(points),
    day: `2026-${String(month).padStart(2, "0")}-05`,
    month,
    year: 2026,
    city,
    sub: "Recife",
    uf: "PE",
    group: "Instalação",
    type: "1",
    wo: `${login}-${month}-${index}`,
    finish: `05/${String(month).padStart(2, "0")}/2026 08:00:00`,
    noteAt: `15/${String(month).padStart(2, "0")}/2026`,
    contract: `${login}-${month}-${index}`,
    orders: "",
    lowCodes: "100",
    revisitWo: "",
  })),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let externalRequests = 0,
  writes = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      writes++;
      return route.abort();
    }
    const target = new URL(route.request().url());
    if (target.origin !== new URL(url).origin) {
      externalRequests++;
      return route.abort();
    }
    if (target.pathname === "/tc-city-month-check")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="pt-BR"><body style="margin:0"><div id="host"></div></body></html>',
      });
    return route.continue();
  });
  await page.goto(`${url}/tc-city-month-check`);
  await page.evaluate(
    async ({ tc }) => {
      const { injectIntoGlobalHook } = await import("/@react-refresh");
      injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      const reactModule = await import("/node_modules/.vite/deps/react.js");
      const React = reactModule.default ?? reactModule;
      const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
      const { createRoot } = clientModule.default ?? clientModule;
      const { ReferenceQualitySurface } =
        await import("/src/components/quality/ReferenceQualitySurface.tsx");
      await import("/src/styles.css");
      const directory = ["REC", "GOI", "SHARED"].map((login) => ({
        login,
        full_name: `Técnico ${login}`,
        city: "Recife",
        sector: "ADESÃO/SERVIÇOS",
        supervisor: "Equipe A",
      }));
      const index = new Map(directory.map((person) => [person.login, person]));
      const registry = Object.fromEntries(
        directory.map((person) => [
          person.login,
          { name: person.full_name, supervisor: person.supervisor },
        ]),
      );
      const root = createRoot(document.getElementById("host"));
      window.tcCitySource = tc;
      window.tcCityOriginal = JSON.stringify(tc);
      window.renderTcCity = (withJanuary = false, technicalVisit = false, instance = "qq") => {
        const rows = withJanuary
          ? [
              ...tc,
              {
                ...tc[0],
                wo: "JAN-2027",
                contract: "JAN-2027",
                month: 1,
                year: 2027,
                day: "2027-01-05",
                finish: "05/01/2027 08:00:00",
                noteAt: "15/01/2027",
              },
            ]
          : tc;
        root.render(
          React.createElement(ReferenceQualitySurface, {
            key: technicalVisit ? "vt" : instance,
            qq: [],
            tc: rows,
            index,
            registry,
            names: {},
            techMap: {},
            nameUpdates: {},
            technicalVisit,
            editable: false,
            directory: null,
            status: null,
            importFile: async () => {
              throw Error("No imports in QA");
            },
            importHistory() {},
            refresh() {},
            onPresentationChange() {},
            qqReady: true,
            tcReady: true,
            presentationReady: true,
            requestTC() {},
            qqError: "",
            tcError: "",
          }),
        );
      };
      window.renderTcCity();
    },
    { tc },
  );
  await page.locator("#goTC").click();
  const root = page.locator("#referenceTC"),
    cityStrip = root.locator("#presentationCityStrip");
  const city = (name) => cityStrip.locator(`[data-city="${name}"]`);
  await city("GOIANIA").waitFor();
  assert.equal(await city("Recife").count(), 1);
  await city("Recife").click();
  assert.equal(await root.locator("#tbody tr").count(), 2);
  assert.equal(await root.locator('[data-tc-current-login="GOI"]').count(), 0);
  assert.match(await root.locator("#scoreVal").innerText(), /100/);
  assert.equal(
    await root.locator('tr:has([data-tc-current-login="SHARED"]) .tc-fixed-volume b').innerText(),
    "1",
  );
  await city("GOIANIA").click();
  assert.equal(await root.locator("#tbody tr").count(), 2);
  assert.equal(await root.locator('[data-tc-current-login="REC"]').count(), 0);
  assert.match(await root.locator("#scoreVal").innerText(), /^0,/);

  const all = page.locator('#monthOptions [data-month="*"]');
  const checkedMonths = () =>
    page
      .locator("#monthOptions [data-month]:checked")
      .evaluateAll((boxes) => boxes.map((box) => box.dataset.month));
  await page.locator("#monthPicker > summary").click();
  assert.equal(await all.isChecked(), false);
  assert.deepEqual(await checkedMonths(), ["2026-11"]);
  assert.equal(await page.locator("#monthPickerLabel").innerText(), "11/2026");
  assert.doesNotMatch(await root.locator("#tcHead").innerText(), /SETEMBRO|OUTUBRO/i);
  await all.click();
  assert.deepEqual(await checkedMonths(), ["*", "2026-09", "2026-10", "2026-11"]);
  await all.focus();
  await page.keyboard.press("Space");
  assert.deepEqual(await checkedMonths(), ["2026-11"]);
  await page.locator("#monthPicker > summary").click();

  // The native TC picker must behave like the shared toolbar picker.
  await root.locator("#tcToolsToggle").click();
  await root.locator("#tcMonthPicker > summary").click();
  const nativeAll = root.locator("[data-tc-all]");
  await nativeAll.click();
  assert.equal(await all.isChecked(), true);
  await nativeAll.click();
  assert.deepEqual(await checkedMonths(), ["2026-11"]);
  await root.locator("#tcMonthPicker > summary").click();
  await root.locator("#tcToolsClose").click();

  await page.locator("#goFS").click();
  await city("Recife").click();
  assert.equal(await root.locator('[data-tc-current-login="GOI"]').count(), 0);
  assert.match(await root.locator("#scoreVal").innerText(), /100/);
  await city("GOIANIA").click();
  assert.equal(await root.locator('[data-tc-current-login="REC"]').count(), 0);
  const screenshot = join(tmpdir(), "tc-goiania-separated.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.locator("#goFS").click();

  await page.evaluate(() => window.renderTcCity(true));
  await page.locator("#monthPicker > summary").click();
  await page.locator('#monthOptions [data-month="2027-01"]').waitFor();
  assert.equal(
    await page.locator("#monthPickerLabel").innerText(),
    "11/2026",
    "refresh preserves an explicit selection",
  );
  await all.click();
  await all.click();
  assert.deepEqual(await checkedMonths(), ["2027-01"]);
  assert.equal(await page.locator("#monthPickerLabel").innerText(), "01/2027");
  await page.evaluate(() => window.renderTcCity(true, false, "fresh-january"));
  await page.locator("#goTC").click();
  assert.equal(
    await page.locator("#monthPickerLabel").innerText(),
    "01/2027",
    "fresh opening defaults to the latest available year/month",
  );
  assert.deepEqual(await checkedMonths(), ["2027-01"]);
  await page.evaluate(() => window.renderTcCity(false, true));
  await root.locator('[data-tc-current-login="GOI"]').waitFor();
  assert.equal(
    await city("GOIANIA").count(),
    0,
    "VT keeps its existing registry-based city assignment",
  );
  assert.equal(await city("Recife").count(), 1);
  assert.equal(
    await page.locator("#monthPickerLabel").innerText(),
    "Todos os meses",
    "VT keeps its existing default",
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.tcCitySource) === window.tcCityOriginal),
    true,
  );
  assert.equal(writes, 0);
  assert.equal(externalRequests, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceCityOverridesRegistryOnlyInQQTC: true,
        recifeAndGoianiaSeparated: true,
        sharedLoginSeparatedByAttendance: true,
        allMonthsToggle: true,
        nativeAndSharedPickers: true,
        keyboardAndPresentation: true,
        latestMonthAcrossYears: true,
        unchangedVT: true,
        writes,
        externalRequests,
        screenshot,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
