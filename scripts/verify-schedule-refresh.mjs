// Regression: a Sheets upsert keeps its ID but must reload the displayed marks.
// All API traffic is mocked; no real Google Sheets or database writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const actor = "00000000-0000-0000-0000-000000000001";
const schedule = {
  id: "qa-stable-id",
  city: "natal",
  sector: "vt",
  schedule_month: "2026-11-01",
  source_file: "Google Sheets · QA",
  source_sheet: "VT NOVEMBRO 2026",
  employee_count: 2,
  entry_count: 4,
  imported_by: actor,
  imported_at: "2026-10-21T12:00:00Z",
  updated_at: "2026-10-21T12:00:00Z",
  payload: {
    people: [
      {
        name: "Pessoa QA",
        login: "QA001",
        jobTitle: "Teste",
        assignments: { "2026-11-01": "Férias", "2026-11-02": "Férias" },
      },
      {
        name: "Outra QA",
        login: "QA002",
        jobTitle: "Teste",
        assignments: { "2026-11-01": "M. 1", "2026-11-02": "Folga" },
      },
    ],
    dates: ["2026-11-01", "2026-11-02"],
    codes: ["Férias", "M. 1", "Folga"],
  },
};
let detailReads = 0,
  summaryReads = 0,
  noteReads = 0,
  syncCalls = 0,
  failure = false,
  notes = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
    const resource = url.pathname.split("/").at(-1);
    let result = [],
      status = 200;
    if (resource === "profiles")
      result = {
        id: actor,
        role: "admin",
        status: "active",
        full_name: "QA",
        sector_id: null,
        sectors: null,
      };
    if (resource === "schedule_uploads") {
      if (url.searchParams.has("id")) {
        detailReads++;
        result = schedule;
      } else {
        summaryReads++;
        const { payload, ...summary } = schedule;
        result = [summary];
      }
    }
    if (resource === "schedule_date_notes") {
      noteReads++;
      result = notes;
    }
    if (resource === "schedule-sync") {
      assert.equal(request.method(), "POST");
      assert.deepEqual(request.postDataJSON(), {
        city: "natal",
        front: "vt",
        scheduleMonth: "2026-11-01",
      });
      syncCalls++;
      if (failure) {
        status = 502;
        result = { error: "Falha simulada na API" };
      } else {
        schedule.payload.people[0].assignments["2026-11-01"] = "M. 1";
        schedule.payload.people[0].assignments["2026-11-02"] = "Folga";
        schedule.imported_at = `2026-10-22T15:00:0${syncCalls}Z`;
        schedule.updated_at = schedule.imported_at;
        notes = [
          {
            id: "qa-note",
            schedule_upload_id: schedule.id,
            note_date: "2026-11-03",
            body: "Observação atualizada",
            author_id: actor,
            author_name: "QA",
            created_at: schedule.imported_at,
            updated_at: schedule.imported_at,
          },
        ];
        result = {
          ok: true,
          city: "natal",
          front: "vt",
          scheduleMonth: "2026-11-01",
          employeeCount: 2,
          entryCount: 4,
          sourceSheets: [schedule.source_sheet],
        };
      }
    } else assert(["GET", "OPTIONS"].includes(request.method()), "No other writes are expected");
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto("http://127.0.0.1:5175/escalas");
  const picker = page.getByRole("group", { name: "Seleção de colaboradores" });
  await picker.getByRole("checkbox", { name: "Selecionar Pessoa QA", exact: true }).waitFor();
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  const row = () =>
    page.locator("tbody tr").filter({
      has: page.getByRole("button", { name: "Ver calendário de Pessoa QA", exact: true }),
    });
  const visible = () =>
    row()
      .locator("td")
      .evaluateAll((nodes) =>
        nodes.slice(0, 2).map((node) => node.getAttribute("title").split(": ")[1]),
      );
  const selected = () =>
    picker
      .locator('input[type="checkbox"]:checked')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const sync = page.getByRole("button", { name: "Atualizar via API", exact: true });
  const before = await visible();
  assert.deepEqual(before, ["Férias", "Férias"]);
  const selectedBefore = await selected();
  const detailBefore = detailReads,
    summaryBefore = summaryReads,
    noteBefore = noteReads;
  await sync.click();
  await page.getByTitle("Pessoa QA · 01/11: M. 1", { exact: true }).waitFor();
  assert.deepEqual(await visible(), ["M. 1", "Folga"]);
  assert.equal(detailReads, detailBefore + 1, "Reload the payload even though the ID is unchanged");
  assert.equal(summaryReads, summaryBefore + 1);
  assert.equal(noteReads, noteBefore + 1);
  assert.equal(
    await page.getByRole("button", { name: "03/11: ver observação", exact: true }).count(),
    1,
  );
  assert.deepEqual(await selected(), selectedBefore);
  assert.equal(await page.getByLabel("Mês", { exact: true }).inputValue(), "2026-11");
  assert.equal(await page.getByRole("combobox").nth(0).innerText(), "Natal");
  assert.equal(await page.getByRole("combobox").nth(1).innerText(), "VT");
  const detailFresh = detailReads;
  failure = true;
  await sync.click();
  await page.getByText("Falha simulada na API", { exact: true }).waitFor();
  assert.equal(detailReads, detailFresh, "Failure preserves the last valid data");
  assert.deepEqual(await visible(), ["M. 1", "Folga"]);
  assert.deepEqual(await selected(), selectedBefore);
  failure = false;
  // A second version also reloads the payload under the same primary key.
  await sync.click();
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
  await page.getByRole("button", { name: "Atualizar via API", exact: true }).waitFor();
  await page.getByTitle("Pessoa QA · 01/11: M. 1", { exact: true }).waitFor();
  assert.equal(detailReads, detailFresh + 1);
  assert.deepEqual(await selected(), selectedBefore);
  await page.getByRole("button", { name: "Plantão no mês", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Plantão no mês", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(await visible(), ["M. 1", "Folga"]);
  await page.getByLabel("Buscar colaboradores por nome, login ou função").fill("Pessoa QA");
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  const screenshot = join(tmpdir(), "schedule-refresh-fresh.png");
  await page.screenshot({ path: screenshot });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      sameIdReload: true,
      updatedMarks: true,
      notesReload: true,
      selectionsPreserved: true,
      filtersPreserved: true,
      failedSyncPreservesData: true,
      repeatedUpdate: true,
      realDatabaseWrites: 0,
      screenshot,
    }),
  );
} finally {
  await browser.close();
}
