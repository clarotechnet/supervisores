// End-to-end overlapping uploads through the native screen. Production traffic is mocked.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const technicalVisit = process.argv[2] === "technical_visit";
const sourceKind = technicalVisit ? "technical_visit" : "certification";
const sourceTable = technicalVisit ? "quality_technical_visit_data" : "quality_certification_data";
const routePath = technicalVisit ? "/visita-tecnica" : "/qualidade";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const actor = "00000000-0000-0000-0000-000000000001";
  let role = "admin",
    imports = [],
    blocks = [],
    writes = 0,
    blockReads = 0;
  await page.routeWebSocket("**/realtime/**", (ws) => ws.close());
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      table = url.pathname.split("/").at(-1);
    const body = request.postData() ? request.postDataJSON() : null;
    let output = [];
    if (table === "profiles")
      output = {
        id: actor,
        role,
        status: "active",
        full_name: "Teste incremental",
        email: "teste@example.invalid",
        sector_id: null,
        sectors: null,
      };
    if (table === "quality_supervisor_registry") output = null;
    if (technicalVisit && table === "quality_technician_directory")
      output = [
        {
          login: "Z1",
          full_name: "Técnico VT",
          city: "Natal",
          sector: "Visita técnica",
          supervisor: "Supervisor VT",
        },
        {
          login: "AD_Z1",
          full_name: "Técnico Adesão",
          city: "NATAL/PARNAMIRIM",
          sector: "ADESÃO/SERVIÇOS",
          supervisor: "Supervisor Adesão",
        },
      ];
    if (table === "quality_imports") {
      if (request.method() === "POST") {
        output = {
          ...body,
          id: randomUUID(),
          created_at: new Date().toISOString(),
          published_at: null,
        };
        imports.push(output);
        writes++;
      } else
        output =
          imports
            .filter(
              (row) => row.kind === url.searchParams.get("kind")?.slice(3) && row.published_at,
            )
            .at(-1) ?? null;
    }
    if (
      [
        "quality_quebra_data",
        "quality_certification_data",
        "quality_technical_visit_data",
      ].includes(table)
    ) {
      if (request.method() === "POST") blocks.push({ ...body, table });
      else if (url.searchParams.get("limit") !== "0") {
        blockReads++;
        const ranges = url.searchParams.getAll("chunk_index");
        const lo = Number(ranges.find((x) => x.startsWith("gte."))?.slice(4) ?? 0),
          hi = Number(ranges.find((x) => x.startsWith("lt."))?.slice(3) ?? 9999);
        output = blocks
          .filter(
            (row) =>
              row.table === table &&
              row.import_id === url.searchParams.get("import_id")?.slice(3) &&
              row.chunk_index >= lo &&
              row.chunk_index < hi,
          )
          .sort((a, b) => a.chunk_index - b.chunk_index);
      }
    }
    if (table === "publish_quality_import") {
      imports.find((row) => row.id === body.p_import_id).published_at = new Date().toISOString();
      output = null;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(output),
    });
  });
  await page.addInitScript(
    ({ actor }) => {
      const now = Math.floor(Date.now() / 1000),
        user = {
          id: actor,
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
          JSON.stringify({
            sub: actor,
            aud: "authenticated",
            role: "authenticated",
            exp: now + 3600,
          }),
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
    { actor },
  );
  function csv(start, end, corrected = false) {
    const rows = [
      "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO",
    ];
    for (let date = Date.parse(start); date <= Date.parse(end); date += 86400000) {
      const day = new Date(date).toISOString().slice(0, 10),
        br = day.split("-").reverse().join("/");
      rows.push(
        [
          "Z1",
          0,
          95,
          100,
          corrected && day === "2026-09-25" ? 140 : 127,
          `${br} 08:00:00`,
          br,
          "Natal",
          "Natal",
          "Instalação",
          1,
          "RN",
          `WO-${day}`,
          "NTL-DMV",
        ].join(";"),
      );
    }
    return rows.join("\r\n");
  }
  await page.goto(`http://127.0.0.1:5175${routePath}`);
  await page.locator("#goTC").waitFor();
  if (technicalVisit) {
    assert.equal(
      await page.getByRole("button", { name: "Importar QQ (.xlsx)", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Importar histórico HTML", exact: true }).count(),
      0,
    );
    assert.equal(await page.locator("#goGeneral").isVisible(), false);
    assert.equal(await page.locator("iframe").count(), 0);
  }
  const seed = await page.evaluate(
    async (text) => {
      const { parseTC } = await import("/src/lib/quality-import.ts");
      return parseTC(text, "base-inicial.csv");
    },
    csv("2026-08-22", "2026-10-05"),
  );
  const seedId = randomUUID();
  imports.push({
    id: seedId,
    kind: sourceKind,
    source_file: "base-inicial.csv",
    imported_by: actor,
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    row_count: seed.length,
    chunk_count: 1,
    metadata: { files: ["base-inicial.csv"] },
    base_import_id: null,
  });
  blocks.push({
    table: sourceTable,
    import_id: seedId,
    chunk_index: 0,
    records: seed,
  });
  let originalQC = null;
  if (technicalVisit) {
    const otherId = randomUUID(),
      otherRows = [{ ...seed[0], login: "AD_Z1", name: "Técnico Adesão", points: "222" }];
    imports.push({
      id: otherId,
      kind: "certification",
      source_file: "outra-base.csv",
      imported_by: actor,
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      row_count: 1,
      chunk_count: 1,
      metadata: {},
      base_import_id: null,
    });
    blocks.push({
      table: "quality_certification_data",
      import_id: otherId,
      chunk_index: 0,
      records: otherRows,
    });
    originalQC = JSON.stringify(otherRows);
  }
  await page.reload();
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("45 registros", { exact: false })
    .waitFor({ state: "attached" });
  const baselineReads = blockReads;
  async function upload(name, text, heading) {
    await page
      .locator("#referenceTC #fileInput")
      .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
    await page
      .getByRole("status", { name: "Resumo da importação TC" })
      .filter({ hasText: heading })
      .filter({ hasText: name })
      .waitFor();
  }
  const second = csv("2026-09-21", "2026-10-13", true);
  await upload("parcial.csv", second, "TC · Base atualizada");
  let report = page.getByRole("status", { name: "Resumo da importação TC" });
  await report.getByText("8 adicionados", { exact: false }).waitFor();
  assert.equal(imports.filter((row) => row.kind === sourceKind).at(-1).row_count, 53);
  assert.equal(writes, 1);
  await upload("parcial.csv", second, "TC · Sem alterações");
  await report.getByText("23 já existentes sem alteração", { exact: false }).waitFor();
  assert.equal(writes, 1);
  await upload("mesmo-arquivo-renomeado.csv", second, "TC · Sem alterações");
  await report.getByText("mesmo-arquivo-renomeado.csv", { exact: false }).waitFor();
  assert.equal(writes, 1);
  await upload("parcial.csv", csv("2026-09-21", "2026-10-20", true), "TC · Base atualizada");
  await report.getByText("7 adicionados", { exact: false }).waitFor();
  assert.equal(writes, 2);
  assert.equal(imports.filter((row) => row.kind === sourceKind).at(-1).row_count, 60);
  assert.equal(blockReads, baselineReads, "Unchanged bases were unnecessarily re-downloaded");
  const finalRows = blocks
    .filter((row) => row.import_id === imports.filter((item) => item.kind === sourceKind).at(-1).id)
    .flatMap((row) => row.records);
  assert.equal(finalRows.filter((row) => row.day === "2026-09-25").length, 1);
  assert.equal(finalRows.find((row) => row.day === "2026-09-25").points, "140");
  assert.equal(finalRows[0].day, "2026-08-22");
  assert.equal(finalRows.at(-1).day, "2026-10-20");
  await page.reload();
  await page.locator("#goTC").click();
  await page
    .locator("#referenceTC #fileMeta")
    .getByText("60 registros", { exact: false })
    .waitFor({ state: "attached" });
  if (technicalVisit) {
    assert.equal(
      JSON.stringify(blocks.find((row) => row.table === "quality_certification_data").records),
      originalQC,
    );
    assert.equal(imports.filter((row) => row.kind === "certification").length, 1);
    await page.screenshot({
      path: "C:/Users/Usuario/AppData/Local/Temp/technical-visit-preview.png",
    });
    await page.goto("http://127.0.0.1:5175/qualidade");
    await page.locator("#goTC").click();
    await page
      .locator("#referenceTC #fileMeta")
      .getByText("1 registros", { exact: false })
      .waitFor({ state: "attached" });
    await page
      .locator("#referenceTC #panelView")
      .getByText("222,0", { exact: true })
      .first()
      .waitFor();
    role = "supervisor";
    await page.goto(`http://127.0.0.1:5175${routePath}`);
    await page.reload();
    await page.locator("#referenceTC #fileInput").waitFor({ state: "attached" });
    assert.equal(await page.locator("#referenceTC #fileInput").isDisabled(), true);
    role = "controller";
    await page.goto(`http://127.0.0.1:5175${routePath}`);
    await page.waitForURL("**/escalas");
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      overlapPreserved: true,
      technicalVisit,
      independentBase: technicalVisit,
      correctionUpdated: true,
      sameFileNoWrite: true,
      renamedFileNoWrite: true,
      unchangedBaseNoDownload: true,
      total: 60,
      coverage: "22/08/2026–20/10/2026",
      publishedUpdates: writes,
      reload: true,
    }),
  );
} finally {
  await browser.close();
}
