// Full native UI workflow. Every remote read/write is intercepted and synthetic.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const actor = "00000000-0000-0000-0000-000000000001";
const tcRow = {
  login: "Z1",
  name: "QA Técnico",
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
  wo: "SEED",
  finish: "01/10/2026 08:00:00",
  contract: "SEED",
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  noteAt: "01/10/2026",
};
const slaRow = {
  DAT_NOTA: "01/10/2026",
  DAT_BAIXA: "01/09/2026",
  NUM_CONTA: "C1",
  COD_OS: "OS1",
  DSC_MUNICIPIO_BI: "Fortaleza",
  DSC_SGL_ESTADO: "CE",
  DSC_CLUSTER_BI: "Fortaleza",
  DSC_UNIDADE_NEGOCIO_UNIF: "FTZ-DMV_01",
  UN: "FTZ-DMV_01",
  DSC_TIPO_ORDEM_SERVICO: "INSTALAÇÃO",
  COD_LOGIN_TECNICO: "Z1",
  DSC_QUALIFICADOR_OS: "COM PADRAO",
  QTD_OS_ATEND_PADRAO: 1,
  QTD_LOG_OS_VT: 0,
  QTD_TAREFAS: 2,
};
const slaRows = [
  slaRow,
  {
    ...slaRow,
    NUM_CONTA: "C2",
    COD_OS: "OS2",
    DSC_QUALIFICADOR_OS: "SEM PADRAO",
    QTD_OS_ATEND_PADRAO: 0,
    QTD_LOG_OS_VT: 1,
    QTD_TAREFAS: 3,
  },
];
const csv = (rows) => {
  const headers = Object.keys(rows[0]);
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "")).join(";")),
  ].join("\r\n");
};
const seedManifest = {
  id: "tc-seed",
  kind: "certification",
  source_file: "seed.csv",
  imported_by: actor,
  created_at: new Date().toISOString(),
  published_at: new Date().toISOString(),
  row_count: 1,
  chunk_count: 1,
  metadata: {},
  base_import_id: null,
};
let qualityImports = [seedManifest],
  qualityBlocks = [{ import_id: seedManifest.id, chunk_index: 0, records: [tcRow] }],
  slaImports = [],
  slaBlocks = [],
  role = "admin",
  failTC = true,
  failSLA = false,
  incompleteSLA = false,
  missingSLA = false;
let slaReads = 0,
  qqReads = 0;
let directoryRecords = [
  {
    login: "Z1",
    full_name: "QA Técnico",
    city: "NATAL/PARNAMIRIM",
    sector: "ADESÃO/SERVIÇOS",
    supervisor: "QA Supervisor",
  },
];
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.addInitScript(
    ({ actor }) => {
      const now = Math.floor(Date.now() / 1000),
        user = {
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    const table = url.pathname.split("/").at(-1),
      body = request.postData() ? request.postDataJSON() : null;
    let result = [],
      status = 200;
    if (table === "profiles")
      result = {
        id: actor,
        role,
        status: "active",
        full_name: "QA local",
        email: "qa@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_supervisor_registry") result = null;
    if (table === "quality_technician_directory") result = directoryRecords;
    if (table === "save_quality_directory") {
      for (const entry of body.p_entries) {
        directoryRecords = [...directoryRecords.filter((row) => row.login !== entry.login), entry];
      }
      result = null;
    }
    if (table === "quality_imports" || table === "sla_warranty_imports") {
      const sla = table.startsWith("sla");
      let list = sla ? slaImports : qualityImports;
      if (request.method() === "POST") {
        result = {
          ...body,
          id: randomUUID(),
          created_at: new Date().toISOString(),
          published_at: null,
        };
        list.push(result);
      } else if (request.method() === "DELETE") {
        list = list.filter(
          (row) => row.id !== url.searchParams.get("id")?.slice(3) || row.published_at,
        );
        if (sla) slaImports = list;
        else qualityImports = list;
        result = null;
      } else {
        const kind = url.searchParams.get("kind")?.slice(3);
        if (sla) slaReads++;
        else if (kind === "quebra") qqReads++;
        result =
          list.filter((row) => row.published_at && (sla || row.kind === kind)).at(-1) ?? null;
      }
    }
    if (table === "quality_certification_data" || table === "sla_warranty_data") {
      const sla = table.startsWith("sla");
      const list = sla ? slaBlocks : qualityBlocks;
      if (request.method() === "POST") {
        list.push({ ...body, records: canonical(body.records) });
        result = null;
      } else {
        const bounds = url.searchParams.getAll("chunk_index");
        const low = Number(bounds.find((v) => v.startsWith("gte."))?.slice(4) ?? 0),
          high = Number(bounds.find((v) => v.startsWith("lt."))?.slice(3) ?? 99999);
        result = list
          .filter(
            (row) =>
              row.import_id === url.searchParams.get("import_id")?.slice(3) &&
              (!sla || row.source === url.searchParams.get("source")?.slice(3)) &&
              row.chunk_index >= low &&
              row.chunk_index < high,
          )
          .sort((a, b) => a.chunk_index - b.chunk_index);
      }
    }
    if (table === "publish_quality_import" || table === "publish_sla_warranty_import") {
      const sla = table === "publish_sla_warranty_import";
      if (sla ? failSLA : failTC) {
        status = 500;
        result = { code: "57014", message: "Falha simulada na publicação" };
      } else {
        const list = sla ? slaImports : qualityImports;
        const manifest = list.find((row) => row.id === body.p_import_id);
        assert(manifest);
        manifest.published_at = new Date().toISOString();
        result = null;
      }
    }
    if (request.method() === "GET" && table === "sla_warranty_data" && incompleteSLA) result = [];
    if (request.method() === "GET" && table === "sla_warranty_imports" && missingSLA) {
      status = 404;
      result = { code: "PGRST205", message: "SLA table is not installed" };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto("http://127.0.0.1:5175/qualidade");
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("1 registros", { exact: false })
    .waitFor({ state: "attached" });
  const initialQQReads = qqReads;
  assert.equal(slaReads, 0, "SLA is lazy and never blocks QQ/TC");
  const tcHeaders =
    "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO";
  const tcFile = {
    name: "tc-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      tcHeaders +
        "\n" +
        Array.from(
          { length: 10 },
          (_, i) =>
            `Z1;0;95;100;127;01/10/2026 08:00:00;01/10/2026;Natal;Natal;Instalação;1;RN;NEW-${i};NTL-DMV`,
        ).join("\n"),
    ),
  };
  await page.locator("#referenceTC #fileInput").setInputFiles(tcFile);
  await page.getByRole("alert").filter({ hasText: "A importação não foi concluída" }).waitFor();
  assert.equal(qualityImports.filter((row) => row.published_at).length, 1);
  assert.match(await page.locator("#referenceTC #fileMeta").innerText(), /^1 registros/);
  failTC = false;
  await page.locator("#referenceTC #fileInput").setInputFiles(tcFile);
  await page
    .getByRole("status", { name: "Resumo da importação TC" })
    .filter({ hasText: "Base atualizada" })
    .waitFor();
  assert.equal(qualityImports.filter((row) => row.published_at).at(-1).row_count, 11);
  await page.locator("#referenceTC #fileInput").setInputFiles(tcFile);
  await page
    .getByRole("status", { name: "Resumo da importação TC" })
    .filter({ hasText: "Sem alterações" })
    .waitFor();
  assert.equal(qualityImports.filter((row) => row.published_at).length, 2);
  assert.equal(qqReads, initialQQReads, "A TC import does not refetch/wait for QQ");
  const originalTC = JSON.stringify(qualityImports.filter((row) => row.published_at));
  await page.locator("#goSLA").click();
  await page.locator("#referenceSLA #kTotal").waitFor({ state: "visible" });
  assert.equal(await page.locator("#goTC").getAttribute("class"), "");
  assert.equal(await page.locator("#unitPicker").isVisible(), false);
  assert.equal(
    await page.locator("#referenceSLA .eyebrow").innerText(),
    "QUALIDADE DE ATENDIMENTO",
  );
  await page.locator("#goFS").click();
  await page.locator("#referenceSLA .sla-presenting").waitFor();
  assert.equal(await page.locator("#referenceSLA .sla-system-controls").isVisible(), false);
  assert.equal(
    await page.locator("#referenceSLA .sla-system-status [role=status]").isVisible(),
    false,
  );
  assert.equal(await page.locator("#referenceSLA .sla-mini-filter").count(), 10);
  assert.equal(await page.locator('#referenceSLA label[for="fileInput"]').isVisible(), false);
  await page.locator("#goFS").click();
  await page.locator("#referenceSLA .sla-system-controls").waitFor();
  const slaFile = { name: "sla.csv", mimeType: "text/csv", buffer: Buffer.from(csv(slaRows)) };
  await page.locator("#referenceSLA #fileInput").setInputFiles(slaFile);
  await page
    .locator("#referenceSLA .sla-system-status")
    .getByText("SLA atualizado", { exact: false })
    .waitFor();
  await page.locator("#referenceSLA #kSlaValue").getByText("33,33%", { exact: true }).waitFor();
  const identities = page.locator("#referenceSLA #techBody");
  assert.match(await identities.innerText(), /QA Técnico/);
  assert.match(await identities.innerText(), /Login: Z1/);
  assert.match(await identities.innerText(), /Supervisor: QA Supervisor/);
  assert.match(await page.locator("#referenceSLA #techChart").innerText(), /QA Técnico/);
  assert.match(
    await page
      .locator("#referenceSLA #techChart g[role=button]")
      .first()
      .getAttribute("aria-label"),
    /Supervisor: QA Supervisor/,
  );
  const identityImportCount = slaImports.length;
  await page.locator("#referenceSLA #fMonth").selectOption("2026/10");
  await page.locator("#goSupervisors").click();
  await page.getByRole("button", { name: "Editar Z1", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar login" });
  await edit.getByLabel("Nome", { exact: true }).fill("QA Técnico Atualizado");
  await edit.getByLabel("Supervisor", { exact: true }).fill("Nova QA Supervisora");
  await edit.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  await page.locator("#goSLA").click();
  await identities.getByText("QA Técnico Atualizado", { exact: true }).waitFor();
  assert.match(await identities.innerText(), /Supervisor: Nova QA Supervisora/);
  assert.equal(
    await page.locator("#referenceSLA #fMonth").inputValue(),
    "2026/10",
    "Directory changes preserve SLA filters",
  );
  assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "33,33%");
  assert.equal(slaImports.length, identityImportCount, "Identity changes never reimport SLA data");
  await page.locator("#referenceSLA #kLogsButton").click();
  assert.match(await page.locator("#referenceSLA #drillBody").innerText(), /QA Técnico Atualizado/);
  assert.match(
    await page.locator("#referenceSLA #drillBody").innerText(),
    /Supervisor: Nova QA Supervisora/,
  );
  await page.locator("#referenceSLA #drillClose").click();
  await page.locator("#referenceSLA #detailSearch").fill("Nova QA Supervisora");
  assert.equal(await page.locator("#referenceSLA #detailBody tr").count(), 2);
  await page.locator("#referenceSLA #detailSearch").fill("");
  await page.locator("#referenceSLA #clearFiltersBtn").click();
  await page.locator("#referenceSLA #metricTasks").click();
  assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "25,00%");
  await page.locator("#referenceSLA #metricAttendance").click();
  const originalSvg = await page
    .locator("#referenceSLA svg")
    .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
  await page.locator("#goFS").click();
  await page.locator("#referenceSLA .sla-presenting").waitFor();
  assert.deepEqual(
    await page
      .locator("#referenceSLA svg")
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
    originalSvg,
  );
  const mini = (id) => page.locator(`#referenceSLA .sla-mini-filter[data-filter="${id}"]`);
  for (const [id, select, value] of [
    ["uf", "fUF", "CE"],
    ["month", "fMonth", "2026/10"],
    ["type", "fType", "INSTALAÇÃO"],
    ["unit", "fBU", "FTZ-DMV_01"],
  ]) {
    await mini(id).locator("summary").click();
    await page.locator(`#referenceSLA #${select}`).selectOption(value);
    await mini(id).locator(".sla-mini-value").getByText(value, { exact: true }).waitFor();
    assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "33,33%");
  }
  await mini("location").locator("summary").click();
  await page.locator('#referenceSLA #fLocOptions input[data-location="Fortaleza"]').check();
  await mini("location")
    .locator(".sla-mini-value")
    .getByText("Fortaleza", { exact: true })
    .waitFor();
  await mini("dates").locator("summary").click();
  assert.equal(
    await mini("location").getAttribute("open"),
    null,
    "Only one mini filter stays open",
  );
  await mini("dates").locator('.sla-mini-menu[data-positioned="true"]').waitFor();
  const bounds = await mini("dates").locator(".sla-mini-menu").boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1600);
  await page.locator("#referenceSLA #fDateFrom").fill("2026-10-01");
  await page.locator("#referenceSLA #fDateTo").fill("2026-10-01");
  await mini("dates").locator("summary").click();
  await mini("dates")
    .locator(".sla-mini-value")
    .getByText("01/10/2026 – 01/10/2026", { exact: true })
    .waitFor();
  await mini("metric").locator("summary").click();
  await page.locator("#referenceSLA #metricTasks").click();
  assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "25,00%");
  await mini("metric").locator("summary").click();
  await page.locator("#referenceSLA #metricAttendance").click();
  await mini("source").locator("summary").click();
  await page.locator("#referenceSLA #baseSelect").selectOption("current");
  await mini("segment").locator("summary").click();
  await page.locator("#referenceSLA h1").click();
  assert.equal(await mini("segment").getAttribute("open"), null, "Outside click closes the filter");
  await mini("uf").locator("summary").click();
  await page.keyboard.press("Escape");
  assert.equal(await mini("uf").getAttribute("open"), null);
  assert.equal(await page.locator("#referenceSLA .sla-presenting").isVisible(), true);
  await page.screenshot({ path: join(tmpdir(), "sla-compact-presentation.png") });
  await page.setViewportSize({ width: 1366, height: 768 });
  const compact = await page.locator("#referenceSLA .sla-mini-filters").boundingBox();
  assert(compact && compact.height < 120, "Presentation filters remain compact on laptop screens");
  await mini("dates").locator("summary").click();
  await mini("dates").locator('.sla-mini-menu[data-positioned="true"]').waitFor();
  const laptopBounds = await mini("dates").locator(".sla-mini-menu").boundingBox();
  assert(laptopBounds && laptopBounds.x >= 0 && laptopBounds.x + laptopBounds.width <= 1366);
  await page.locator("#referenceSLA h1").click();
  await page.screenshot({ path: join(tmpdir(), "sla-compact-presentation-laptop.png") });
  await page.locator("#goFS").click();
  await page.locator("#referenceSLA .sla-system-controls").waitFor();
  assert.equal(await page.locator("#referenceSLA .sla-mini-filters").isVisible(), false);
  assert.equal(await page.locator("#referenceSLA #fUF").inputValue(), "CE");
  assert.equal(await page.locator("#referenceSLA #fDateTo").inputValue(), "2026-10-01");
  assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "33,33%");
  await page.locator("#referenceSLA #clearFiltersBtn").click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator("#referenceSLA #kSla").click();
  assert.equal(await page.locator("#referenceSLA #drillDialog").isVisible(), true);
  await page.locator("#referenceSLA #drillClose").click();
  await page.reload();
  await page.locator("#goSLA").click();
  await page.locator("#referenceSLA #kSlaValue").getByText("33,33%", { exact: true }).waitFor();
  await page.locator("#referenceSLA #fileInput").setInputFiles(slaFile);
  await page
    .locator("#referenceSLA .sla-system-status")
    .getByText("Esse arquivo já está na base", { exact: false })
    .waitFor();
  assert.equal(
    slaImports.filter((row) => row.published_at).length,
    1,
    "JSONB key ordering does not cause duplicate uploads",
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Base");
  const headers = Object.keys(slaRows[0]);
  sheet.addRow(headers);
  for (const row of slaRows) sheet.addRow(headers.map((key) => row[key]));
  await page.locator("#referenceSLA #fileInput").setInputFiles({
    name: "sla.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  await page
    .locator("#referenceSLA .sla-system-status")
    .getByText(/SLA atualizado.*sla\.xlsx/)
    .waitFor();
  assert.equal(await page.locator("#referenceSLA #kSlaValue").innerText(), "33,33%");
  failSLA = true;
  await page.locator("#referenceSLA #fileInput").setInputFiles({
    ...slaFile,
    buffer: Buffer.from(csv([slaRows[0], { ...slaRows[1], QTD_LOG_OS_VT: 2 }])),
  });
  await page
    .locator("#referenceSLA [role=alert]")
    .getByText("Falha simulada", { exact: false })
    .waitFor();
  assert.equal(
    await page.locator("#referenceSLA #kSlaValue").innerText(),
    "33,33%",
    "A failed publication never replaces the current base",
  );
  assert.equal(slaImports.filter((row) => row.published_at).length, 2);
  assert.equal(JSON.stringify(qualityImports.filter((row) => row.published_at)), originalTC);
  await page.locator("#goFS").click();
  assert.equal(await page.locator("#goSlides").isVisible(), false);
  await page.screenshot({ path: join(tmpdir(), "sla-integrated-app.png") });
  await page.locator("#goFS").click();
  role = "supervisor";
  await page.reload();
  await page.locator("#goFS").click();
  await page.locator("#goSLA").click();
  await page.locator("#referenceSLA #fileInput").waitFor({ state: "attached" });
  assert.equal(await page.locator("#referenceSLA #fileInput").isDisabled(), true);
  await page.locator("#referenceSLA .sla-presenting .sla-mini-filters").waitFor();
  assert.equal(
    await page
      .locator("#referenceSLA .sla-system-controls")
      .getByRole("button", { name: "Importar histórico HTML" })
      .count(),
    0,
  );
  await page.locator("#goFS").click();
  await page.locator("#referenceSLA .sla-system-controls").waitFor();
  const refreshSLA = page
    .locator("#referenceSLA .sla-system-controls")
    .getByRole("button", { name: "Atualizar base" });
  // Force a fresh download, rather than the previous valid snapshot in memory.
  const publishedSlaId = slaImports.at(-1).id;
  slaImports.at(-1).id = "incomplete-version";
  incompleteSLA = true;
  await refreshSLA.click();
  await page
    .locator("#referenceSLA [role=alert]")
    .getByText("incompleta", { exact: false })
    .waitFor();
  assert.equal(await page.locator("#referenceSLA .sla-surface").isVisible(), false);
  slaImports.at(-1).id = publishedSlaId;
  incompleteSLA = false;
  await refreshSLA.click();
  await page.locator("#referenceSLA #kSlaValue").getByText("33,33%", { exact: true }).waitFor();
  missingSLA = true;
  await refreshSLA.click();
  await page
    .locator("#referenceSLA [role=alert]")
    .getByText("20261020154717_add_sla_warranty_dashboard.sql", { exact: false })
    .waitFor();
  assert.equal(await page.locator("#referenceSLA .sla-surface").isVisible(), false);
  missingSLA = false;
  await refreshSLA.click();
  await page.locator("#referenceSLA #kSlaValue").getByText("33,33%", { exact: true }).waitFor();
  await page.goto("http://127.0.0.1:5175/visita-tecnica");
  assert.equal(await page.locator("#goSLA").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      integratedSla: true,
      originalFormulas: true,
      csvAndXlsx: true,
      persistedReload: true,
      sameFileNoNewVersion: true,
      failedUploadPreservesBase: true,
      tcWorkerImports: true,
      tcNoQQDependency: true,
      tcFailureVisible: true,
      tcRepeatNoDuplication: true,
      slaNeverChangesTC: true,
      roleBoundaries: true,
      independentVT: true,
      incompleteNeverDisplayed: true,
      missingMigrationExplained: true,
      compactPresentation: true,
      sameFilterState: true,
      unchangedPresentationSvg: true,
      sharedTechnicianAndSupervisor: true,
      directoryEditUpdatesSlaWithoutReimport: true,
      productionWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
