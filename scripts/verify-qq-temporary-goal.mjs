// Native QQ renderer, synthetic rows. All external requests and writes are blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const sourceCode = await readFile("src/components/quality/reference/qq-engine.js", "utf8");
const defaultGoal = Number(
  sourceCode.match(/QQ_DEFAULT_BREAK_GOAL=Object\.freeze\(\{[^}]*MIG:([\d.]+)/)?.[1],
);
assert.ok(Number.isFinite(defaultGoal));
const url = process.env.QQ_QA_URL || "http://127.0.0.1:5175";
const source = ["ND", "MIG", "PME", "ME"].flatMap((front) =>
  Array.from({ length: 25 }, (_, index) => ({
    d: "2026-11-10",
    w: "2",
    lt: `TEST_${front}`,
    un: "NTL-DMV",
    ci: "Natal",
    cl: "RN",
    f: front === "PME" ? "ND" : front,
    gf: front,
    segment: front === "PME" ? "PME" : "",
    group: front === "ME" ? "ME" : "",
    b: Number(index < 7),
    c: null,
    contract: `${front}-${index}`,
    os: `${front}-${index}`,
    wo: `${front}-${index}`,
    baixa: "100",
    responsible: index < 7 ? "TECNICO" : "SEM_QUEBRA",
    rawCategory: "",
    treatment: index < 7 ? "COM QUEBRA DE AGENDA" : "SEM QUEBRA DE AGENDA",
    service: front === "ME" ? "MUDANÇA DE ENDEREÇO" : "INSTALAÇÃO",
    osGroup: front === "ME" ? "MUDANÇA DE ENDEREÇO" : "INSTALAÇÃO",
  })),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let remoteRequests = 0;
let writes = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
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
      remoteRequests++;
      return route.abort();
    }
    if (target.pathname === "/qq-temporary-goal")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="pt-BR"><body style="margin:0"><div id="host" style="height:100vh;overflow:auto;container:quality-frame/size"></div><div id="other" style="display:none;height:1000px"></div></body></html>',
      });
    return route.continue();
  });
  async function mount() {
    await page.evaluate(
      async ({ source }) => {
        const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
        const { mountQQ } = await import("/src/components/quality/reference/qq-engine.js");
        const { qqStyle, qqMarkup } =
          await import("/src/components/quality/reference/templates.ts");
        const { default: css } =
          await import("/src/components/quality/reference/qq-interactions.css?inline");
        window.goalWrites = [];
        window.goalImports = 0;
        const parent = {
          getSupervisorMap: () => ({}),
          refreshUnifiedMonth() {},
          setUnifiedMonths() {},
          setUnifiedDates() {},
          applyUnifiedDates() {},
          clearUnifiedDates() {},
          show() {},
        };
        window.mountGoalScope = (id) => {
          const scope = referenceScope(
            document.getElementById(id),
            `${qqStyle}\n${css}`,
            qqMarkup,
            parent,
            false,
            async () => {
              window.goalImports++;
              throw Error("No imports in QA");
            },
          );
          for (const key of ["setItem", "removeItem", "clear"]) {
            const original = scope.environment.localStorage[key].bind(
              scope.environment.localStorage,
            );
            scope.environment.localStorage[key] = (...args) => {
              window.goalWrites.push({ id, key, args });
              return original(...args);
            };
          }
          const engine = mountQQ(scope.environment);
          engine.loadProjectData({ rows: source });
          engine.setUnifiedUnits(["NTL-DMV"]);
          return { scope, engine };
        };
        window.goal = window.mountGoalScope("host");
        window.initialGoalState = JSON.stringify(window.goal.engine.getProjectState());
        window.goalWrites = [];
        // Detect browser storage writes too; the renderer's memory storage is checked separately.
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (...args) {
          window.goalWrites.push({ id: "browser", args });
          return original.apply(this, args);
        };
      },
      { source },
    );
  }
  await page.goto(`${url}/qq-temporary-goal`);
  await mount();
  const root = page.locator("#host"),
    input = root.locator("#mQuebraMIG");
  const kpi = root
    .locator("#kpis .kpi")
    .filter({ has: page.locator("small", { hasText: "%QUEBRA MIGRAÇÃO" }) });
  const defaultValue = (defaultGoal * 100).toLocaleString("pt-BR", {
    useGrouping: false,
    maximumFractionDigits: 12,
  });
  assert.equal(await input.inputValue(), defaultValue);
  assert.equal(await input.getAttribute("readonly"), null);
  assert.equal(await input.getAttribute("aria-readonly"), null);
  assert.equal(await input.getAttribute("tabindex"), null);
  assert.equal(await input.getAttribute("autocomplete"), "off");
  await root.locator('.tab[data-f="MIG"]').click();

  async function apply(text) {
    await input.fill(text);
    await input.dispatchEvent("change");
  }
  async function check(goal, status) {
    const label = `Meta ≤ ${(goal * 100).toFixed(2).replace(".", ",")}%`;
    assert.match(await kpi.innerText(), /28,00%/);
    assert.ok((await kpi.innerText()).includes(label));
    assert.ok((await kpi.innerText()).includes(status));
    for (const period of ["daily", "weekly"]) {
      assert.ok((await root.locator(`[data-qq-chart="${period}:b"]`).innerText()).includes(label));
    }
  }
  await apply("30");
  await check(0.3, "Meta atingida");
  await apply("27%");
  await check(0.27, "Acima da meta");
  assert.equal(await input.inputValue(), "27");
  await apply("27,5");
  await check(0.275, "Acima da meta");
  await apply("28.5");
  await check(0.285, "Meta atingida");

  for (const invalid of ["", "101", "-1", "abc", "27%%"]) {
    await input.fill(invalid);
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.match(await root.locator("#qqMigrationGoalHelp").innerText(), /última meta válida/);
    await check(0.285, "Meta atingida");
  }
  await apply("28");
  await check(0.28, "Meta atingida");
  assert.equal(await input.getAttribute("aria-invalid"), null);
  await apply("0");
  await check(0, "Acima da meta");
  await apply("100");
  await check(1, "Meta atingida");
  await page.evaluate(() => window.goal.engine.setUnifiedQQView("general"));
  const guide = root.locator('[data-goal-fronts="MIG"]');
  assert.equal(await guide.getAttribute("data-break-goal"), "1");
  assert.ok(Number(await guide.getAttribute("y1")) >= 0, "100% goal remains within the chart");
  await page.evaluate(() => window.goal.engine.setUnifiedQQView("front"));
  await apply("27,5");
  await page.evaluate(() => window.goal.engine.setUnifiedQQView("general"));
  assert.equal(await guide.getAttribute("data-break-goal"), "0.275");
  assert.match(
    await root.locator('[data-detail-front="MIG"]').first().innerText(),
    /Quebra ≤ 27,50%/,
  );
  assert.equal(
    await root.locator('[data-goal-fronts="ND / PME / ME"]').getAttribute("data-break-goal"),
    "0.2",
  );

  await page.evaluate(() => window.goal.engine.setUnifiedQQView("front"));
  await root.locator('.tab[data-f="ND"]').click();
  assert.match(await root.locator("#kpis").innerText(), /Meta ≤ 20,00%/);
  assert.match(await root.locator("#kpis").innerText(), /Meta ≤ 7,00%/);
  assert.equal(await root.locator("#mND").getAttribute("readonly"), "");
  await root.locator('.tab[data-f="MIG"]').click();
  await check(0.275, "Acima da meta");
  await root.locator('.tab[data-view="logins"]').click();
  await root.locator('#loginFront [data-lf="MIG"]').click();
  await root.locator('#loginIndicator [data-li="b"]').click();
  assert.match(await root.locator("#view").innerText(), /Meta ≤ 27,50%/);

  await root.locator('.tab[data-f="MIG"]').click();
  await page.evaluate(() => {
    window.goal.engine.setUnifiedPresentation(true);
    window.goal.snapshot = window.goal.engine.technetSlides.begin();
    window.goal.engine.technetSlides.show({
      panel: "qq",
      city: "Natal / Parnamirim",
      front: "MIG",
    });
  });
  await check(0.275, "Acima da meta");
  await page.evaluate(() => {
    window.goal.engine.technetSlides.restore(window.goal.snapshot);
    window.goal.engine.setUnifiedPresentation(false);
    window.goal.engine.loadProjectData({ rows: window.goal.engine.getProjectState().rows });
  });
  await check(0.275, "Acima da meta");
  assert.equal(
    await page.evaluate(
      () => JSON.stringify(window.goal.engine.getProjectState()) === window.initialGoalState,
    ),
    true,
  );
  assert.deepEqual(await page.evaluate(() => window.goalWrites), []);
  assert.equal(await page.evaluate(() => window.goalImports), 0);

  await page.evaluate(() => {
    window.otherGoal = window.mountGoalScope("other");
  });
  assert.equal(await page.locator("#other #mQuebraMIG").inputValue(), defaultValue);
  assert.equal(await input.inputValue(), "27,5");
  const screenshot = join(tmpdir(), "qq-temporary-migration-goal.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.reload();
  await mount();
  assert.equal(await input.inputValue(), defaultValue);
  await root.locator('.tab[data-f="MIG"]').click();
  await check(defaultGoal, 0.28 <= defaultGoal ? "Meta atingida" : "Acima da meta");
  assert.deepEqual(errors, []);
  assert.equal(remoteRequests, 0);
  assert.equal(writes, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        defaultGoal,
        resetsOnReload: true,
        isolatedInstances: true,
        noStorageOrSourceChanges: true,
        chartsKpisLoginsGeneralPresentation: true,
        decimalAndBoundaryValidation: true,
        remoteRequests,
        writes,
        screenshot,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
