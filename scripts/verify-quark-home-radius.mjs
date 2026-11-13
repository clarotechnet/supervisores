// Local QA with synthetic coordinates. No authentication or external requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const url = process.env.QUARK_QA_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let externalRequests = 0;
let writes = 0;
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    externalRequests++;
    return route.abort();
  });
  await page.route("**/home-radius-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="pt-BR"><body style="padding:24px"><div id="host"></div></body></html>',
    }),
  );
  await page.goto(`${url}/home-radius-check`);
  await page.evaluate(async () => {
    const { injectIntoGlobalHook } = await import("/@react-refresh");
    injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    const componentSource = await (await fetch("/src/components/QuarkHomeRadiusInput.tsx")).text();
    const reactPath = componentSource.match(/from "([^\"]*\/react\.js[^\"]*)"/)?.[1];
    if (!reactPath) throw Error("React dependency not found in transformed component");
    const reactModule = await import(reactPath);
    const React = reactModule.default ?? reactModule;
    const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = clientModule.default ?? clientModule;
    const { QuarkHomeRadiusInput } = await import("/src/components/QuarkHomeRadiusInput.tsx");
    const { buildQuarkNearHomeReport } = await import("/src/lib/quark-location-report.ts");
    const { buildLocationSummaries } = await import("/src/lib/quark.ts");
    await import("/src/styles.css");
    const person = {
      unit_id: 1,
      collaborator_id: "test",
      full_name: "Pessoa de teste",
      home: { latitude: 0, longitude: 0 },
    };
    const punches = [0, 0.004, 0.013, 0.014].map((longitude, index) => ({
      unit_id: 1,
      collaborator_id: "test",
      point_id: String(index),
      latitude: 0,
      longitude,
      work_date: "2026-11-13",
      punch_time: "08:00:00",
      location: "Teste",
    }));
    function Harness() {
      const [meters, setMeters] = React.useState(200);
      const report = buildQuarkNearHomeReport([person], punches, meters);
      const [summary] = buildLocationSummaries([person], punches, meters);
      return React.createElement(
        "div",
        { className: "grid max-w-lg gap-5" },
        React.createElement(QuarkHomeRadiusInput, { valueMeters: meters, onChange: setMeters }),
        React.createElement(QuarkHomeRadiusInput, {
          label: "Raio no mapa",
          valueMeters: meters,
          onChange: setMeters,
        }),
        React.createElement(
          "output",
          { id: "result" },
          JSON.stringify({
            meters,
            near: summary.nearHome,
            outside: summary.outsideHome,
            report: report.details.length,
          }),
        ),
      );
    }
    createRoot(document.getElementById("host")).render(React.createElement(Harness));
  });
  const input = page.getByRole("textbox", {
    name: "Distância considerada próxima (km)",
    exact: true,
  });
  const mapInput = page.getByRole("textbox", { name: "Raio no mapa (km)", exact: true });
  const result = async () => JSON.parse(await page.locator("#result").innerText());
  await page.locator("#host input").first().waitFor();
  assert.deepEqual(errors, []);
  await input.waitFor();
  assert.equal(await input.inputValue(), "0,2");
  assert.deepEqual(await result(), { meters: 200, near: 1, outside: 3, report: 1 });
  await input.fill("1,5");
  assert.deepEqual(await result(), { meters: 1500, near: 3, outside: 1, report: 3 });
  assert.equal(await mapInput.inputValue(), "1,5");
  await input.fill("1.5");
  assert.equal((await result()).meters, 1500);
  await input.press("Tab");
  assert.equal(await input.inputValue(), "1,5");
  for (const invalid of ["", "0", "-1,5", "abc", "1,2,3"]) {
    await input.fill(invalid);
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal((await result()).meters, 1500);
  }
  await input.fill("1");
  await input.press("End");
  await input.pressSequentially(",");
  assert.equal(await input.inputValue(), "1,");
  await input.pressSequentially("5");
  assert.equal((await result()).meters, 1500);
  await mapInput.fill("0,5");
  await page.waitForFunction(() => document.querySelector("#host input")?.value === "0,5");
  assert.equal(await input.inputValue(), "0,5");
  assert.deepEqual(await result(), { meters: 500, near: 2, outside: 2, report: 2 });
  await input.fill("1,5");
  const screenshot = join(tmpdir(), "quark-home-radius.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        commaAndPoint: true,
        meters: 1500,
        synchronizedMap: true,
        summaryAndReport: true,
        invalidKeepsLastValid: true,
        writes,
        externalRequests,
        screenshot,
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
