// Native presentation QA. Synthetic records only; all remote traffic is mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const actor = "00000000-0000-0000-0000-000000000001";
const logins = ["A", "B", "U", "VA", "VB", "VU"];
const directory = logins.map((login) => ({
  login,
  full_name: `Técnico teste ${login}`,
  city: login.endsWith("U") ? "Recife" : "NATAL/PARNAMIRIM",
  sector: login.startsWith("V") ? "Visita técnica" : "ADESÃO/SERVIÇOS",
  supervisor: login.endsWith("U") ? "" : `Supervisor ${login.at(-1)}`,
}));
const tc = logins.flatMap((login, index) =>
  [9, 10].map((month) => ({
    login,
    name: `Técnico teste ${login}`,
    company: "NTL-DMV",
    baseUnit: index % 3 === 1 ? "PWM-DMV" : "NTL-DMV",
    mapSource: "base",
    qr: "0",
    tnum: "95",
    tden: "100",
    points: String(175 + index),
    day: `2026-${month}-01`.replace("2026-9-", "2026-09-"),
    month,
    year: 2026,
    city: login.endsWith("U") ? "Recife" : "Natal",
    sub: "Natal",
    group: "Instalação",
    type: "1",
    uf: "RN",
    wo: `WO-${login}-${month}`,
    finish: `01/${month}/2026 08:00:00`,
    contract: `${login}-${month}`,
    orders: "",
    lowCodes: "100",
    revisitWo: "",
    noteAt: `01/${month}/2026`,
  })),
);
const qq = tc
  .filter((row) => !row.login.startsWith("V"))
  .map((row) => ({
    d: row.day,
    lt: row.login,
    un: row.baseUnit,
    ci: row.city,
    cl: "RN",
    f: "ND",
    gf: "ND",
    b: 1,
    c: { TEC1: 1 },
    w: "1",
    contract: row.contract,
    os: row.wo,
    wo: row.wo,
    baixa: "100",
    responsible: "TECNICO",
    rawCategory: "TEC1",
    treatment: "COM QUEBRA DE AGENDA",
    service: "INSTALACAO",
    osGroup: "INSTALACAO",
  }));
const source = JSON.stringify({ qq, tc, directory });
let writes = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.routeWebSocket("**/*", (ws) => ws.close());
  await page.addInitScript(
    ({ actor }) => {
      const now = Math.floor(Date.now() / 1000);
      const user = {
        id: actor,
        email: "qa@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      const jwt = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: actor, aud: "authenticated", role: "authenticated", exp: now + 3600 }))}.mock`;
      localStorage.setItem(
        "sb-rwstmomeldwrjmczrmnp-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "mock",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user,
        }),
      );
    },
    { actor },
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    if (request.method() !== "GET") writes++;
    const table = url.pathname.split("/").at(-1);
    let body = [];
    if (table === "profiles")
      body = {
        id: actor,
        role: "admin",
        status: "active",
        full_name: "QA local",
        email: "qa@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_supervisor_registry") body = null;
    if (table === "quality_technician_directory") body = directory;
    if (table === "quality_imports") {
      const kind = url.searchParams.get("kind")?.slice(3);
      body = {
        id: kind,
        kind,
        source_file: "synthetic",
        imported_by: actor,
        created_at: "2026-10-01T00:00:00Z",
        published_at: "2026-10-01T00:00:00Z",
        row_count: kind === "quebra" ? qq.length : tc.length,
        chunk_count: 1,
        metadata: {},
        base_import_id: null,
      };
    }
    if (table === "quality_quebra_data") body = [{ chunk_index: 0, records: qq }];
    if (["quality_certification_data", "quality_technical_visit_data"].includes(table))
      body = [{ chunk_index: 0, records: tc }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const picker = page.locator("#supervisorPicker");
  const option = (name) => page.locator(`#supervisorOptions input[data-supervisor="${name}"]`);
  const label = (name) =>
    page.locator(`#supervisorOptions label:has(input[data-supervisor="${name}"])`);
  const all = () => page.locator("#supervisorOptions input[data-supervisor-all]");
  const results = () =>
    page.locator("#referenceTC #tbody tr[data-i]").evaluateAll((rows) =>
      rows.map((row) => ({
        login: row.querySelector(".tc-identity-sub").textContent.split(" · ")[0].trim(),
        values: [...row.querySelectorAll("[data-indicator]")].map((cell) =>
          cell.textContent.trim(),
        ),
        certified: row.querySelector("[data-current-state]").dataset.currentState,
      })),
    );
  const ensureOpen = async () => {
    if (!(await picker.evaluate((el) => el.open))) await picker.locator("summary").click();
  };
  for (const vt of [false, true]) {
    await page.goto(`http://127.0.0.1:5175/${vt ? "visita-tecnica" : "qualidade"}`);
    if (!vt) await page.locator("#goTC").click();
    await page
      .locator("#referenceTC #fileMeta")
      .getByText("6 registros de TC carregados do sistema.", { exact: true })
      .waitFor({ state: "attached" });
    assert.equal(await picker.isVisible(), false, "No normal-layout change");
    const baseline = await results();
    assert.equal(baseline.length, 3);
    await page.locator("#goFS").click();
    await picker.waitFor({ state: "visible" });
    assert.equal(await page.locator("#referenceTC #tcSupervisorControls").isVisible(), false);
    await ensureOpen();
    const menu = await page.locator("#supervisorOptions").boundingBox();
    assert(menu.x >= 0 && menu.x + menu.width <= 1920);
    assert(menu.y >= 0 && menu.y + menu.height <= 1080);
    await label("Supervisor A").click();
    assert.equal((await results()).length, 1);
    assert.deepEqual(
      (await results())[0],
      baseline.find((row) => row.login === (vt ? "VA" : "A")),
      "Unchanged calculations for the same technician",
    );
    assert.equal(await picker.evaluate((el) => el.open), true, "Label remains inside the popover");
    await label("Supervisor B").click();
    assert.equal(await page.locator("#supervisorPickerLabel").innerText(), "2 supervisores");
    assert.equal((await results()).length, 2);
    await option("Supervisor A").uncheck();
    assert.equal((await results())[0].login, vt ? "VB" : "B");
    await option("Supervisor A").focus();
    await page.keyboard.press("Space");
    assert.equal((await results()).length, 2);
    assert.equal(
      await option("Supervisor A").evaluate((input) => document.activeElement === input),
      true,
      "Keyboard focus survives redraw",
    );
    await page.keyboard.press("Space");
    assert.equal((await results()).length, 1);
    await label("Supervisor A").click();
    await option("Supervisor B").uncheck();
    await page.locator('#referenceTC #presentationCityStrip [data-city="Recife"]').click();
    assert.equal((await results()).length, 0, "Missing team in a city never expands to everyone");
    await ensureOpen();
    assert.equal(await option("Supervisor A").isChecked(), true);
    await all().check();
    assert.equal((await results())[0].login, vt ? "VU" : "U");
    await label("Sem supervisor").click();
    assert.equal((await results()).length, 1);
    await all().check();
    await page.locator('#referenceTC #presentationCityStrip [data-city=""]').click();
    await ensureOpen();
    await label("Supervisor A").click();
    await page.locator("#monthPicker summary").click();
    assert.equal(await picker.evaluate((el) => el.open), false, "Exclusive filters");
    await page.locator('#monthOptions input[data-month="2026-09"]').uncheck();
    assert.equal((await results()).length, 1);
    await page.locator("#monthPicker summary").click();
    await page.locator("#datePicker summary").click();
    await page.locator("#periodStart").fill("2026-10-01");
    await page.locator("#periodEnd").fill("2026-10-01");
    await page.locator("#periodApply").click();
    assert.equal((await results()).length, 1);
    await ensureOpen();
    await page.keyboard.press("Escape");
    assert.equal(await picker.evaluate((el) => el.open), false);
    assert.equal(await page.locator(".quality-reference.presenting").isVisible(), true);
    await ensureOpen();
    await page.locator("#referenceTC #kCert").click();
    assert.equal(
      await picker.evaluate((el) => el.open),
      false,
      "Shadow DOM click dismisses the menu",
    );
    if (vt) await page.screenshot({ path: join(tmpdir(), "vt-presentation-supervisor.png") });
    await page.locator("#goSlides").click();
    await page.locator("#slidePlayer").waitFor({ state: "visible" });
    assert.equal(await picker.isVisible(), false);
    if (!vt) {
      await page.locator("#slidesPause").click();
      for (let i = 0; i < 5; i++) await page.locator("#slidesNext").click();
    }
    assert.equal(
      await page.locator("#slidesContext").innerText(),
      "Natal / Parnamirim · Supervisor A",
    );
    assert.equal((await results()).length, 1, "Slides only include the selected supervisor");
    await page.locator("#slidesStop").click();
    assert.equal(await page.locator("#supervisorPickerLabel").innerText(), "Supervisor A");
    if (!vt) {
      await page.locator("#goQQ").click();
      await page.locator("#referenceQQ #view").waitFor({ state: "visible" });
      await ensureOpen();
      await label("Supervisor A").click();
      const base = () =>
        page.locator("#referenceQQ .kpi").filter({ hasText: "BASE ·" }).locator("b").innerText();
      assert.equal(await base(), "1");
      await label("Supervisor B").click();
      assert.equal(await base(), "2");
      await page.locator("#goGeneral").click();
      assert.match(await page.locator("#referenceQQ .gg-heading small").innerText(), /2 O\.S\./);
      await ensureOpen();
      await all().check();
      assert.match(await page.locator("#referenceQQ .gg-heading small").innerText(), /3 O\.S\./);
      await label("Sem supervisor").click();
      assert.match(await page.locator("#referenceQQ .gg-heading small").innerText(), /1 O\.S\./);
      await all().check();
      await label("Supervisor A").click();
      await page.locator("#goSupervisors").click();
      assert.equal(await picker.isVisible(), false);
      await page.locator("#goGeneral").click();
      assert.equal(await page.locator("#supervisorPickerLabel").innerText(), "Supervisor A");
      await page.setViewportSize({ width: 1366, height: 768 });
      // Let fullscreen/layout and the popover's ResizeObserver finish before
      // measuring; otherwise this can read the previous 1920px position.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await ensureOpen();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      const responsiveMenu = await page.locator("#supervisorOptions").boundingBox();
      assert(
        responsiveMenu.x >= 0 && responsiveMenu.x + responsiveMenu.width <= 1366,
        JSON.stringify(responsiveMenu),
      );
      assert(responsiveMenu.y >= 0 && responsiveMenu.y + responsiveMenu.height <= 768);
      await page.screenshot({ path: join(tmpdir(), "qq-presentation-supervisor.png") });
      await picker.locator("summary").click();
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
    await page.evaluate(() => document.exitFullscreen());
    await page.locator(".quality-reference.presenting").waitFor({ state: "hidden" });
    assert.equal(await picker.isVisible(), false);
  }
  assert.equal(writes, 0, "No database writes");
  assert.equal(JSON.stringify({ qq, tc, directory }), source, "Datasets are unchanged");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      presentationSupervisors: true,
      multiSelect: true,
      normalTC: true,
      technicalVisit: true,
      qqAndGeneral: true,
      slidesRespectSelection: true,
      calculationsPreserved: true,
      writes,
    }),
  );
} finally {
  await browser.close();
}
