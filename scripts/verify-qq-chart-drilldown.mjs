// Isolated native QQ renderer. Synthetic fixtures, all remote traffic blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stat, qqFrontMatches } from "../src/lib/quality-math.js";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const fronts = ["ND", "MIG", "PME", "ME"];
const source = [];
for (const front of fronts)
  for (const month of ["09", "10"])
    for (const day of ["01", "02", "08"])
      for (const login of ["A", "B", "C"]) {
        const qualified = login === "A" && day !== "08";
        const broken = login !== "C" && day !== "08";
        source.push({
          d: `2026-${month}-${day}`,
          lt: `${front}_${login}`,
          un: "NTL-DMV",
          ci: "Natal",
          cl: "RN",
          f: front === "PME" ? "ND" : front,
          gf: front,
          segment: front === "PME" ? "PME" : "",
          group: front === "ME" ? "ME" : "",
          b: Number(broken),
          c: !qualified
            ? null
            : day === "02"
              ? { TEC1: 1 / 3, GEO: 1 / 3, "Contato Cliente": 1 / 3 }
              : { TEC1: 1 },
          w: day === "08" ? "2" : "1",
          contract: `CONTRATO-${front}-${login}-${month}-${day}`,
          os: `OS-${front}-${login}-${month}-${day}`,
          wo: `WO-${front}-${login}-${month}-${day}`,
          baixa: "100",
          responsible: broken ? "TECNICO" : "SEM_QUEBRA",
          rawCategory: qualified ? "TEC1" : "",
          treatment: broken ? "COM QUEBRA DE AGENDA" : "SEM QUEBRA DE AGENDA",
          service: front === "ME" ? "MUDANÇA DE ENDEREÇO" : "INSTALAÇÃO",
          osGroup: front === "ME" ? "MUDANÇA DE ENDEREÇO" : "INSTALAÇÃO",
        });
      }
for (const front of fronts) {
  const original = source.find((row) => row.gf === front && row.d === "2026-10-01");
  source.push({
    ...original,
    lt: `${front}_OUTRA_CIDADE`,
    un: "FTZ-DMV_01",
    ci: "Fortaleza",
    cl: "CE",
    os: `${front}-CITY`,
    wo: `${front}-CITY`,
  });
  source.push({
    ...original,
    lt: `${front}_OUTRA_UNIDADE`,
    un: "PWM-DMV",
    os: `${front}-UNIT`,
    wo: `${front}-UNIT`,
  });
}
const initial = JSON.stringify(source);
const registry = Object.fromEntries(
  [...new Set(source.map((row) => row.lt))].map((login) => [
    login,
    {
      name: `Técnico teste ${login}`,
      supervisor: login.endsWith("_A")
        ? "Supervisor A"
        : login.endsWith("_B")
          ? "Supervisor B"
          : "",
    },
  ]),
);
let remoteRequests = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") {
      remoteRequests++;
      return route.abort();
    }
    if (url.pathname === "/qq-chart-check")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="pt-BR"><body style="margin:0"><div id="host" style="width:1600px;height:1000px;overflow:auto;container:quality-frame/size"></div></body></html>',
      });
    return route.continue();
  });
  await page.goto("http://127.0.0.1:5175/qq-chart-check");
  await page.evaluate(
    async ({ source, registry }) => {
      const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
      const { mountQQ } = await import("/src/components/quality/reference/qq-engine.js");
      const { qqStyle, qqMarkup } = await import("/src/components/quality/reference/templates.ts");
      const { default: interactionCSS } =
        await import("/src/components/quality/reference/qq-interactions.css?inline");
      const parent = {
        getSupervisorMap: () => registry,
        refreshUnifiedMonth() {},
        setUnifiedMonths() {},
        setUnifiedDates() {},
        applyUnifiedDates() {},
        clearUnifiedDates() {},
        show() {},
      };
      const scope = referenceScope(
        document.getElementById("host"),
        `${qqStyle}\n${interactionCSS}`,
        qqMarkup,
        parent,
        false,
        async () => {
          throw Error("No imports in chart QA");
        },
      );
      window.chartScope = scope;
      window.chartEngine = mountQQ(scope.environment);
      window.chartEngine.loadProjectData({ rows: source });
      window.chartEngine.setUnifiedUnits(["NTL-DMV"]);
    },
    { source, registry },
  );
  await page.locator('#host #cityStrip [data-city="Natal / Parnamirim"]').click();
  const normalized = await page.evaluate(() => window.chartEngine.getProjectState().rows);
  const root = page.locator("#host");
  const point = (period, metric, index = 0) =>
    root.locator(`[data-qq-chart="${period}:${metric}"] [data-front-point="${index}"]`);
  const close = () => root.locator("#catModalClose").click();
  const scope = (front, months = ["2026-10"], predicate = () => true) =>
    normalized.filter(
      (row) =>
        qqFrontMatches(row, front) &&
        row.un === "NTL-DMV" &&
        row.ci === "Natal" &&
        months.includes(row.d.slice(0, 7)) &&
        predicate(row),
    );
  let checked = 0;
  const checkModal = async (expected, metric) => {
    await root.locator("#catModal.on").waitFor({ state: "visible" });
    const total = stat(expected),
      key = metric === "q" ? "q" : "b";
    const negative = expected.filter((row) => stat([row])[key] > 0);
    const kpis = await root.locator("#catModal .modal-kpi b").allTextContents();
    assert.equal(kpis[2], `${expected.length} OS`);
    const rate = total[metric === "q" ? "pq" : "pb"];
    assert.equal(kpis[0], rate > 0 ? `${(rate * 100).toFixed(2).replace(".", ",")}%` : "");
    assert.equal(
      await root.locator("#catModal [data-glogin]").count(),
      new Set(negative.map((row) => row.lt)).size,
    );
    assert.match(
      await root.locator("#catModalTitle").innerText(),
      metric === "q" ? /%Qualificada/ : /%Quebra/,
    );
    assert.equal(
      await root.locator("#qqOnlyOffenders").innerText(),
      `Somente ofensores (${negative.length} O.S.)`,
    );
    await root.locator("#qqAllRecords").click();
    assert.equal(
      await root.locator("#catModal [data-glogin]").count(),
      new Set(expected.map((row) => row.lt)).size,
    );
    const first = root.locator("#catModal [data-glogin]").first();
    const login = await first.locator("td b").innerText();
    await first.click();
    assert.deepEqual(
      (await root.locator("#catModal [data-order] td:nth-child(3) b").allTextContents()).sort(),
      expected
        .filter((row) => row.lt === login)
        .map((row) => row.os)
        .sort(),
    );
    assert.equal(
      await root
        .locator("#qqOrderFields")
        .innerText()
        .then((text) => text.includes(expected.find((row) => row.lt === login).contract)),
      true,
    );
    await root.locator("#qqBackCategory").click();
    assert.equal(await root.locator("#qqAllRecords.active").isVisible(), true);
    await close();
    checked++;
  };
  for (const presenting of [false, true]) {
    await page.evaluate((on) => window.chartEngine.setUnifiedPresentation(on), presenting);
    for (const front of fronts) {
      await root.locator(`.tab[data-f="${front}"]`).click();
      const base = scope(front);
      assert.equal(await root.locator("[data-qq-chart]").count(), 4);
      for (const metric of ["q", "b"]) {
        await point("daily", metric).click();
        assert.match(await root.locator("#catModalTitle").innerText(), /01\/10\/2026/);
        await checkModal(
          base.filter((row) => row.d === "2026-10-01"),
          metric,
        );
        await point("weekly", metric).focus();
        await page.keyboard.press(metric === "q" ? "Enter" : "Space");
        assert.match(await root.locator("#catModalTitle").innerText(), /Semana 1 · 10\/2026/);
        await checkModal(
          base.filter((row) => row.w === "1"),
          metric,
        );
        // Zero-height bars remain clickable via their transparent target.
        await point("daily", metric, 2).locator(".qq-front-hit").click();
        assert.equal(await root.locator("#catModal .modal-empty").isVisible(), true);
        await checkModal(
          base.filter((row) => row.d === "2026-10-08"),
          metric,
        );
      }
    }
  }
  await page.evaluate(() => window.chartEngine.setUnifiedMonths(["2026-09", "2026-10"]));
  await root.locator('.tab[data-f="PME"]').click();
  for (const [index, month] of [
    [0, "2026-09"],
    [2, "2026-10"],
  ]) {
    await point("weekly", "q", index).click();
    await checkModal(
      scope("PME", [month], (row) => row.w === "1"),
      "q",
    );
  }
  await page.evaluate(() => {
    window.chartEngine.setUnifiedDates({ start: "2026-10-01", end: "2026-10-01" });
    window.chartEngine.setUnifiedSupervisors(["Supervisor A"]);
  });
  for (const front of fronts) {
    await root.locator(`.tab[data-f="${front}"]`).click();
    await point("weekly", "b").click();
    await checkModal(
      scope(front, ["2026-10"], (row) => row.d === "2026-10-01" && row.lt.endsWith("_A")),
      "b",
    );
  }
  await page.evaluate(() => {
    window.chartEngine.setUnifiedDates({ start: "", end: "" });
    window.chartEngine.setUnifiedPresentation(false);
  });
  // Keep the legacy Logins chart and O.S. drilldown intact.
  await root.locator('.tab[data-view="logins"]').click();
  assert.equal((await root.locator("[data-login-day]").count()) > 0, true);
  await root.locator("[data-login-day]").first().click();
  assert.equal(await root.locator("#catModal.on").isVisible(), true);
  await close();
  await page.evaluate(() => {
    window.chartEngine.setUnifiedPresentation(true);
    window.chartEngine.technetSlides.begin();
    window.chartEngine.technetSlides.show({
      panel: "qq",
      city: "Natal / Parnamirim",
      front: "MIG",
    });
    window.chartEngine.setUnifiedUnits(["NTL-DMV"]);
  });
  await point("daily", "b").click();
  await checkModal(
    scope("MIG", ["2026-09"], (row) => row.d === "2026-09-01"),
    "b",
  );
  await page.evaluate(() => {
    window.chartEngine.technetSlides.show({ panel: "qq", city: "Natal / Parnamirim", front: "ME" });
    window.chartEngine.setUnifiedUnits(["NTL-DMV"]);
  });
  await point("weekly", "q").click();
  await page.screenshot({ path: join(tmpdir(), "qq-front-chart-detail.png") });
  await close();
  assert.equal(JSON.stringify(source), initial);
  assert.equal(remoteRequests, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      fourFronts: true,
      dailyAndWeekly: true,
      qualifiedAndBreak: true,
      checked,
      multiMonthWeeks: true,
      zeroBars: true,
      filtersRespected: true,
      contractAndOrderDetails: true,
      keyboard: true,
      presentationAndSlides: true,
      legacyLoginPreserved: true,
      noRemoteRequests: true,
    }),
  );
} finally {
  await browser.close();
}
