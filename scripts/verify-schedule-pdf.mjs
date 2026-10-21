// Local browser/PDF QA with synthetic data. Every external request is mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const out = resolve(process.argv[2] || "tmp/pdfs/schedule-qa");
await mkdir(out, { recursive: true });
const actor = "00000000-0000-0000-0000-000000000001";
const names = Array.from(
  { length: 43 },
  (_, index) =>
    `TÉCNICO QA ${String(index + 1).padStart(2, "0")} JOÃO DA CONCEIÇÃO${index === 1 ? " SOBRENOME COMPLETO QUE DEVE SER PRESERVADO SEM CORTES DE TEXTO" : ""}`,
);
const codes = ["M.1", "T. 2", "F", "Fé", "LCC.", "FALTA", "AT", ""];
const people = names.map((name, index) => ({
  name,
  login: `QA${String(index + 1).padStart(3, "0")}`,
  jobTitle: index === 1 ? "CONTROLADOR DE OPERAÇÕES - FUNÇÃO COMPLETA NO RELATÓRIO" : "ANALISTA",
  assignments: Object.fromEntries(
    Array.from({ length: 30 }, (_, day) => [
      `2026-11-${String(day + 1).padStart(2, "0")}`,
      codes[(day + index) % codes.length],
    ]),
  ),
}));
const longNote = `INICIO_OBSERVACAO_LONGA ${"Orientação da gestão: manter cobertura e verificar as equipes de plantão. ".repeat(320)} FIM_OBSERVACAO_LONGA`;
const notes = [
  {
    id: "n1",
    schedule_upload_id: "qa",
    note_date: "2026-11-03",
    body: "Observação da gestão: confirmar a cobertura em Natal. Não perder acentuação.",
    author_id: actor,
    author_name: "QA",
    created_at: "2026-10-21",
    updated_at: "2026-10-21",
  },
  {
    id: "n2",
    schedule_upload_id: "qa",
    note_date: "2026-11-15",
    body: longNote,
    author_id: actor,
    author_name: "QA",
    created_at: "2026-10-21",
    updated_at: "2026-10-21",
  },
  { id: "outside", note_date: "2026-12-01", body: "NAO_EXPORTAR_OUTRO_MES" },
];
const schedule = {
  id: "qa",
  city: "natal",
  sector: "controle-operacional",
  schedule_month: "2026-11-01",
  source_file: "QA.xlsx",
  source_sheet: "Base",
  employee_count: people.length,
  entry_count: people.length * 30,
  payload: { people, dates: Object.keys(people[0].assignments), codes },
  imported_by: actor,
  imported_at: "2026-10-21T12:00:00Z",
  updated_at: "2026-10-21T12:00:00Z",
};
const otherPeople = [
  {
    name: "TÉCNICO RECIFE OUTRA FRENTE",
    login: "QA090",
    jobTitle: "Desconexão",
    assignments: Object.fromEntries(
      Array.from({ length: 31 }, (_, day) => [
        `2026-10-${String(day + 1).padStart(2, "0")}`,
        day === 30 ? "FALTA" : "T. 2",
      ]),
    ),
  },
];
const otherSchedule = {
  ...schedule,
  id: "other",
  city: "recife",
  sector: "desconexao",
  schedule_month: "2026-10-01",
  employee_count: 1,
  entry_count: 31,
  payload: { people: otherPeople, dates: Object.keys(otherPeople[0].assignments), codes },
};
const schedules = [schedule, otherSchedule];
let writes = 0;
const records = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
    timezoneId: "America/Sao_Paulo",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.addInitScript(
    ({ actor }) => {
      localStorage.setItem("technet-color-theme", "light");
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
      const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: actor, aud: "authenticated", role: "authenticated", exp: now + 3600 }))}.mock`;
      localStorage.setItem(
        "sb-rwstmomeldwrjmczrmnp-auth-token",
        JSON.stringify({
          access_token: token,
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
        role: "admin",
        status: "active",
        full_name: "QA",
        sector_id: null,
        sectors: null,
      };
    if (table === "schedule_uploads") {
      result = url.searchParams.has("id")
        ? schedules.find((item) => `eq.${item.id}` === url.searchParams.get("id"))
        : schedules.map(({ payload, ...summary }) => summary);
    }
    if (table === "schedule_date_notes") result = notes;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto("http://127.0.0.1:5175/escalas");
  const picker = page.getByRole("group", { name: "Seleção de colaboradores" });
  await picker.getByRole("checkbox", { name: `Selecionar ${names[0]}`, exact: true }).waitFor();
  const save = async (
    name,
    context = {
      people,
      month: "2026-11",
      city: "Natal",
      sector: "Controle operacional",
      slug: "natal-controle-operacional",
    },
  ) => {
    const selected = await picker
      .locator('input[type="checkbox"]:checked')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label").slice("Selecionar ".length)),
      );
    const palette = await page.evaluate(async () => {
      const { captureSchedulePdfPalette } = await import("/src/lib/schedule-pdf-theme.ts");
      return captureSchedulePdfPalette(document.querySelector("main") || document.body);
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Salvar PDF", exact: true }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), `escala-${context.slug}-${context.month}.pdf`);
    await file.saveAs(join(out, name));
    const filtered = context.people.filter((person) => selected.includes(person.name));
    const totals = Object.fromEntries(
      Object.keys(context.people[0].assignments).map((date) => {
        const values = filtered.map((person) => person.assignments[date]);
        return [
          date,
          {
            work: values.filter((code) => ["M.1", "T. 2"].includes(code)).length,
            off: values.filter((code) => code === "F").length,
          },
        ];
      }),
    );
    records.push({
      file: name,
      selected: filtered.map(({ name, login }) => ({ name, login })),
      palette,
      totals,
      city: context.city,
      sector: context.sector,
      month: new Date(`${context.month}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
      notes: notes
        .filter((note) => note.note_date.startsWith(context.month))
        .map(({ note_date, body }) => ({ note_date, body })),
    });
    await page.getByRole("button", { name: "Salvar PDF", exact: true }).waitFor();
  };
  await save("single-light.pdf");
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await save("all-light.pdf");
  await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).click();
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  for (const name of names.slice(0, 17))
    await picker.getByRole("checkbox", { name: `Selecionar ${name}`, exact: true }).check();
  await save("selected-dark.pdf");
  await page.screenshot({ path: join(out, "screen-dark.png") });
  await page.getByRole("button", { name: "Somente de plantão", exact: true }).click();
  await page.getByLabel("Data do plantão", { exact: true }).fill("2026-11-02");
  await save("duty-dark.pdf");
  assert(records.at(-1).selected.length < 17 && records.at(-1).selected.length > 0);
  await page.getByRole("button", { name: "Plantão no mês", exact: true }).click();
  await save("monthly-dark.pdf");
  assert.equal(records.at(-1).selected.length, 17);
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Recife", exact: true }).click();
  await picker
    .getByRole("checkbox", { name: `Selecionar ${otherPeople[0].name}`, exact: true })
    .waitFor();
  await save("recife-october-dark.pdf", {
    people: otherPeople,
    month: "2026-10",
    city: "Recife",
    sector: "Desconexão",
    slug: "recife-desconexao",
  });
  await writeFile(
    join(out, "expected.json"),
    JSON.stringify(
      {
        records,
        allPeople: [...people, ...otherPeople].map(({ name, login }) => ({ name, login })),
      },
      null,
      2,
    ),
  );
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pdfButton: true,
      singleAndComparison: true,
      lightAndDark: true,
      dailyAndMonthlyFilters: true,
      downloads: records.length,
      productionWrites: writes,
      output: out,
    }),
  );
} finally {
  await browser.close();
}
