// Native UI regression, synthetic records only. Every remote call/write is intercepted.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const actor = "00000000-0000-0000-0000-000000000001";
const points = [126.99, 127, 150, 174.99, 175, 175.01, 200];
const records = [...points, 200, 200].map((points, index) => ({
  login: `T${index}`,
  name: `Teste Técnico ${index}`,
  company: "NTL-DMV",
  baseUnit: index >= 4 ? "PWM-DMV" : "NTL-DMV",
  mapSource: "base",
  qr: index === 8 ? "1" : "0",
  tnum: index === 7 ? "94.9" : "95",
  tden: "100",
  points: String(points),
  day: "2026-10-01",
  month: 10,
  year: 2026,
  city: "Natal",
  sub: "Natal",
  group: "Visita técnica",
  type: "1",
  uf: "RN",
  wo: `WO${index}`,
  finish: "01/10/2026 08:00:00",
  contract: String(index),
  orders: "",
  lowCodes: "100",
  revisitWo: "",
  noteAt: "01/10/2026",
}));
const excluded = ["OUTRO_SETOR", "SEM_SETOR", "SEM_CADASTRO"].map((login) => ({
  ...records[6],
  login,
  name: `Teste ${login}`,
  wo: login,
  baseUnit: "NTL-DMV_VT",
  group: "Visita técnica",
}));
const adhesionRecords = records.map((row, index) => ({
  ...row,
  login: `AD_T${index}`,
  name: `Teste Adesão/Serviços ${index}`,
  wo: `OS-ADESAO-${index}`,
  group: "Instalação",
}));
const allRecords = [...records, ...adhesionRecords, ...excluded];
const originalData = JSON.stringify(allRecords);
let directory = records.map((row) => ({
  login: row.login,
  full_name: row.name,
  city: row.city,
  sector: "Visita técnica",
  supervisor: "Supervisor VT",
}));
directory.push(
  ...adhesionRecords.map((row) => ({
    login: row.login,
    full_name: row.name,
    city: "NATAL/PARNAMIRIM",
    sector: "ADESÃO/SERVIÇOS",
    supervisor: "Supervisor Adesão",
  })),
  ...excluded.slice(0, 2).map((row, i) => ({
    login: row.login,
    full_name: row.name,
    city: row.city,
    sector: i === 0 ? "Adesão/Serviços" : "",
    supervisor: "Supervisor não VT",
  })),
);
let saves = 0,
  denyDirectory = false;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  const readResults = () =>
    page.locator("#referenceTC #tbody tr[data-i]").evaluateAll((rows) =>
      rows.map((row) => ({
        login: row.querySelector(".tc-identity-sub").textContent.split(" · ")[0].trim(),
        good: row.querySelector('[data-indicator="prod"] button').classList.contains("good"),
        certified: row.querySelector("[data-current-state]").dataset.currentState === "certified",
      })),
    );
  const checkPresentationChrome = async (hidden, technicalVisit) => {
    for (const selector of [
      "#referenceTC #panelView > .tablecard > .tabletop",
      "#referenceTC #tcSupervisorControls",
    ])
      assert.equal(await page.locator(selector).isVisible(), !hidden, selector);
    if (technicalVisit)
      assert.equal(await page.locator(".quality-vt-scope-notice").isVisible(), !hidden);
    assert.equal(await page.locator("#referenceTC #tcResults").isVisible(), true);
    assert.equal(await page.locator("#referenceTC #kCert").isVisible(), true);
  };
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket("**/*", (ws) => ws.close());
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
      const jwt =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(
          JSON.stringify({
            sub: actor,
            aud: "authenticated",
            role: "authenticated",
            exp: now + 3600,
          }),
        ) +
        ".mock";
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
    const table = url.pathname.split("/").at(-1);
    assert(
      request.method() === "GET" || table === "save_quality_directory",
      "No analytical dataset writes during this test",
    );
    let body = [];
    if (table === "save_quality_directory") {
      const { p_entries } = request.postDataJSON();
      for (const entry of p_entries) {
        const index = directory.findIndex((row) => row.login === entry.login);
        if (index >= 0) directory[index] = entry;
        else directory.push(entry);
      }
      saves++;
      body = null;
    }
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
    if (table === "quality_technician_directory") {
      if (denyDirectory)
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ message: "Cadastro indisponível", code: "42501" }),
        });
      body = directory;
    }
    if (table === "quality_imports") {
      const kind = url.searchParams.get("kind")?.slice(3);
      body =
        kind === "quebra"
          ? null
          : {
              id: kind,
              kind,
              source_file: "synthetic",
              imported_by: actor,
              created_at: "2026-10-01T00:00:00Z",
              published_at: "2026-10-01T00:00:00Z",
              row_count: allRecords.length,
              chunk_count: 1,
              metadata: {},
              base_import_id: null,
            };
    }
    if (table === "quality_certification_data" || table === "quality_technical_visit_data")
      body = url.searchParams.get("limit") === "0" ? [] : [{ chunk_index: 0, records: allRecords }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  for (const technicalVisit of [true, false, true]) {
    const target = technicalVisit ? 175 : 127;
    const loginPrefix = technicalVisit ? "" : "AD_";
    await page.goto(`http://127.0.0.1:5175/${technicalVisit ? "visita-tecnica" : "qualidade"}`);
    if (!technicalVisit) await page.locator("#goTC").click();
    await page
      .locator("#referenceTC #fileMeta")
      .getByText(`${technicalVisit ? 9 : 12} registros de TC carregados do sistema.`, {
        exact: true,
      })
      .waitFor({ state: "attached" });
    assert.equal(
      await page.locator("#referenceTC #prodMeta").innerText(),
      `≥ ${target} pontos/dia`,
    );
    assert.match(
      await page.locator("#referenceTC #ruleNotice").innerText(),
      new RegExp(`produtividade ≥ ${target} pontos/dia`),
    );
    assert.equal(
      await page.locator("#referenceTC #fRule option").innerText(),
      `Todas as operações · ≥ ${target} pontos/dia`,
    );
    await page
      .locator('#referenceTC #presentationCityStrip [data-city="Natal / Parnamirim"]')
      .click();
    assert.equal(
      (await readResults()).length,
      technicalVisit ? 9 : 12,
      "City chip includes registered NATAL/PARNAMIRIM as well as raw Natal/Parnamirim",
    );
    await page.locator("#unitPicker summary").click();
    const ntlUnit = page.locator('#unitOptions input[data-unit="NTL-DMV"]');
    const pwmUnit = page.locator('#unitOptions input[data-unit="PWM-DMV"]');
    assert.equal(await ntlUnit.getAttribute("type"), "checkbox");
    await ntlUnit.check();
    assert.equal((await readResults()).length, 4);
    await pwmUnit.check();
    assert.equal(await page.locator("#unitPickerLabel").innerText(), "2 unidades");
    assert.equal((await readResults()).length, 9);
    await ntlUnit.uncheck();
    assert.equal((await readResults()).length, 5);
    await page.locator('#unitOptions label:has(input[data-unit="NTL-DMV"])').click();
    assert.equal((await readResults()).length, 9);
    assert.equal((await page.locator("#unitPicker").getAttribute("open")) !== null, true);
    await page.locator("#unitPicker summary").click();
    const selectedResults = await readResults();
    await page.locator("#referenceTC #tabDaily").click();
    assert.equal(await page.locator("#referenceTC #matrix tbody tr").count(), 9);
    await page.locator("#referenceTC #tabPanel").click();
    const unitDownload = page.waitForEvent("download");
    await page.locator("#referenceTC #btnExport").evaluate((el) => el.click());
    const unitCSV = await readFile(await (await unitDownload).path(), "utf8");
    assert.equal(unitCSV.trim().split(/\r?\n/).length - 1, 9);
    await page.locator("#goFS").click();
    await page.locator("#goSlides").click();
    await page.locator("#slidePlayer").waitFor({ state: "visible" });
    assert.deepEqual(await readResults(), selectedResults, "Slides honor the selected unit union");
    await page.locator("#slidesStop").click();
    await page.locator("#goFS").click();
    await page.locator("#unitPicker summary").click();
    assert.equal(await ntlUnit.isChecked(), true);
    assert.equal(await pwmUnit.isChecked(), true);
    assert.equal(await page.locator("#unitPickerLabel").innerText(), "2 unidades");
    assert.deepEqual(await readResults(), selectedResults, "Slide exit restores both unit filters");
    await page.locator('#unitOptions input[data-unit="*"]').check();
    assert.equal((await readResults()).length, technicalVisit ? 9 : 12);
    await page.locator("#unitPicker summary").click();
    // The legacy single-select and reset button must remain synchronized.
    await page.locator("#referenceTC #fBaseUnit").evaluate((el) => {
      el.value = "NTL-DMV";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal((await readResults()).length, 4);
    await page.locator("#referenceTC #btnReset").evaluate((el) => el.click());
    assert.equal((await readResults()).length, technicalVisit ? 9 : 12);
    await page
      .locator('#referenceTC #presentationCityStrip [data-city="Natal / Parnamirim"]')
      .click();
    const results = await readResults();
    assert.equal(
      results.length,
      technicalVisit ? 9 : 12,
      "VT includes only its registered sector; normal TC excludes it",
    );
    for (const row of records)
      assert.equal(
        results.some((result) => result.login === row.login),
        technicalVisit,
      );
    for (const row of adhesionRecords)
      assert.equal(
        results.some((result) => result.login === row.login),
        !technicalVisit,
      );
    for (const row of excluded)
      assert.equal(
        results.some((result) => result.login === row.login),
        !technicalVisit,
      );
    for (let i = 0; i < records.length; i++) {
      const result = results.find((row) => row.login === `${loginPrefix}T${i}`);
      assert.equal(
        result.good,
        Number(records[i].points) >= target,
        `Productivity color T${i}, target ${target}`,
      );
      assert.equal(
        result.certified,
        i < 7 && Number(records[i].points) >= target,
        `Certification T${i}, target ${target}`,
      );
    }
    assert.equal(await page.locator("#referenceTC #kCert").innerText(), technicalVisit ? "3" : "9");
    await page.locator("#referenceTC #btnRules").evaluate((el) => el.click());
    assert.match(
      await page.locator("#referenceTC #modalBody").innerText(),
      new RegExp(`limite inclusivo de ${target} pontos/dia`),
    );
    await page.locator("#referenceTC #modalClose").click();
    await page
      .locator(
        `#referenceTC [data-tc-projection-login="${loginPrefix}T0"][data-tc-projection-metric="prod"]`,
      )
      .click();
    assert.match(
      await page.locator("#referenceTC #modalBody").innerText(),
      new RegExp(`Meta ≥ ${target} pontos/dia`),
    );
    await page.locator("#referenceTC #modalClose").click();
    await page.locator("#referenceTC #tabDaily").click();
    await page.locator('#referenceTC .metricbtn[data-metric="prod"]').click();
    const dayResults = await page.locator("#referenceTC #matrix tbody tr").evaluateAll((rows) =>
      rows.map((row) => ({
        login: row.querySelector(".src").textContent.trim(),
        good: row.querySelector(".avg").classList.contains("cellgood"),
      })),
    );
    assert.equal(dayResults.length, technicalVisit ? 9 : 12);
    for (let i = 0; i < records.length; i++)
      assert.equal(
        dayResults.find((row) => row.login === `${loginPrefix}T${i}`).good,
        Number(records[i].points) >= target,
      );
    assert.match(
      await page.locator("#referenceTC #chart3").innerText(),
      new RegExp(String(target)),
    );
    await page.locator("#referenceTC #tabPanel").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#referenceTC #btnExport").evaluate((el) => el.click());
    const download = await downloadPromise,
      csv = await readFile(await download.path(), "utf8");
    const lines = csv
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/),
      head = lines.shift().split(";"),
      loginIndex = head.indexOf("LOGIN"),
      statusIndex = head.indexOf("STATUS");
    assert.equal(lines.length, technicalVisit ? 9 : 12, "Exports respect the sector scope");
    for (const line of lines) {
      const fields = line.split(";").map((field) => field.replace(/^"|"$/g, "")),
        i = Number(fields[loginIndex].replace(/^AD_/, "").slice(1));
      if (excluded.some((row) => row.login === fields[loginIndex])) {
        assert.equal(technicalVisit, false);
        assert.equal(fields[statusIndex], "CERTIFICADO");
        continue;
      }
      assert.equal(fields[loginIndex].startsWith("AD_"), !technicalVisit);
      assert.equal(
        fields[statusIndex],
        i < 7 && Number(records[i].points) >= target ? "CERTIFICADO" : "NAO CERTIFICADO",
      );
    }
    await checkPresentationChrome(false, technicalVisit);
    await page.locator("#goFS").click();
    await page.locator(".quality-reference.presenting").waitFor();
    await checkPresentationChrome(true, technicalVisit);
    assert.deepEqual(
      await readResults(),
      results,
      "Presentation does not change calculated results",
    );
    await page.locator("#goSlides").click();
    await page.locator("#slidePlayer").waitFor({ state: "visible" });
    await checkPresentationChrome(true, technicalVisit);
    if (technicalVisit)
      await page.screenshot({ path: join(tmpdir(), "tc-presentation-clean.png") });
    // Each slide presents one supervisor, not the entire normal TC population.
    assert.equal(await page.locator("#referenceTC #kCert").innerText(), technicalVisit ? "3" : "6");
    for (const row of await readResults())
      assert.equal(row.login.startsWith("AD_"), !technicalVisit);
    await page.locator("#slidesStop").click();
    await checkPresentationChrome(true, technicalVisit);
    await page.locator("#goFS").click();
    await page.locator(".quality-reference.presenting").waitFor({ state: "hidden" });
    await checkPresentationChrome(false, technicalVisit);
    assert.deepEqual(await readResults(), results, "Stopping slides restores the original results");
    // The browser's fullscreen exit must restore normal controls as well.
    await page.locator("#goFS").click();
    await checkPresentationChrome(true, technicalVisit);
    await page.evaluate(() => document.exitFullscreen());
    await page.locator(".quality-reference.presenting").waitFor({ state: "hidden" });
    await checkPresentationChrome(false, technicalVisit);
    await page.locator("#goSupervisors").click();
    const listed = await page
      .locator("#referenceDirectory tbody tr")
      .evaluateAll((rows) => rows.map((row) => row.cells[0].textContent.trim()));
    assert.equal(listed.length, technicalVisit ? 9 : 21, "Normal directory stays complete");
    for (const row of excluded) assert.equal(listed.includes(row.login), !technicalVisit);
    if (technicalVisit) {
      assert.equal(await page.locator("#unitPickerLabel").innerText(), "Visita técnica");
      await page.getByRole("button", { name: "Adicionar login", exact: true }).click();
      const dialog = page.getByRole("dialog");
      assert.equal(
        await dialog.getByLabel("Setor", { exact: true }).inputValue(),
        "Visita técnica",
      );
      for (const [field, value] of [
        ["Login", "OUTRO_SETOR"],
        ["Nome", "Nome que não deve sobrescrever"],
        ["Cidade", "Natal"],
        ["Supervisor", "Supervisor VT"],
      ])
        await dialog.getByLabel(field, { exact: true }).fill(value);
      await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
      await page
        .getByText(
          "Esse login já existe em outro setor. Edite seu setor no cadastro de QQ e Certificação.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        saves,
        0,
        "Hidden other-sector entries still participate in duplicate detection",
      );
      await page.keyboard.press("Escape");
    }
    console.log(
      JSON.stringify({
        technicalVisit,
        target,
        inclusive175: true,
        normal127Preserved: true,
        statuses: true,
        dailyColors: true,
        projection: true,
        export: true,
        slides: true,
        presentationChromeHidden: true,
        normalChromeRestored: true,
        sectorScope: true,
        adhesionVisibleAt127: true,
        noVTInNormalTC: true,
        cityFilterIncludesRegistered: true,
        multipleUnitsWorks: true,
        selectedUnitExportAndSlides: true,
      }),
    );
  }
  // Reassign sectors through the real shared directory, without reimporting either dataset.
  await page.getByRole("button", { name: "Editar T2", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Setor", { exact: true }).fill("Adesão/Serviços");
  await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Editar T2", exact: true }).count(), 0);
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("8 registros de TC carregados do sistema.", { exact: true })
    .waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:5175/qualidade");
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("13 registros de TC carregados do sistema.", { exact: true })
    .waitFor({ state: "attached" });
  assert.equal((await readResults()).find((row) => row.login === "T2").certified, true);
  await page.locator("#goSupervisors").click();
  await page.getByRole("button", { name: "Editar OUTRO_SETOR", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Setor", { exact: true }).fill("Visita técnica");
  await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("12 registros de TC carregados do sistema.", { exact: true })
    .waitFor({ state: "attached" });
  assert.equal(
    (await readResults()).some((row) => row.login === "OUTRO_SETOR"),
    false,
  );
  await page.goto("http://127.0.0.1:5175/visita-tecnica");
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("9 registros de TC carregados do sistema.", { exact: true })
    .waitFor({ state: "attached" });
  const reclassified = await page.locator("#referenceTC .tc-identity-sub").allTextContents();
  assert(reclassified.some((text) => text.startsWith("OUTRO_SETOR ·")));
  assert(!reclassified.some((text) => text.startsWith("T2 ·")));
  assert.equal(await page.locator("#referenceTC #kCert").innerText(), "4");
  denyDirectory = true;
  for (const path of ["visita-tecnica", "qualidade"]) {
    await page.goto(`http://127.0.0.1:5175/${path}`);
    if (path === "qualidade") await page.locator("#goTC").click();
    await page.getByRole("alert").filter({ hasText: "Cadastro indisponível" }).waitFor();
    assert.equal(
      await page.locator(".reference-loading").isVisible(),
      true,
      `${path} TC cannot calculate when sector eligibility cannot be confirmed`,
    );
    assert.match(
      await page.locator(".reference-loading").innerText(),
      /Não foi possível concluir o carregamento/,
    );
    assert.equal(
      await page
        .locator(".reference-loading")
        .getByRole("button", { name: "Tentar novamente" })
        .isVisible(),
      true,
    );
  }
  assert.equal(JSON.stringify(allRecords), originalData, "All raw records were preserved");
  assert.equal(saves, 2);
  console.log(
    JSON.stringify({
      liveReclassification: true,
      rawDatasetUnchanged: true,
      otherSectorDuplicateProtected: true,
      missingDirectoryBlocksBothTC: true,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
