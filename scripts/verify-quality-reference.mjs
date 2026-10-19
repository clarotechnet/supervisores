// Real browser QA of the original renderer, with synthetic data and no live DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { referenceParity } from "./quality-reference-parity.mjs";
import { verifyReferenceFilters } from "./quality-filter-regression.mjs";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const id = "00000000-0000-0000-0000-000000000001";
const qq = {
  d: "2026-10-01",
  lt: "Z1",
  un: "NTL-DMV",
  ci: "Natal",
  cl: "RN",
  f: "ND",
  gf: "ND",
  b: 1,
  c: { TEC1: 1 },
  w: "1",
  contract: "1",
  os: "OS1",
  wo: "WO1",
  baixa: "100",
  responsible: "TECNICO",
  rawCategory: "TEC1",
  treatment: "COM QUEBRA DE AGENDA",
  service: "INSTALACAO",
  osGroup: "INSTALACAO",
};
const tc = {
  login: "Z1",
  name: "Técnico de teste",
  company: "NTL-DMV",
  baseUnit: "NTL-DMV",
  mapSource: "base",
  qr: "0",
  tnum: "95",
  tden: "100",
  points: "127",
  day: "2026-10-01",
  month: 10,
  year: 2026,
  city: "Natal",
  sub: "Natal",
  group: "Instalação",
  type: "1",
  uf: "RN",
  wo: "WO1",
  finish: "01/10/2026 08:00:00",
  contract: "1",
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  noteAt: "01/10/2026",
};
const qqRecords = [
  qq,
  ...["NTL-DMV_ADM", "NPA-DMV_MDU_VT", "OUTRA-UNIDADE"].map((un, i) => ({
    ...qq,
    un,
    wo: `EXTRA${i}`,
    os: `EXTRA${i}`,
  })),
];
let role = "admin",
  directory = [],
  writes = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.routeWebSocket("**/realtime/**", (ws) => ws.close());
  await page.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      table = url.pathname.split("/").at(-1),
      input = req.postData() ? req.postDataJSON() : null;
    let output = [];
    if (table === "profiles")
      output = {
        id,
        role,
        status: "active",
        full_name: "Usuário de teste",
        email: "teste@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_imports") {
      const kind = url.searchParams.get("kind")?.slice(3);
      output = {
        id: kind,
        kind,
        source_file: "fixture",
        imported_by: id,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        row_count: kind === "quebra" ? qqRecords.length : 1,
        chunk_count: 1,
        metadata: {},
        base_import_id: null,
      };
    }
    if (table === "quality_quebra_data") output = [{ chunk_index: 0, records: qqRecords }];
    if (table === "quality_certification_data") output = [{ chunk_index: 0, records: [tc] }];
    if (table === "quality_technical_visit_data")
      output = [{ chunk_index: 0, records: [{ ...tc, wo: "VISIT-WO-1" }] }];
    if (table === "quality_supervisor_registry") output = null;
    if (table === "quality_technician_directory") output = directory;
    if (table === "save_quality_directory") {
      directory = input.p_entries;
      writes++;
      output = null;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(output),
    });
  });
  await page.addInitScript(
    ({ id }) => {
      const now = Math.floor(Date.now() / 1000),
        user = {
          id,
          email: "teste@example.invalid",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        };
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(
          JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: now + 3600 }),
        ) +
        ".test";
      localStorage.setItem(
        "sb-rwstmomeldwrjmczrmnp-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user,
        }),
      );
    },
    { id },
  );
  await page.goto("http://127.0.0.1:5175/qualidade");
  await page
    .locator("#referenceQQ #msg")
    .getByText("4 registros de QQ carregados do sistema.", { exact: true })
    .waitFor({ timeout: 15000 })
    .catch(async (e) => {
      console.log("Startup", errors, await page.locator("body").innerText());
      throw e;
    });
  assert.equal(await page.locator("iframe").count(), 0);
  assert.deepEqual(errors, []);
  await verifyReferenceFilters(page, true);
  assert.equal((await page.locator("#referenceQQ .reference-body svg").count()) > 2, true);
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/reference-qq.png" });
  await referenceParity(browser, page, "qq", "qq", qqRecords);
  await page.locator("#goGeneral").click();
  const general = page.locator("#referenceQQ #qqGeneralView");
  await general.getByText("QUEBRA QUALIFICADA — VISÃO GERAL", { exact: true }).waitFor();
  for (const unit of ["NTL-DMV_ADM", "NPA-DMV_MDU_VT", "OUTRA-UNIDADE"])
    assert.equal(
      (await general.locator(".gg-unit").allTextContents()).some((s) => s === unit),
      false,
    );
  await page.locator("#unitPicker summary").click();
  await page.locator('#unitOptions input[data-unit="NTL-DMV_ADM"]').check();
  await general.locator(".gg-unit").filter({ hasText: "NTL-DMV_ADM" }).first().waitFor();
  await page.locator("#unitOptions [data-adhesion-default]").click();
  await page.locator("#unitPicker summary").click();
  assert.equal(await general.locator(".gg-unit").filter({ hasText: "NTL-DMV_ADM" }).count(), 0);
  await general.locator("[data-general-bar]").first().click();
  await page.locator("#referenceQQ #catModal.on").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#referenceQQ #catModal.on").waitFor({ state: "hidden" });
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/reference-general.png" });
  await referenceParity(browser, page, "qq", "general", qqRecords);
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #panelView")
    .getByText("Técnico de teste", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#monthPickerLabel").innerText(), "Todos os meses");
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/reference-tc.png" });
  await referenceParity(browser, page, "tc", "tc", [tc]);
  await page.locator("#referenceTC #tabDaily").click();
  await page.locator("#referenceTC #dailyView").waitFor({ state: "visible" });
  await page.locator("#referenceTC #tabPanel").click();
  await page.locator("#referenceTC .tc-metric-link").first().click();
  await page.locator("#referenceTC #modal.show").waitFor();
  await page.locator("#referenceTC #modalClose").click();
  await page.locator("#referenceTC #modal.show").waitFor({ state: "hidden" });
  await page.locator("#goSupervisors").click();
  await page.getByRole("button", { name: "Adicionar login", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const [field, value] of [
    ["Login", "Z1"],
    ["Nome", "Técnico cadastrado"],
    ["Cidade", "Natal"],
    ["Setor", "Adesão"],
    ["Supervisor", "Supervisor A"],
  ])
    await dialog.getByLabel(field, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await page.getByRole("cell", { name: "Técnico cadastrado", exact: true }).waitFor();
  assert.equal(directory[0].supervisor, "Supervisor A");
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #panelView")
    .getByText("Técnico cadastrado", { exact: true })
    .waitFor();
  await page
    .locator("#referenceTC #panelView")
    .getByText("Supervisor A", { exact: true })
    .waitFor();
  await page.locator("#goGeneral").click();
  await page.locator("#datePicker summary").click();
  await page.locator("#periodStart").fill("2026-10-01");
  await page.locator("#periodEnd").fill("2026-10-02");
  await page.locator("#periodApply").click();
  await page.locator("#goFS").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.locator("aside").first().isVisible(), false);
  await page.clock.install();
  await page.locator("#goSlides").click();
  await page.locator("#slidePlayer").waitFor({ state: "visible" });
  assert.equal(await page.locator("#slidesPosition").innerText(), "1 / 6");
  await page.locator('#referenceQQ [data-qq-chart="daily:q"] [data-front-point]').first().click();
  await page.locator("#referenceQQ #catModal.on").waitFor({ state: "visible" });
  assert.equal(await page.locator("#slidesState").innerText(), "Pausado");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".quality-reference.presenting").isVisible(), true);
  await page.locator("#slidesPause").click();
  await page.clock.fastForward(30000);
  await page.locator("#slidesPosition").getByText("2 / 6", { exact: true }).waitFor();
  await page.locator("#slidesPause").click();
  await page.clock.fastForward(60000);
  assert.equal(await page.locator("#slidesPosition").innerText(), "2 / 6");
  for (let i = 0; i < 4; i++) await page.locator("#slidesNext").click();
  await page.locator("#slidesPosition").getByText("6 / 6", { exact: true }).waitFor();
  await page
    .locator("#referenceTC #panelView")
    .getByText("Supervisor A", { exact: true })
    .waitFor();
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/reference-slide-tc.png" });
  await page.locator(".quality-reference").focus();
  await page.keyboard.press("ArrowLeft");
  await page.locator("#slidesPosition").getByText("5 / 6", { exact: true }).waitFor();
  assert.equal(await page.locator("#slidesCountdown").innerText(), "90 s");
  await page.locator("#slidesStop").click();
  assert.equal(await general.isVisible(), true);
  await page.locator("#goFS").click();
  await page.clock.resume();
  assert.equal(writes, 1);
  await page.locator("#datePicker summary").click();
  assert.equal(await page.locator("#periodStart").inputValue(), "2026-10-01");
  assert.equal(await page.locator("#periodEnd").inputValue(), "2026-10-02");
  directory[0].sector = "Visita técnica";
  await page.goto("http://127.0.0.1:5175/visita-tecnica");
  await page
    .locator("#referenceTC #panelView")
    .getByText("Técnico cadastrado", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#goQQ").isVisible(), false);
  assert.equal(await page.locator("#goGeneral").isVisible(), false);
  role = "supervisor";
  await page.goto("http://127.0.0.1:5175/qualidade");
  await page.reload();
  await page
    .locator("#referenceQQ #msg")
    .getByText("4 registros de QQ carregados do sistema.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#referenceQQ #drop").isVisible(), false);
  assert.equal(await page.locator("#referenceQQ #file").isDisabled(), true);
  await page.locator("#goSupervisors").click();
  assert.equal(await page.getByRole("button", { name: "Adicionar login", exact: true }).count(), 0);
  role = "controller";
  await page.reload();
  await page.waitForURL("**/escalas");
  assert.deepEqual(errors, []);
  console.log({
    originalDOM: true,
    originalSVG: true,
    noIframes: true,
    cadastros: true,
    defaultAdhesion: true,
    slides: true,
    filtersRestored: true,
    roles: true,
    writes,
  });
} finally {
  await browser.close();
}
