// Browser smoke with synthetic REST and XLSX data. No network writes.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";

const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const base = process.env.QUALITY_QA_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let outside = 0;
let tiles = 0;
const scratch = await mkdtemp(join(tmpdir(), "vt-revisitas-qa-"));
async function file(name, rows) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Dados").addRows(rows);
  return {
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  };
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-11-19T15:00:00Z"));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const req = route.request();
    if (new URL(req.url()).origin !== new URL(base).origin || req.method() !== "GET") {
      outside++;
      return route.abort();
    }
    return route.continue();
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    tiles++;
    // Exercise the locally bundled fallback without making requests to OSM.
    return route.abort();
  });
  await page.route("**/vt-revisitas-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="pt-BR"><body style="padding:20px"><div id="host"></div></body></html>',
    }),
  );
  await page.route("**/src/hooks/useAuth.tsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export function useAuth() { return {user:{id:"vt-qa"},isAdmin:true}; }',
    }),
  );
  const registry = [
    ["Z10", "Maria Ana de Lima Teste", "FORTALEZA", "Visita técnica"],
    ["Z20", "Bia Lope Santos", "Fortaleza", "Visita técnica"],
    ["ZA01", "Pessoa da Adesão", "Fortaleza", "Adesão/Serviços"],
    ["ZN1", "Outro Teste", "Natal", "Visita técnica"],
    ["ZN2", "Segundo Teste", "Natal", "Visita técnica"],
    ...Array.from({ length: 8 }, (_, i) => [
      `ZX${i}`,
      `Técnico Teste ${i + 3}`,
      "Natal",
      "Visita técnica",
    ]),
  ].map(([login, full_name, city, sector]) => ({ login, full_name, city, sector, supervisor: "" }));
  await page.route("**/src/services/quality.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    const directory = ${JSON.stringify(registry)};
    export async function fetchQualityDirectory() {
      return structuredClone(globalThis.vtQaHideFortaleza ? directory.filter(r=>r.city.toUpperCase()!=='FORTALEZA') : directory);
    }
    export async function fetchQualityDataset() { throw Error('Unexpected TC dataset fetch'); }
    export async function fetchQualityRegistry() { throw Error('Unexpected TC registry fetch'); }
  `,
    }),
  );
  await page.route("**/src/services/vt-revisitas.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    const ledgerStorageKey = 'vt-qa-ledger';
    const ledger = new Map(JSON.parse(sessionStorage.getItem(ledgerStorageKey) ?? '[]'));
    export const vtPeriodKey = (user,city,month)=>['qa',user,city,month];
    export const vtHistoryKey = (user,city)=>['history',user,city];
    export const readVtPeriod = async (city,month)=>structuredClone(ledger.get(city+':'+month) ?? null);
    export const readVtHistory = async (city)=>[...ledger.values()].filter(r=>r.city===city).map(({period,closed_at})=>({period,closed_at}));
    export const vtErrorMessage = (e)=>e.message;
    export async function writeVtPeriod(scope,kind,payload) {
      const key=scope.city+':'+scope.period.slice(0,7);
      let row=ledger.get(key) ?? {...scope,orders:[],days:[],entries:[],sources:{},closed_at:null,snapshot:null};
      if (row.closed_at || row.revision!==scope.revision) throw Error('Competência fechada ou revisão desatualizada');
      if (kind==='close') {
        globalThis.vtQaClosedPayments=structuredClone(payload.payments);
        row={...row,closed_at:'2026-11-19T15:00:00Z',snapshot:payload};
      }
      else row={...row,[kind]:[...new Map([...row[kind],...payload.rows].map(r=>[r.id,r])).values()],sources:{...row.sources,[kind]:{file:payload.file,count:payload.rows.length,at:'2026-11-19T15:00:00Z'}}};
      ledger.set(key,{...row,revision:row.revision+1});
      sessionStorage.setItem(ledgerStorageKey, JSON.stringify([...ledger]));
    }
  `,
    }),
  );
  const mountPanel = () =>
    page.evaluate(async () => {
      const { injectIntoGlobalHook } = await import("/@react-refresh");
      injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      const path = "/src/components/quality/VtRevisitas.tsx";
      const source = await (await fetch(path)).text();
      const react = source.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
      const query = source.match(/from "([^"]*\/@tanstack_react-query\.js[^"]*)"/)?.[1];
      if (!react || !query) throw Error("Could not resolve development module URLs.");
      const r = await import(react),
        React = r.default ?? r;
      const dom = await import("/node_modules/.vite/deps/react-dom_client.js");
      const { QueryClient, QueryClientProvider } = await import(query);
      const { VtRevisitas } = await import(path);
      await import("/src/styles.css");
      (dom.default ?? dom)
        .createRoot(document.getElementById("host"))
        .render(
          React.createElement(
            QueryClientProvider,
            { client: new QueryClient() },
            React.createElement(VtRevisitas),
          ),
        );
    });
  await page.goto(`${base}/vt-revisitas-check`);
  await mountPanel();
  const open = (name) => page.getByRole("tab", { name, exact: true }).click();
  const heading = [
    "Data",
    "Núm. Contrato",
    "Número W.O",
    "Núm. OS",
    "Instalador",
    "Cidade",
    "Cód. Baixa",
    "Bairro",
    "Status",
    "Data da Baixa",
    "Desc. Cód. Baixa",
  ];
  const os = await file("ftz.xlsx", [
    heading,
    ["18/11/2026", "C1", "W1", "1", "Ana Teste", "Fortaleza", 517, "Centro"],
    ["19/11/2026", "C1", "W2", "1", "Pessoa da Adesão", "Fortaleza", 555, "Centro"],
    ["19/11/2026", "C2", "W2", "3", "Ana Teste", "Fortaleza", 302, "Centro"],
    ["19/11/2026", "C3", "W3", "4", "Ana Teste", "Fortaleza", "", "Centro", 1, ""],
    ["19/11/2026", "C4", "W4", "5", "Ana Teste", "Fortaleza", 0, "Centro", 3, "", "CANCELAMENTO"],
    ["18/11/2026", "C5", "W5", "6", "Z20", "Fortaleza", 1, "Centro", 3, "", "REVISITA CANCELADA"],
    ["19/11/2026", "C6", "W6", "7", "Ana Teste", "Fortaleza", 570, "Centro"],
    ["19/11/2026", "C7", "W7", "8", "Ana Teste", "Fortaleza", 203, "Centro"],
    ["19/11/2026", "C8", "W8", "9", "Ana Teste", "Fortaleza", 204, "Centro"],
    ["19/11/2026", "C9", "W9", "10", "Bia Lopes", "Fortaleza", 555, "Centro"],
    ...[6, 7, 8].map((n) => [
      "19/11/2026",
      `C${n}`,
      `WR${n}`,
      `R${n}`,
      "Pessoa da Adesão",
      "Fortaleza",
      517,
      "Centro",
    ]),
  ]);
  const sheetReview = await file("conferencia-sheets.xlsx", [
    [...heading, "Mês", "Equipe", "Prod", "Improd", "Expurgadas"],
    [
      "18/11/2026",
      "C1",
      "W1",
      "1",
      "Ana Teste",
      "Fortaleza",
      517,
      "Centro",
      3,
      "",
      "",
      "novembro 26",
      "VT",
      0,
      0,
      0,
    ],
    [
      "13/10/2026",
      "OLD",
      "WO",
      "100",
      "Ana Teste",
      "Fortaleza",
      517,
      "Centro",
      3,
      "",
      "",
      "outubro 26",
      "VT",
      0,
      0,
      0,
    ],
  ]);
  const ntl = await file("natal.xlsx", [
    heading,
    ["10/11/2026", "N1", "NW1", "1", "Outro Teste", "Natal", 517, "P NEGRA"],
    ["12/11/2026", "N1", "NW2", "2", "Outro Teste", "Natal", 555, "PONTA NEGRA"],
    ["13/11/2026", "N2", "NW3", "3", "Outro Teste", "Parnamirim", 517, "NV PARNAMIRIM"],
    ["14/11/2026", "N2", "NW4", "4", "Outro Teste", "Parnamirim", 517, "NOVA PARNAMIRIM"],
    ["15/11/2026", "N3", "NW5", "5", "Outro Teste", "Natal", 517, "L NOVA"],
    ["16/11/2026", "N3", "NW6", "6", "Outro Teste", "Natal", 517, "LAGOA NOVA"],
    ["16/11/2026", "N4", "NW7", "7", "Segundo Teste", "Natal", 302, "LAGOA NOVA"],
    ...Array.from({ length: 8 }, (_, index) => [
      "16/11/2026",
      `X${index}`,
      `WX${index}`,
      `X${index}`,
      `Técnico Teste ${index + 3}`,
      "Natal",
      517,
      "ALECRIM",
    ]),
  ]);
  const days = await file("dias.xlsx", [
    ["Técnico", "Login", "Dias Trabalhados"],
    ["Maria Ana de Lima Teste", "Z10", 20],
    ["Bia Lope Santos", "Z20", 15],
    ["Pessoa da Adesão", "ZA01", 25],
  ]);
  const entries = await file("entradas.xlsx", [
    ["Técnico", "Login", "Média Hora"],
    ["Maria Ana de Lima Teste", "Z10", "08:00"],
    ["Bia Lope Santos", "Z20", "08:10"],
    ["Pessoa da Adesão", "ZA01", "08:00"],
  ]);
  async function upload(input, label, pending = false, fromSheet = false) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator("input[type=file]").setInputFiles(input);
    if (pending) {
      await page
        .getByRole("alertdialog")
        .getByText(/Sem baixa: 1 linha\(s\).*Linhas 5/)
        .waitFor();
    }
    if (fromSheet)
      await page
        .getByRole("alertdialog")
        .getByText(/usar Prod, Improd e Expurgadas/)
        .waitFor();
    await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.getByText(/Importação concluída/).waitFor();
  }
  async function exportReport(format, nameCheck) {
    const event = page.waitForEvent("download", { timeout: 30000 });
    await page
      .getByRole("button", { name: `Exportar ${format.toUpperCase()}`, exact: true })
      .click();
    const download = await event;
    const filename = download.suggestedFilename();
    assert.match(filename, nameCheck);
    const target = join(scratch, filename);
    await download.saveAs(target);
    return target;
  }
  await upload(os, "Importar O.S.", true);
  await page.locator('[data-vt-chart="totals"] .recharts-line-curve').first().waitFor();
  await page.locator('[data-vt-chart="revisits"] .recharts-line-dot').first().waitFor();
  await page.getByText(/Mapa de ruas indisponível/).waitFor();
  await page.setViewportSize({ width: 1080, height: 1050 });
  assert.equal(
    await page
      .locator("[data-vt-kpis]")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length),
    7,
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  const map = page.getByRole("region", { name: "Mapa interativo de revisitas" });
  await map.getByRole("button", { name: "Aumentar zoom" }).click();
  await map.getByRole("button", { name: "Reenquadrar cidade" }).click();
  await map.getByRole("button", { name: "Centro: 1 revisita", exact: true }).click();
  assert.equal(
    await page.getByRole("row").filter({ hasText: "Maria Ana de Lima Teste" }).count(),
    1,
  );
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await upload(os, "Importar O.S.");
  await open("Ordens de serviço");
  assert.equal(await page.getByRole("row").count(), 8);
  assert.equal(await page.getByText("Pessoa da Adesão", { exact: true }).count(), 0);
  assert.deepEqual(
    await page.locator("#vt-tech option").evaluateAll((options) => options.map((o) => o.value)),
    ["", "Z20", "Z10"],
  );
  const classification = page.getByLabel("Classificação", { exact: true });
  const cancelledKpi = page.getByRole("button", { name: /^O\.S\. canceladas/ });
  assert.match(await cancelledKpi.innerText(), /\b2$/);
  await cancelledKpi.press("Enter");
  assert.equal(await cancelledKpi.getAttribute("aria-pressed"), "true");
  assert.equal(await classification.inputValue(), "cancelled");
  assert.equal(await page.getByRole("cell", { name: "Cancelada", exact: true }).count(), 2);
  assert.equal(await page.getByRole("row").count(), 3);
  const ordersScreenshot = join(scratch, "vt-revisitas-canceladas.png");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: ordersScreenshot, fullPage: true, animations: "disabled" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByLabel("De", { exact: true }).fill("2026-11-19");
  assert.equal(await page.getByRole("cell", { name: "Cancelada", exact: true }).count(), 1);
  await page.getByLabel("De", { exact: true }).fill("");
  await cancelledKpi.click();
  assert.equal(await classification.inputValue(), "all");
  assert.equal(await page.getByRole("row").count(), 8);
  await page.getByRole("button", { name: /^O\.S\. improdutivas/ }).click();
  assert.equal(await classification.inputValue(), "improductive");
  assert.equal(await page.getByRole("cell", { name: "Improdutiva", exact: true }).count(), 1);
  assert.equal(await page.getByRole("row").count(), 2);
  const rateKpi = page.getByRole("button", { name: /^Taxa de revisita/ });
  await rateKpi.click();
  assert.equal(await rateKpi.getAttribute("aria-pressed"), "true");
  assert.equal(await classification.inputValue(), "revisit");
  assert.equal(
    await page.getByRole("cell", { name: "Revisita produtiva", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: /^O\.S\. expurgadas/ }).click();
  assert.equal(await classification.inputValue(), "expunge");
  assert.equal(await page.getByRole("cell", { name: "Expurgada", exact: true }).count(), 3);
  for (const code of ["570", "203", "204"]) {
    assert.equal(await page.getByRole("cell", { name: code, exact: true }).count(), 1);
  }
  await classification.selectOption("productive");
  assert.equal(
    await page.getByRole("button", { name: /^O\.S\. produtivas/ }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.getByRole("row").count(), 5);
  await page.getByRole("button", { name: /^O\.S\. no recorte/ }).click();
  assert.equal(await classification.inputValue(), "all");
  await page.getByLabel("Técnico", { exact: true }).selectOption("Z20");
  assert.equal(await page.getByRole("row").count(), 2);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await upload(sheetReview, "Importar O.S.", false, true);
  await page.getByText(/1 O\.S\. do recorte com classificação importada do Sheets/).waitFor();
  assert.match(
    await page.getByRole("button", { name: /^Revisitas produtivas/ }).innerText(),
    /\b0$/,
  );
  await open("Pagamentos");
  assert.equal(
    await page.getByRole("button", { name: "Fechar período", exact: true }).isDisabled(),
    true,
  );
  await open("Dias trabalhados");
  await upload(days, "Importar XLSX");
  await open("Média de entradas");
  await upload(entries, "Importar XLSX");
  await open("Pagamentos");
  const ana = page.getByRole("row").filter({ hasText: "Maria Ana de Lima Teste" });
  const bia = page.getByRole("row").filter({ hasText: "Bia Lope Santos" });
  assert.match(await ana.innerText(), /20\s+08:00:00/);
  assert.match(await bia.innerText(), /15\s+08:10:00/);
  assert.equal(await page.getByRole("row").filter({ hasText: "Pessoa da Adesão" }).count(), 0);
  assert.match(await bia.innerText(), /Pendente/);
  assert.equal(await page.getByRole("button", { name: "Fechar período" }).isDisabled(), true);
  const linkBia = page.getByLabel("Vincular Bia Lopes", { exact: true });
  const undoBia = page.getByRole("button", { name: "Desfazer vínculo: Bia Lopes", exact: true });
  await linkBia.selectOption("LOGIN:Z20");
  await undoBia.waitFor();
  await page.reload();
  await mountPanel();
  await open("Pagamentos");
  await undoBia.waitFor();
  assert.doesNotMatch(await bia.innerText(), /Pendente/);
  await undoBia.click();
  await linkBia.waitFor();
  await page.reload();
  await mountPanel();
  await open("Pagamentos");
  await linkBia.waitFor();
  assert.match(await bia.innerText(), /Pendente/);
  await linkBia.selectOption("LOGIN:Z20");
  await undoBia.waitFor();
  await page.getByLabel("Técnico", { exact: true }).selectOption("Z10");
  await open("Dias trabalhados");
  assert.equal(await page.getByRole("row").count(), 2);
  assert.match(await page.getByRole("row").last().innerText(), /Maria Ana de Lima Teste/);
  await page.getByLabel("Técnico", { exact: true }).selectOption("");
  await open("Pagamentos");
  await page.getByLabel("Conferi as regras e os resultados desta cidade.").check();
  await page.getByRole("button", { name: "Fechar período", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar fechamento", exact: true }).click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await page.getByText(/Histórico congelado/).waitFor();
  const closedPayments = await page.evaluate(() => globalThis.vtQaClosedPayments);
  assert.deepEqual(
    closedPayments.map(({ login, revisits }) => [login, revisits]),
    [
      ["Z20", 0],
      ["Z10", 0],
    ],
  );
  assert.match(await bia.innerText(), /Bia Lope Santos/);
  assert.equal(await page.getByLabel("Vincular Bia Lopes", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Importar O.S.", exact: true }).isDisabled(),
    true,
  );
  const paymentScreenshot = join(scratch, "vt-revisitas-pagamentos.png");
  await page.screenshot({ path: paymentScreenshot, fullPage: true });
  await page.getByLabel("Cidade", { exact: true }).selectOption("natal");
  await upload(ntl, "Importar O.S.");
  await open("Gráficos");
  assert.equal(await map.locator("[data-vt-hotspot]").count(), 3);
  await map.getByRole("button", { name: "Ponta Negra · Natal: 1 revisita", exact: true }).waitFor();
  await map
    .getByRole("button", { name: "Nova Parnamirim · Parnamirim: 1 revisita", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Ver técnico Maria Ana de Lima Teste" }).count(),
    0,
  );
  const chartScreenshot = join(scratch, "vt-revisitas-graficos.png");
  await page.screenshot({ path: chartScreenshot, fullPage: true });
  const pngReport = await exportReport("png", /technet-revisitas-natal-2026-11\.png/);
  const pngBytes = await readFile(pngReport);
  assert.equal(pngBytes.subarray(1, 4).toString(), "PNG");
  assert.equal(pngBytes.readUInt32BE(16), 2240);
  assert.ok(pngBytes.readUInt32BE(20) > 1800); // includes the continuation of the ranking
  const cityPdfReport = await exportReport("pdf", /technet-revisitas-natal-2026-11\.pdf/);
  const cityPdf = await PDFDocument.load(await readFile(cityPdfReport));
  assert.equal(cityPdf.getPageCount(), 2);

  await page.getByRole("button", { name: "Ver técnico Outro Teste", exact: true }).click();
  await page.locator('[data-vt-chart="technician"] .recharts-line-dot').first().waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Gráficos", exact: true }).getAttribute("data-state"),
    "active",
  );
  assert.equal(await page.getByRole("row").filter({ hasText: "Outro Teste" }).count(), 6);
  await page.getByLabel("Classificação", { exact: true }).selectOption("revisit");
  assert.equal(await page.getByRole("row").filter({ hasText: "Outro Teste" }).count(), 3);
  await page.getByLabel("Até", { exact: true }).fill("2026-11-13");
  assert.equal(await page.getByRole("row").filter({ hasText: "Outro Teste" }).count(), 2);
  assert.equal(await map.locator("[data-vt-hotspot]").count(), 2);
  const pdfReport = await exportReport("pdf", /technet-revisitas-natal-2026-11-outro-teste\.pdf/);
  const pdf = await PDFDocument.load(await readFile(pdfReport));
  assert.equal(pdf.getPageCount(), 1);
  assert.match(pdf.getTitle(), /Natal \/ Parnamirim/);
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.setViewportSize({ width: 392, height: 860 });
  await page.locator('[data-vt-chart="totals"] .recharts-line-curve').first().waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  const mobileScreenshot = join(scratch, "vt-revisitas-mobile.png");
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await open("Ordens de serviço");
  await cancelledKpi.click();
  await page.getByText("Nenhuma ordem encontrada para os filtros.", { exact: true }).waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  const ordersMobileScreenshot = join(scratch, "vt-revisitas-ordens-mobile.png");
  await page.screenshot({ path: ordersMobileScreenshot, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel("Cidade", { exact: true }).selectOption("fortaleza");
  await open("Pagamentos");
  await page.getByText(/Histórico congelado/).waitFor();
  assert.equal(await ana.count(), 1);
  await page.evaluate(() => {
    globalThis.vtQaHideFortaleza = true;
  });
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.locator("#vt-tech").waitFor({ state: "hidden" });
  assert.equal(await ana.count(), 1);
  assert.deepEqual(errors, []);
  assert.equal(outside, 0);
  assert.ok(tiles > 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        charts: chartScreenshot,
        mobile: mobileScreenshot,
        payments: paymentScreenshot,
        orders: ordersScreenshot,
        ordersMobile: ordersMobileScreenshot,
        pngReport,
        pdfReport,
        cityPdfReport,
        interceptedTiles: tiles,
        externalRequests: outside,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error({ errors, outside });
  throw error;
} finally {
  await browser.close();
}
