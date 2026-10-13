// Native React integration: all Supabase traffic is intercepted, no production writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let role = "admin",
    directory = [],
    writes = 0;
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
    name: "Z1",
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
    if (table === "quality_supervisor_registry") output = null;
    if (table === "quality_technician_directory") {
      if (req.method() === "DELETE") {
        const login = url.searchParams.get("login")?.slice(3);
        directory = directory.filter((r) => r.login !== login);
        output = [{ login }];
        writes++;
      } else output = directory;
    }
    if (table === "save_quality_directory") {
      for (const row of input.p_entries) {
        directory = directory.filter((r) => r.login !== row.login);
        directory.push({ ...row, updated_at: new Date().toISOString() });
      }
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
    .getByRole("heading", { name: "Evolução mensal", exact: true })
    .waitFor()
    .catch(async (error) => {
      console.log(page.url(), await page.locator("body").innerText(), errors);
      throw error;
    });
  assert.equal(await page.locator("iframe").count(), 0);
  await page.getByRole("button", { name: "Logins e supervisores", exact: false }).click();
  await page.getByRole("button", { name: "Adicionar login", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const [field, value] of [
    ["Login", "Z1"],
    ["Nome", "Técnico nativo"],
    ["Cidade", "Natal"],
    ["Setor", "VT"],
    ["Supervisor", "Supervisor A"],
  ])
    await dialog.getByLabel(field, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await page.getByRole("cell", { name: "Técnico nativo", exact: true }).waitFor();
  assert.equal(directory[0].supervisor, "Supervisor A");
  await page.getByRole("button", { name: "Técnico certificado", exact: true }).click();
  await page.getByRole("button", { name: "Técnico nativo", exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Técnico nativo", exact: false }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/quality-native-light.png" });
  await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".quality-module button.bg-background"))
        .backgroundColor ===
      getComputedStyle(document.querySelector(".quality-card")).backgroundColor,
  );
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/quality-native-dark.png" });
  await page.getByRole("button", { name: "QQ · Visão geral", exact: true }).click();
  const agendaCount = () =>
    page
      .locator(".quality-metric")
      .filter({ hasText: "Agendas no recorte" })
      .locator("p")
      .nth(1)
      .innerText();
  assert.equal(await agendaCount(), "1");
  for (const unit of ["NTL-DMV_ADM", "NPA-DMV_MDU_VT", "OUTRA-UNIDADE"])
    assert.equal(await page.getByRole("cell", { name: unit, exact: true }).count(), 0);
  const unitFilter = page.getByRole("button", { name: /^Unidade de negócio:/ });
  await unitFilter.click();
  await page.getByRole("checkbox", { name: "NTL-DMV_ADM", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("cell", { name: "NTL-DMV_ADM", exact: true }).waitFor();
  assert.equal(await page.getByRole("cell", { name: "NTL-DMV", exact: true }).count(), 0);
  await unitFilter.click();
  await page
    .getByRole("checkbox", { name: "Todas as unidades (seleção explícita)", exact: true })
    .check();
  await page.keyboard.press("Escape");
  assert.equal(await agendaCount(), "4");
  await unitFilter.click();
  await page.getByRole("button", { name: "Voltar à Adesão", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await agendaCount(), "1");
  await page.getByRole("button", { name: /^Mês:/ }).click();
  await page
    .getByLabel("Buscar Mês", { exact: true })
    .locator("..")
    .getByRole("checkbox", { name: /^out\./i })
    .check();
  await page.keyboard.press("Escape");
  await page.getByLabel("Data inicial (agenda)", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Data final", { exact: true }).fill("2026-10-02");
  const filtersBefore = await page.locator("[data-quality-filter] button").allTextContents();
  const writesBeforeSlides = writes;
  await page.getByRole("button", { name: "Apresentação", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.locator("aside").isVisible(), false);
  await page.clock.install();
  await page.getByRole("button", { name: "Slides", exact: true }).click();
  const controls = page.getByRole("region", { name: "Controles de slides" });
  await controls
    .getByText("PAINEL DE QUEBRAS · 1 / 6", { exact: true })
    .waitFor()
    .catch(async (error) => {
      console.log("Slide startup:", await page.locator(".quality-module").innerText(), errors);
      throw error;
    });
  await page.clock.fastForward(30000);
  await controls.getByText("PAINEL DE QUEBRAS · 2 / 6", { exact: true }).waitFor();
  await controls.getByRole("button", { name: "Pausar slides", exact: true }).click();
  await page.clock.fastForward(60000);
  assert(await controls.getByText("PAINEL DE QUEBRAS · 2 / 6", { exact: true }).isVisible());
  await controls.getByRole("button", { name: "Continuar slides", exact: true }).click();
  await page.clock.fastForward(30000);
  await controls.getByText("PAINEL DE QUEBRAS · 3 / 6", { exact: true }).waitFor();
  for (let i = 0; i < 2; i++)
    await controls.getByRole("button", { name: "Próximo slide", exact: true }).click();
  await controls.getByText("QQ — VISÃO GERAL · 5 / 6", { exact: true }).waitFor();
  assert.equal(await controls.getByLabel("Tempo restante", { exact: true }).innerText(), "90 s");
  assert.equal(await agendaCount(), "1");
  for (const unit of ["NTL-DMV_ADM", "NPA-DMV_MDU_VT", "OUTRA-UNIDADE"])
    assert.equal(await page.getByRole("cell", { name: unit, exact: true }).count(), 0);
  await controls.getByRole("button", { name: "Próximo slide", exact: true }).click();
  await controls.getByText("TÉCNICO CERTIFICADO · 6 / 6", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Contexto dos slides" }).isVisible(), true);
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/quality-slides-tc-dark.png" });
  await page
    .getByRole("button", { name: /Técnico nativo/ })
    .first()
    .waitFor();
  assert.equal(await page.locator(".quality-tc-compact").count(), 1);
  await page.locator(".quality-module").focus();
  await page.keyboard.press("ArrowLeft");
  await controls.getByText("QQ — VISÃO GERAL · 5 / 6", { exact: true }).waitFor();
  await page.locator(".quality-module").focus();
  await page.keyboard.press("Space");
  await controls.getByRole("button", { name: "Continuar slides", exact: true }).waitFor();
  await page.keyboard.press("Space");
  await controls.getByRole("button", { name: "Pausar slides", exact: true }).waitFor();
  await page.locator(".quality-table tbody .quality-link").first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await controls.getByRole("button", { name: "Continuar slides", exact: true }).waitFor();
  await controls.getByRole("button", { name: "Continuar slides", exact: true }).click();
  await page.locator(".quality-table tbody .quality-link").first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await controls.getByRole("button", { name: "Continuar slides", exact: true }).click();
  await page.screenshot({ path: "C:/Users/Usuario/AppData/Local/Temp/quality-slides-dark.png" });
  await controls.getByRole("button", { name: "Encerrar slides", exact: true }).click();
  assert.deepEqual(
    await page.locator("[data-quality-filter] button").allTextContents(),
    filtersBefore,
  );
  assert.equal(
    await page.getByLabel("Data inicial (agenda)", { exact: true }).inputValue(),
    "2026-10-01",
  );
  assert.equal(await page.getByLabel("Data final", { exact: true }).inputValue(), "2026-10-02");
  assert.equal(writes, writesBeforeSlides);
  await page.getByRole("button", { name: "Sair da apresentação", exact: true }).click();
  await page.clock.resume();
  await page.reload();
  await page.getByRole("button", { name: "Logins e supervisores", exact: false }).click();
  await page.getByRole("cell", { name: "Técnico nativo", exact: true }).waitFor();
  if (process.argv.length > 2) {
    await page.getByRole("button", { name: "Importar cadastros", exact: true }).click();
    await page.locator("input[type=file][multiple]").setInputFiles(process.argv.slice(2));
    await page
      .getByRole("dialog")
      .getByText("165 com login · 90 sem login", { exact: true })
      .waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Salvar cadastros com login", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(directory.length, 166);
  }
  for (const mode of ["QQ · Adesão / Serviços", "QQ · Visão geral", "Técnico certificado"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.screenshot({
      path: `C:/Users/Usuario/AppData/Local/Temp/native-${mode.startsWith("Técnico") ? "tc" : mode.includes("Visão") ? "general" : "qq"}.png`,
    });
  }
  role = "supervisor";
  await page.reload();
  await page.getByRole("heading", { name: "QQ e Certificação", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Importar QQ (.xlsx)", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Logins e supervisores", exact: false }).click();
  assert.equal(await page.getByRole("button", { name: "Adicionar login", exact: true }).count(), 0);
  role = "controller";
  await page.reload();
  await page.waitForURL("**/escalas");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      nativeNoIframes: true,
      cadastroSaved: true,
      updatedInTC: true,
      reload: true,
      themes: true,
      presentation: true,
      slidesAndKeyboard: true,
      qqAdhesionDefault: true,
      explicitOtherUnits: true,
      filterRestoration: true,
      slidesNoDatabaseWrites: true,
      roles: true,
      directoryEntries: directory.length,
      mockedWrites: writes,
    }),
  );
} finally {
  await browser.close();
}
