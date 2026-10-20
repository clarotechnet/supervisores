// Differential SLA QA against the supplied HTML. All data stays local.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const originalPath =
  process.argv[2] || "C:/Users/Usuario/Downloads/Painel_SLA_Garantia_v18_ATUALIZADO_CONFERIDO.html";
const html = fs.readFileSync(originalPath, "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const native = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const reference = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  for (const page of [native, reference]) {
    page.on("pageerror", (error) => errors.push(error.stack));
    await page.routeWebSocket("**/*", (socket) => socket.close());
    await page.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
    );
  }
  await native.route("**/sla-reference-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0"><div id="host" style="width:1440px"></div></body></html>',
    }),
  );
  await native.goto("http://127.0.0.1:5175/sla-reference-check");
  await reference.setContent(
    html.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi, ""),
  );
  await native.evaluate(async (html) => {
    const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
    const { mountSla } = await import("/src/components/quality/sla-reference/sla-engine.js");
    const { slaStyle, slaMarkup } =
      await import("/src/components/quality/sla-reference/templates.ts");
    const { extractSlaHtml } = await import("/src/lib/sla-import.ts");
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
      slaStyle,
      slaMarkup,
      parent,
      true,
      async () => {
        throw Error("No uploads in differential QA");
      },
    );
    window.slaEngine = mountSla(scope.environment);
    const snapshot = extractSlaHtml(html);
    window.slaEngine.loadProjectData(snapshot);
    scope.environment.document.getElementById("cutoffEighteen").click();
  }, html);
  const nativeRoot = native.locator("#host");
  const metrics = async (page, prefix = "") =>
    Promise.all(
      ["kTotal", "kSem", "kLogs", "kCom", "kSlaValue", "formulaNote"].map((id) =>
        page.locator(`${prefix}#${id}`).innerText(),
      ),
    );
  const compare = async () =>
    assert.deepEqual(await metrics(native, "#host "), await metrics(reference));
  await compare();
  assert.deepEqual((await metrics(native, "#host ")).slice(0, 5), [
    "1.142",
    "133",
    "164",
    "1.009",
    "77,26%",
  ]);
  // Every original SVG remains byte-identical under the same inputs and filters.
  assert.deepEqual(
    await nativeRoot.locator("svg").evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
    await reference.locator("svg").evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
  );
  for (const id of ["metricTasks", "metricAttendance"]) {
    await nativeRoot.locator(`#${id}`).click();
    await reference.locator(`#${id}`).click();
    await compare();
  }
  await nativeRoot.locator("#baseSelect").selectOption("previousCsv");
  await reference.locator("#baseSelect").selectOption("previousCsv");
  for (const id of ["indicatorRegular", "indicatorTotal"]) {
    await nativeRoot.locator(`#${id}`).click();
    await reference.locator(`#${id}`).click();
    await compare();
  }
  for (const source of ["history", "previousCsv", "current"]) {
    await nativeRoot.locator("#baseSelect").selectOption(source);
    await reference.locator("#baseSelect").selectOption(source);
    await compare();
  }
  await nativeRoot.locator("#kSla").click();
  await reference.locator("#kSla").click();
  assert.equal(await nativeRoot.locator("#drillDialog").isVisible(), true);
  assert.equal(
    await nativeRoot.locator("#drillDialog").innerText(),
    await reference.locator("#drillDialog").innerText(),
  );
  await nativeRoot.locator("#drillClose").click();
  await reference.locator("#drillClose").click();
  await native.screenshot({ path: join(tmpdir(), "sla-native-reference.png"), fullPage: false });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      originalReference: true,
      exactSvg: true,
      formulaParity: true,
      thirtyAndTenDays: true,
      attendanceAndTasks: true,
      threeSources: true,
      drilldown: true,
      expectedFortaleza: "77,26%",
      productionWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
