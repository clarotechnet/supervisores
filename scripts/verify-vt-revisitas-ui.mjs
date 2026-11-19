// Browser smoke with synthetic REST and XLSX data. No network writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";

const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const base = process.env.QUALITY_QA_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let outside = 0;
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
  await page.route("**/src/services/vt-revisitas.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    const ledger = new Map();
    export const vtPeriodKey = (user,city,month)=>['qa',user,city,month];
    export const vtHistoryKey = (user,city)=>['history',user,city];
    export const readVtPeriod = async (city,month)=>structuredClone(ledger.get(city+':'+month) ?? null);
    export const readVtHistory = async (city)=>[...ledger.values()].filter(r=>r.city===city).map(({period,closed_at})=>({period,closed_at}));
    export const vtErrorMessage = (e)=>e.message;
    export async function writeVtPeriod(scope,kind,payload) {
      const key=scope.city+':'+scope.period.slice(0,7);
      let row=ledger.get(key) ?? {...scope,orders:[],days:[],entries:[],sources:{},closed_at:null,snapshot:null};
      if (row.closed_at || row.revision!==scope.revision) throw Error('Competência fechada ou revisão desatualizada');
      if (kind==='close') row={...row,closed_at:'2026-11-19T15:00:00Z',snapshot:payload};
      else row={...row,[kind]:[...new Map([...row[kind],...payload.rows].map(r=>[r.id,r])).values()],sources:{...row.sources,[kind]:{file:payload.file,count:payload.rows.length,at:'2026-11-19T15:00:00Z'}}};
      ledger.set(key,{...row,revision:row.revision+1});
    }
  `,
    }),
  );
  await page.goto(`${base}/vt-revisitas-check`);
  await page.evaluate(async () => {
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
  ];
  const os = await file("ftz.xlsx", [
    heading,
    ["18/11/2026", "C1", "W1", "1", "Ana Teste", "Fortaleza", 517, "Centro"],
    ["19/11/2026", "C1", "W2", "2", "Bia Lopes", "Fortaleza", 555, "Centro"],
    ["19/11/2026", "C2", "W2", "3", "Ana Teste", "Fortaleza", 302, "Centro"],
  ]);
  const ntl = await file("natal.xlsx", [
    heading,
    ["18/11/2026", "C1", "W1", "1", "Outro Teste", "Parnamirim", 517, "Centro"],
  ]);
  const days = await file("dias.xlsx", [
    ["Técnico", "Login", "Dias Trabalhados"],
    ["Maria Ana de Lima Teste", "Z10", 20],
    ["Bia Lope Santos", "Z20", 15],
  ]);
  const entries = await file("entradas.xlsx", [
    ["Técnico", "Login", "Média Hora"],
    ["Maria Ana de Lima Teste", "Z10", "08:00"],
    ["Bia Lope Santos", "Z20", "08:10"],
  ]);
  async function upload(input, label) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator("input[type=file]").setInputFiles(input);
    await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.getByText(/Importação concluída/).waitFor();
  }
  await upload(os, "Importar O.S.");
  await page.locator(".recharts-bar-rectangle").first().waitFor();
  const chartScreenshot = join(tmpdir(), "vt-revisitas-graficos.png");
  await page.screenshot({ path: chartScreenshot, fullPage: true });
  await page.getByRole("button", { name: /CENTRO, 2026-11-18: 1 revisitas/ }).click();
  assert.equal(await page.getByRole("row").filter({ hasText: "Ana Teste" }).count(), 1);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await upload(os, "Importar O.S.");
  assert.equal(await page.getByRole("row").count(), 4);
  await page.getByLabel("Técnico", { exact: true }).selectOption("Bia Lopes");
  assert.equal(await page.getByRole("row").count(), 2);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
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
  const ana = page.getByRole("row").filter({ hasText: "Ana Teste" });
  const bia = page.getByRole("row").filter({ hasText: "Bia Lopes" });
  assert.match(await ana.innerText(), /20\s+08:00:00/);
  assert.match(await bia.innerText(), /15\s+08:10:00/);
  assert.match(await bia.innerText(), /Pendente/);
  assert.equal(await page.getByRole("button", { name: "Fechar período" }).isDisabled(), true);
  await page.getByLabel("Vincular Bia Lopes", { exact: true }).selectOption("LOGIN:Z20");
  assert.doesNotMatch(await bia.innerText(), /Pendente/);
  await page.getByLabel("Técnico", { exact: true }).selectOption("Ana Teste");
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
  assert.match(await bia.innerText(), /Bia Lope Santos/);
  assert.equal(await page.getByLabel("Vincular Bia Lopes", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Importar O.S.", exact: true }).isDisabled(),
    true,
  );
  const paymentScreenshot = join(tmpdir(), "vt-revisitas-pagamentos.png");
  await page.screenshot({ path: paymentScreenshot, fullPage: true });
  await page.getByLabel("Cidade", { exact: true }).selectOption("natal");
  await upload(ntl, "Importar O.S.");
  assert.equal(await page.getByRole("row").filter({ hasText: "Outro Teste" }).count(), 1);
  assert.equal(await page.getByRole("row").filter({ hasText: "Ana Teste" }).count(), 0);
  await page.getByLabel("Cidade", { exact: true }).selectOption("fortaleza");
  await page.getByText(/Histórico congelado/).waitFor();
  assert.equal(await page.getByRole("row").filter({ hasText: "Ana Teste" }).count(), 1);
  assert.deepEqual(errors, []);
  assert.equal(outside, 0);
  console.log(
    JSON.stringify(
      { ok: true, charts: chartScreenshot, payments: paymentScreenshot, externalRequests: outside },
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
