// Local browser QA only: synthetic records, no authentication, all external requests blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const { default: ExcelJS } = await import("exceljs");
const url = process.env.QUARK_QA_URL || "http://127.0.0.1:5176";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let externalRequests = 0;
const screenshots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    externalRequests++;
    return route.abort();
  });
  await page.route("**/bank-hours-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html class="dark"><body style="margin:0;padding:24px;background:var(--background);color:var(--foreground)"><div id="host"></div></body></html>',
    }),
  );
  await page.goto(`${url}/bank-hours-check`);
  await page.evaluate(async () => {
    const { injectIntoGlobalHook } = await import("/@react-refresh");
    injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = clientModule.default ?? clientModule;
    const { QuarkBankHours } = await import("/src/components/QuarkBankHours.tsx");
    const { bankPeople, bankDays, bankContext } = await import("/tests/fixtures/quark-bank.ts");
    await import("/src/styles.css");
    const root = createRoot(document.getElementById("host"));
    window.renderBank = (filter = "all", loading = false) => {
      const people = filter === "all" ? bankPeople : bankPeople.slice(0, 1);
      const days =
        filter === "all"
          ? bankDays
          : bankDays.filter(
              (day) =>
                day.collaborator_id === "1" &&
                (filter !== "october" || day.work_date >= "2026-10-01"),
            );
      root.render(
        React.createElement(QuarkBankHours, {
          people,
          days,
          loading,
          context: {
            ...bankContext,
            startDate: filter === "october" ? "2026-10-01" : bankContext.startDate,
            filters: { ...bankContext.filters, collaborator: filter === "all" ? "Todos" : "Ana" },
          },
        }),
      );
    };
    window.renderBank();
  });
  const data = page.getByRole("region", { name: "Dados do banco de horas" });
  const tableRows = data.locator("tbody tr");
  await tableRows.first().waitFor();
  assert.equal(await tableRows.count(), 3);

  async function readDownload(buttonName) {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: buttonName, exact: true }).click();
    const download = await waiting;
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await download.path());
    return book;
  }
  const complete = await readDownload("Exportar Excel completo");
  assert.equal(complete.worksheets.length, 6);
  assert.equal(complete.getWorksheet("Top 10 negativos").getCell("L8").value, -50.5);
  const fullPath = join(tmpdir(), "quark-bank-all.png");
  await page.screenshot({ path: fullPath, fullPage: true });
  screenshots.push(fullPath);

  const alertKpi = page.getByRole("button", { name: /^Alertas acima de 2h\/dia/ });
  await alertKpi.click();
  assert.equal(await alertKpi.getAttribute("aria-pressed"), "true");
  assert.equal(await tableRows.count(), 2);
  assert.match(await data.innerText(), /26\/09\/2026/);
  assert.doesNotMatch(await data.innerText(), /25\/10\/2026/);
  assert.equal(await page.getByRole("region", { name: "Maiores saldos positivos" }).count(), 0);
  const alerts = await readDownload("Exportar recorte Excel");
  assert.deepEqual(
    alerts.worksheets.map((sheet) => sheet.name),
    ["Alertas acima de 2h"],
  );
  assert.equal(alerts.worksheets[0].rowCount, 9);
  assert.equal(alerts.worksheets[0].getCell("L9").value, 121 / 60);
  const alertPath = join(tmpdir(), "quark-bank-alerts.png");
  await page.screenshot({ path: alertPath, fullPage: true });
  screenshots.push(alertPath);

  for (const [name, expected, excluded] of [
    [/^Horas positivas/, "Ana Positiva", "Bruno Negativo"],
    [/^Horas negativas/, "Bruno Negativo", "Ana Positiva"],
  ]) {
    const kpi = page.getByRole("button", { name });
    await kpi.click();
    assert.equal(await tableRows.count(), 1);
    assert.match(await data.innerText(), new RegExp(expected));
    assert.doesNotMatch(await data.innerText(), new RegExp(excluded));
    await kpi.click();
    assert.equal(await tableRows.count(), 3);
  }
  const peopleKpi = page.getByRole("button", { name: /^Colaboradores analisados/ });
  await peopleKpi.focus();
  await page.keyboard.press("Enter");
  assert.equal(await peopleKpi.getAttribute("aria-pressed"), "true");
  assert.equal(await tableRows.count(), 3);
  const people = await readDownload("Exportar recorte Excel");
  assert.deepEqual(
    people.worksheets.map((sheet) => sheet.name),
    ["Colaboradores"],
  );
  await page.getByRole("button", { name: "Limpar seleção do KPI" }).click();

  for (const kind of ["positivos", "negativos"]) {
    await page.getByRole("button", { name: `Focar top 10 ${kind}`, exact: true }).click();
    assert.equal(await tableRows.count(), 1);
    const top = await readDownload("Exportar recorte Excel");
    assert.deepEqual(
      top.worksheets.map((sheet) => sheet.name),
      [`Top 10 ${kind}`],
    );
    await page.getByRole("button", { name: "Limpar seleção do KPI" }).click();
  }

  await page.evaluate(() => window.renderBank("ana"));
  await tableRows.filter({ hasText: "Ana Positiva" }).waitFor();
  const filtered = await readDownload("Exportar Excel completo");
  assert.equal(filtered.getWorksheet("Colaboradores").rowCount, 8);
  assert.equal(filtered.getWorksheet("Alertas acima de 2h").rowCount, 8);
  assert.match(filtered.worksheets[0].getCell("A4").value, /nome\/login = Ana/);
  await alertKpi.click();
  assert.equal(await tableRows.count(), 1);
  await page.evaluate(() => window.renderBank("october"));
  await page
    .getByText("Nenhum registro corresponde a este recorte nos filtros selecionados.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await tableRows.count(), 0);
  const empty = await readDownload("Exportar recorte Excel");
  assert.equal(empty.worksheets.length, 1);
  assert.match(empty.worksheets[0].getCell("A8").value, /Nenhum registro/);
  assert.match(empty.worksheets[0].getCell("A3").value, /01\/10\/2026/);
  await page.evaluate(() => window.renderBank("october", true));
  assert.equal(
    await page.getByRole("button", { name: "Exportar recorte Excel" }).isDisabled(),
    true,
  );

  await page.evaluate(() => window.renderBank());
  await page.getByRole("button", { name: "Limpar seleção do KPI" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePath = join(tmpdir(), "quark-bank-mobile.png");
  await page.screenshot({ path: mobilePath, fullPage: true });
  screenshots.push(mobilePath);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Page must not overflow horizontally",
  );
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks:
          "All KPIs, keyboard, top 10, clear, filter changes, complete/focused/empty XLSX downloads, loading and mobile layout",
        errors,
        externalRequests,
        screenshots,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
