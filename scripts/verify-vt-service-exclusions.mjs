// Native TC UI with synthetic data; imports and external traffic are blocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runtime = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = runtime("playwright");
const url = process.env.QUALITY_QA_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let writes = 0,
  externalRequests = 0;
try {
  for (const technicalVisit of [true, false]) {
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
      if (target.pathname === "/vt-service-check")
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="pt-BR"><body style="margin:0"><div id="host" style="height:100vh;overflow:auto;container:quality-frame/size"></div></body></html>',
        });
      return route.continue();
    });
    await page.goto(`${url}/vt-service-check`);
    await page.evaluate(
      async ({ technicalVisit }) => {
        const { technicalVisitState, nonTechnicalVisitState } =
          await import("/src/lib/technical-visit-scope.ts");
        const { directoryIndex, hydrateQuality } = await import("/src/lib/quality-directory.ts");
        const { referenceScope } = await import("/src/components/quality/reference-scope.ts");
        const { mountTC } = await import("/src/components/quality/reference/tc-engine.js");
        const { tcStyle, tcMarkup } =
          await import("/src/components/quality/reference/templates.ts");
        const services = [
          "Mudanca de Endereco",
          "Instalacao",
          "Mudanca de Pacote",
          "INST GPON - INST CABO",
          "Troca de Equipamento Streaming",
        ];
        const make = (login, service, wo, day = "05", points = "175", extra = {}) => ({
          login,
          service,
          wo,
          name: `Técnico ${login}`,
          city: login === "EXCLUDED" ? "Recife" : "Natal",
          company: "NTL-DMV_VT",
          baseUnit: "NTL-DMV_VT",
          mapSource: "base",
          qr: "0",
          tnum: "95",
          tden: "100",
          points,
          day: `2026-11-${day}`,
          finish: `${day}/11/2026 08:00:00`,
          noteAt: "15/11/2026",
          month: 11,
          year: 2026,
          sub: "Natal",
          uf: "RN",
          group: "Instalação",
          type: "1",
          contract: wo,
          orders: "",
          lowCodes: "100",
          revisitWo: "",
          ...extra,
        });
        const rows = [
          make("VT-A", "Visita Tecnica", "VALID-A", "05", "200"),
          make("VT-A", "Reparo", "VALID-B", "07", "150"),
          make("VT-B", "Vistoria de Instalacao", "SIMILAR"),
          make("VT-C", "", "EMPTY"),
          ...services.map((service, i) =>
            make("VT-A", service, `BLOCK-${i}`, "06", "9000", { qr: "1", tnum: "0", tden: "1000" }),
          ),
          ...services.map((service, i) => make("EXCLUDED", service, `EXCLUDED-${i}`, "06")),
          ...services.map((service, i) => make("QQ", service, `QQ-${i}`, "06", "200")),
        ];
        const directory = ["VT-A", "VT-B", "VT-C", "EXCLUDED", "QQ"].map((login) => ({
          login,
          full_name: `Técnico ${login}`,
          city: login === "EXCLUDED" ? "Recife" : "Natal",
          sector: login === "QQ" ? "Adesão/Serviços" : "Visita técnica",
          supervisor: login === "EXCLUDED" ? "Equipe excluída" : "Equipe A",
        }));
        const registry = Object.fromEntries(
          directory.map((p) => [p.login, { name: p.full_name, supervisor: p.supervisor }]),
        );
        const state = {
          datasets: { technical_visit: { records: rows }, certification: { records: rows } },
          imports: {},
          registry,
        };
        window.vtSource = state;
        window.vtSourceOriginal = JSON.stringify(state);
        const scoped = technicalVisit
          ? technicalVisitState(state, directoryIndex(directory))
          : nonTechnicalVisitState(state, directoryIndex(directory));
        const hydrated = hydrateQuality(
          scoped,
          directory,
          technicalVisit ? "technical_visit" : "certification",
        );
        const scope = referenceScope(
          document.getElementById("host"),
          tcStyle,
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
        window.vtEngine = mountTC(scope.environment);
        window.vtEngine.loadProjectData({ rows: hydrated.tc });
        window.vtEngine.setUnifiedMonths(["2026-11"]);
      },
      { technicalVisit },
    );
    const root = page.locator("#host");
    const state = await page.evaluate(() => ({
      rows: window.vtEngine.getProjectState().rows.map((r) => ({ wo: r.wo, service: r.service })),
      results: window.vtEngine
        .getProjectState()
        .result.map((r) => ({
          login: r.loginText,
          os: r.os,
          points: r.points,
          days: [...r.days],
          prod: r.prod,
          tnum: r.tnum,
          tden: r.tden,
          revisit: r.revisit,
          tec1: r.tec1,
          status: r.status,
        })),
      slides: window.vtEngine.technetSlides.list(),
    }));
    if (technicalVisit) {
      assert.deepEqual(
        state.rows.map((r) => r.wo),
        ["VALID-A", "VALID-B", "SIMILAR", "EMPTY"],
      );
      assert.equal(state.results.length, 3);
      const a = state.results.find((r) => r.login === "VT-A");
      assert.deepEqual(a, {
        login: "VT-A",
        os: 2,
        points: 350,
        days: ["2026-11-05", "2026-11-07"],
        prod: 175,
        tnum: 190,
        tden: 200,
        revisit: 0,
        tec1: 0.95,
        status: true,
      });
      assert.equal(
        state.slides.some((s) => s.supervisor === "Equipe excluída"),
        false,
      );
      const prod = root.locator(
        '#tbody tr:has([data-tc-current-login="VT-A"]) td[data-month="2026-11"][data-indicator="prod"] button',
      );
      assert.equal(await prod.evaluate((el) => el.classList.contains("good")), true);
      await prod.click();
      assert.doesNotMatch(await root.locator("#modalBody").innerText(), /BLOCK-|EXCLUDED-/);
      assert.match(await root.locator("#modalBody").innerText(), /175/);
      await root.locator("#modalClose").click();
      await root.locator("#tabDaily").click();
      await root.locator('.metricbtn[data-metric="prod"]').click();
      assert.match(
        await root
          .locator('#matrix tbody tr:has-text("Técnico VT-A") td.avg')
          .getAttribute("class"),
        /cellgood/,
      );
      await root.locator("#tabPanel").click();
      await page.evaluate(() =>
        window.vtEngine.setUnifiedDates({ start: "2026-11-06", end: "2026-11-06" }),
      );
      assert.equal(
        await page.evaluate(() => window.vtEngine.getProjectState().result.length),
        0,
        "excluded-only day cannot create points or productive days",
      );
      await page.evaluate(() => window.vtEngine.setUnifiedDates({ start: "", end: "" }));
      await root.locator('#tcSupervisorControls [data-sv-mode="supervisor"]').click();
      assert.doesNotMatch(await root.locator("#tcSupervisorTable").innerText(), /Equipe excluída/);
      await root.locator('#tcSupervisorControls [data-sv-mode="technician"]').click();
    } else {
      assert.equal(state.rows.length, 5);
      assert.equal(state.results[0].login, "QQ");
      assert.equal(state.results[0].points, 1000);
      assert.equal(state.results[0].os, 5);
      assert.equal(
        new Set(state.rows.map((r) => r.service)).size,
        5,
        "QQ retains all five services",
      );
    }
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.vtSource) === window.vtSourceOriginal),
      true,
    );
    await page.evaluate(() => window.vtEngine.setUnifiedPresentation(true));
    await page.screenshot({
      path: join(tmpdir(), `vt-service-exclusion-${technicalVisit ? "vt" : "qq"}.png`),
      fullPage: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  assert.equal(externalRequests, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        vtExcludedServices: 5,
        sourcePreserved: true,
        qqUnchanged: true,
        totalsAndDailyProductivity: true,
        contractsSupervisorsAndPresentation: true,
        writes,
        externalRequests,
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
