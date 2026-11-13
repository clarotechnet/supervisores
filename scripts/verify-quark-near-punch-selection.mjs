// Local integration QA: real Quark page/exports, synthetic service data, no external writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const { default: ExcelJS } = await import("exceljs");
const url = process.env.QUARK_QA_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let writes = 0;
let externalRequests = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.print = () => {};
  });
  await context.route("**/*", (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") return route.continue();
    if (request.method() !== "GET") {
      writes++;
      return route.abort();
    }
    if (parsed.hostname === "tile.openstreetmap.org")
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#cad5df"/></svg>',
      });
    if (parsed.origin === new URL(url).origin) return route.continue();
    externalRequests++;
    return route.abort();
  });
  await context.route("**/src/components/AppShell.tsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export function AppShell({children}) { return children; }",
    }),
  );
  await context.route("**/src/components/QuarkGate.tsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export function QuarkGate({children}) { return children; }",
    }),
  );
  await context.route("**/src/hooks/useAuth.tsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export function useAuth() { return { profile: {id:'test', role:'admin',status:'active'}, loading: false }; }",
    }),
  );
  await context.route("**/src/services/quark.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    import { locationPerson, locationHome, locationDirectory, nearSelectionPunches } from '/tests/fixtures/quark-location.ts';
    export async function fetchQuarkPeople() { return [locationPerson]; }
    export async function fetchQuarkDirectories() { return [locationDirectory]; }
    export async function fetchQuarkHomes() { return [locationHome]; }
    export async function fetchQuarkDays() { return []; }
    export async function fetchLastQuarkSync() { return null; }
    export async function fetchQuarkPunches(start, end) { return nearSelectionPunches.filter(p=>p.work_date>=start && p.work_date<=end); }
    export async function fetchQuarkPunchesForPerson(unit, person, start, end) { return fetchQuarkPunches(start, end); }
    const forbidden = async () => { throw Error('Write/API action not allowed in local QA'); };
    export { forbidden as deleteQuarkDirectory, forbidden as deleteQuarkHome, forbidden as saveQuarkDirectories, forbidden as saveQuarkDirectory, forbidden as saveQuarkHome, forbidden as syncQuark, forbidden as syncQuarkLocations };
  `,
    }),
  );
  await context.route("**/near-punch-selection-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html class="dark" lang="pt-BR"><body style="padding:20px;background:#081321;color:#e5e7eb"><div id="host"></div></body></html>',
    }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
  await page.goto(`${url}/near-punch-selection-check`);
  await page.evaluate(async () => {
    const { injectIntoGlobalHook } = await import("/@react-refresh");
    injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    const modulePath = "/src/routes/_app.admin.quark.tsx?tsr-split=component";
    const source = await (await fetch(modulePath)).text();
    const reactPath = source.match(/from "([^\"]*\/react\.js[^\"]*)"/)?.[1];
    if (!reactPath) throw Error("React dependency not found");
    const reactModule = await import(reactPath),
      React = reactModule.default ?? reactModule;
    const client = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = client.default ?? client;
    const { component } = await import(modulePath);
    await import("/src/styles.css");
    createRoot(document.getElementById("host")).render(React.createElement(component));
  });
  await page.getByRole("tab", { name: "Localizações", exact: true }).click();
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const filter = dialog.getByRole("region", {
    name: "Selecionar batidas próximas para o relatório",
  });
  const rows = dialog.locator("[data-quark-report-table] tbody tr");
  await filter.waitFor();
  const first = filter.getByRole("checkbox", {
    name: "Incluir 28/10/2026 às 13:00 no relatório",
    exact: true,
  });
  const second = filter.getByRole("checkbox", {
    name: "Incluir 03/11/2026 às 08:00 no relatório",
    exact: true,
  });
  const third = filter.getByRole("checkbox", {
    name: "Incluir 07/11/2026 às 13:00 no relatório",
    exact: true,
  });
  assert.equal(await filter.getByRole("checkbox").count(), 3);
  assert.equal(await first.isChecked(), true);
  assert.equal(await third.isChecked(), true);
  assert.equal(await dialog.getByRole("button", { name: "3ª batida", exact: true }).count(), 0);
  await dialog.getByRole("button", { name: /^Próximas/ }).click();
  assert.deepEqual(await rows.locator("td:first-child").allTextContents(), ["3", "1", "3"]);
  await second.uncheck();
  assert.deepEqual(await rows.locator("td:first-child").allTextContents(), ["3", "3"]);
  assert.deepEqual(await rows.locator("td:nth-child(2)").allTextContents(), [
    "28/10/202613:00",
    "07/11/202613:00",
  ]);
  assert.equal(
    await filter.getByRole("checkbox").count(),
    3,
    "unchecked records remain selectable",
  );
  assert.equal(
    await dialog.locator("[data-quark-report-highlights] > div:last-child > div").count(),
    2,
  );
  async function downloadWorkbook() {
    const waiting = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "XLSX individual", exact: true }).click();
    const download = await waiting;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await download.path());
    return workbook;
  }
  const workbook = await downloadWorkbook();
  const details = workbook.getWorksheet("Batidas próximas");
  assert.equal(details.rowCount, 7);
  assert.deepEqual(
    [6, 7].map((row) => details.getCell(`K${row}`).value),
    [3, 3],
  );
  assert.deepEqual(
    [6, 7].map((row) => details.getCell(`D${row}`).value),
    ["2026-11-07", "2026-10-28"],
  );
  assert.equal(details.getCell("F3").value, "2 de 3 batida(s) próxima(s) selecionada(s)");
  const popupWaiting = context.waitForEvent("page");
  await dialog.getByRole("button", { name: "Imprimir / PDF", exact: true }).click();
  const popup = await popupWaiting;
  await popup.locator("[data-quark-report-table] tbody tr").first().waitFor();
  assert.equal(await popup.locator("[data-quark-report-table] tbody tr").count(), 2);
  assert.deepEqual(
    await popup.locator("[data-quark-report-table] tbody td:first-child").allTextContents(),
    ["3", "3"],
  );
  assert.match(await popup.locator("body").innerText(), /2 de 3 batida/);
  assert.doesNotMatch(await popup.locator("[data-quark-report-table]").innerText(), /03\/11\/2026/);
  assert.equal(await popup.locator("[data-quark-report-highlights]").isVisible(), true);
  await popup.close();
  const pngWaiting = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Salvar imagem PNG", exact: true }).click();
  const png = await pngWaiting;
  assert.match(png.suggestedFilename(), /\.png$/);
  const pngPath = join(tmpdir(), "quark-near-punch-selection-export.png");
  await png.saveAs(pngPath);
  await first.uncheck();
  assert.equal(
    await rows.count(),
    1,
    "choose only one of two records with the same original day number",
  );
  assert.deepEqual(await rows.locator("td:nth-child(2)").allTextContents(), ["07/11/202613:00"]);
  const single = await downloadWorkbook();
  assert.equal(single.getWorksheet("Batidas próximas").rowCount, 6);
  assert.equal(single.getWorksheet("Batidas próximas").getCell("D6").value, "2026-11-07");
  await filter.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  assert.equal(await rows.count(), 0);
  assert.equal(
    await dialog.getByRole("button", { name: "XLSX individual", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await filter.getByRole("checkbox").count(), 3);
  await third.check();
  assert.equal(await rows.count(), 1);
  await filter.getByRole("button", { name: "Selecionar todas", exact: true }).click();
  assert.equal(await rows.count(), 3);
  await second.uncheck();
  const radius = dialog.getByRole("textbox", { name: "Raio da moradia (km)", exact: true });
  await radius.fill("3");
  assert.equal(await filter.getByRole("checkbox").count(), 12);
  assert.equal(
    await rows.count(),
    2,
    "changing radius does not replace explicit IDs with all nearby records",
  );
  await radius.fill("0,2");
  assert.equal(await filter.getByRole("checkbox").count(), 3);
  const screenshot = join(tmpdir(), "quark-near-punch-selection.png");
  await dialog.screenshot({ path: screenshot });
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        specificRecordOnly: true,
        twoOfThreeNearby: true,
        sameOriginalNumberIndependent: true,
        originalNumbers: true,
        emptySelection: true,
        xlsx: true,
        printPDF: true,
        png: true,
        writes,
        externalRequests,
        screenshot,
        pngPath,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error({ errors, writes, externalRequests });
  throw error;
} finally {
  await browser.close();
}
