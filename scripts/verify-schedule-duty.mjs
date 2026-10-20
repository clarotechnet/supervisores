// Synthetic browser QA only. All external requests are intercepted; no DB writes.
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
const person = (name, day20, day21 = "F") => ({
  name,
  login: `QA-${name}`,
  jobTitle: "Controle",
  assignments: { "2026-10-20": day20, "2026-10-21": day21, "2026-10-22": "F" },
});
const people = [
  person("Ana", "T. 1"),
  person("Bruno", "F", "T. 2"),
  person("Carla", "T. 2", "L"),
  person("Ferias", "Férias"),
  person("Licenca", "LCC."),
  person("Falta", "FALTA"),
  person("Atestado", "AT"),
  person("Sem marcacao", ""),
  person("Banco horas", "BH"),
];
const upload = (id, city, sector, month, rows) => ({
  id,
  city,
  sector,
  schedule_month: month,
  source_file: "QA.xlsx",
  source_sheet: "Teste",
  employee_count: rows.length,
  entry_count: rows.reduce((total, row) => total + Object.keys(row.assignments).length, 0),
  imported_by: actor,
  imported_at: "2026-10-20T12:00:00Z",
  updated_at: "2026-10-20T12:00:00Z",
  payload: {
    people: rows,
    dates: Object.keys(rows[0]?.assignments ?? {}),
    codes: ["T. 1", "T. 2", "F"],
  },
});
const uploads = [
  upload("natal-oct", "natal", "controle-operacional", "2026-10-01", people),
  upload("recife-oct", "recife", "instalacao", "2026-10-01", [
    { ...person("Rita", "T. 1"), assignments: { "2026-10-22": "T. 1" } },
  ]),
  upload("recife-desc", "recife", "desconexao", "2026-10-01", [
    { ...person("Diego", "T. 1"), assignments: { "2026-10-22": "T. 2" } },
  ]),
  upload("natal-nov", "natal", "controle-operacional", "2026-11-01", [
    { name: "Novembro", jobTitle: "Controle", assignments: { "2026-11-01": "T. 1" } },
  ]),
  upload("natal-mdu", "natal", "mdu", "2026-10-01", [person("Afastado", "LCC.", "LCC.")]),
];
let role = "controller",
  writes = 0;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Sao_Paulo",
  });
  await page.clock.setFixedTime(new Date("2026-10-20T15:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket("**/*", (socket) => socket.close());
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    if (request.method() !== "GET" && request.method() !== "OPTIONS") writes++;
    const table = url.pathname.split("/").at(-1);
    let result = [];
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
    if (table === "schedule_uploads") {
      const id = url.searchParams.get("id")?.slice(3);
      result = id
        ? uploads.find((upload) => upload.id === id)
        : uploads.map(({ payload, ...summary }) => summary);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto("http://127.0.0.1:5175/escalas");
  const picker = page.getByRole("group", { name: "Seleção de colaboradores" });
  const button = page.getByRole("button", { name: "Somente de plantão", exact: true });
  const monthButton = page.getByRole("button", { name: "Plantão no mês", exact: true });
  const date = page.getByLabel("Data do plantão", { exact: true });
  await picker.getByRole("checkbox", { name: "Selecionar Ana", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 9);
  assert.equal(await page.getByRole("button", { name: "Importar Excel", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await button.click();
  assert.equal(await button.getAttribute("aria-pressed"), "true");
  assert.equal(await date.inputValue(), "2026-10-20");
  assert.equal(await picker.getByRole("checkbox").count(), 2);
  assert.equal(await page.getByRole("button", { name: /^Ver calendário de / }).count(), 2);
  await page.getByRole("status").filter({ hasText: "2 colaborador(es) de plantão" }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar imagem", exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.png$/i);
  await page.screenshot({ path: join(tmpdir(), "schedule-on-duty.png") });
  await date.fill("2026-10-21");
  await picker.getByRole("checkbox", { name: "Selecionar Bruno", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  assert.equal(await page.getByRole("button", { name: /^Ver calendário de / }).count(), 0);
  await button.click();
  assert.equal(await picker.locator('input[type="checkbox"]:checked').count(), 9);
  await monthButton.click();
  assert.equal(await monthButton.getAttribute("aria-pressed"), "true");
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  assert.equal(await date.count(), 0, "Monthly scope is independent of the selected day");
  assert.equal(await picker.getByRole("checkbox").count(), 3);
  await picker.getByRole("checkbox", { name: "Selecionar Bruno", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Ver calendário de / }).count(), 3);
  await page
    .getByRole("status")
    .filter({ hasText: "3 colaborador(es) com plantão em outubro de 2026." })
    .waitFor();
  await page.getByLabel("Buscar colaboradores por nome, login ou função").fill("Bruno");
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await page.getByLabel("Buscar colaboradores por nome, login ou função").fill("");
  const monthlyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar imagem", exact: true }).click();
  assert.match((await monthlyDownload).suggestedFilename(), /\.png$/i);
  await page.screenshot({ path: join(tmpdir(), "schedule-on-duty-month.png") });
  await monthButton.click();
  assert.equal(await picker.locator('input[type="checkbox"]:checked').count(), 9);
  await button.click();
  assert.equal(
    await date.inputValue(),
    "2026-10-21",
    "Switching to the month retains the chosen day",
  );
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  assert.equal(await picker.locator('input[type="checkbox"]:checked').count(), 0);
  await page
    .getByText("Selecione os colaboradores de plantão para consultar ou comparar as escalas.", {
      exact: true,
    })
    .waitFor();
  await date.fill("2026-10-20");
  assert.equal(
    await picker.locator('input[type="checkbox"]:checked').count(),
    2,
    "Other dates' selections are retained",
  );
  await page.getByLabel("Buscar colaboradores por nome, login ou função").fill("Carla");
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await page.getByLabel("Buscar colaboradores por nome, login ou função").fill("");
  await date.fill("2026-10-22");
  assert.equal(await picker.getByRole("checkbox").count(), 0);
  await page
    .getByText(
      "Nenhum colaborador de plantão nesta data. Escolha outro dia ou desligue o filtro.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Recife", exact: true }).click();
  await picker.getByRole("checkbox", { name: "Selecionar Rita", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Desconexão", exact: true }).click();
  await picker.getByRole("checkbox", { name: "Selecionar Diego", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await monthButton.click();
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Natal", exact: true }).click();
  await picker.getByRole("checkbox", { name: "Selecionar Bruno", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 3);
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "MDU", exact: true }).click();
  await page
    .getByText(
      "Nenhum colaborador com plantão neste mês. Escolha outro mês ou desligue o filtro.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 0);
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Controle operacional", exact: true }).click();
  await picker.getByRole("checkbox", { name: "Selecionar Ana", exact: true }).waitFor();
  await page.locator("#schedule-month").fill("2026-11");
  await picker.getByRole("checkbox", { name: "Selecionar Novembro", exact: true }).waitFor();
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  await page
    .getByRole("status")
    .filter({ hasText: "1 colaborador(es) com plantão em novembro de 2026." })
    .waitFor();
  await button.click();
  assert.equal(await date.inputValue(), "2026-11-01");
  assert.equal(await date.getAttribute("min"), "2026-11-01");
  assert.equal(await date.getAttribute("max"), "2026-11-30");
  await page.locator("#schedule-month").fill("2026-12");
  await page
    .getByRole("heading", { name: "Nenhuma escala para este filtro", exact: true })
    .waitFor();
  assert.equal(await picker.count(), 0, "A missing month cannot leak the previous schedule");
  for (const nextRole of ["supervisor", "admin"]) {
    role = nextRole;
    await page.reload();
    await picker.getByRole("checkbox", { name: "Selecionar Ana", exact: true }).waitFor();
    await button.click();
    assert.equal(await picker.getByRole("checkbox").count(), 2);
    await monthButton.click();
    assert.equal(await picker.getByRole("checkbox").count(), 3);
    assert.equal(
      await page.getByRole("button", { name: "Importar Excel", exact: true }).count(),
      1,
    );
  }
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      dutyDateFilter: true,
      dutyMonthFilter: true,
      exclusiveScopes: true,
      dayChoicePreserved: true,
      cityFrontMonthScope: true,
      workOnly: true,
      selectionPreserved: true,
      emptyState: true,
      comparisonAndImage: true,
      allRoles: true,
      productionWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
