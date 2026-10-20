// Large synthetic quarterly import; no user files or production requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto("http://127.0.0.1:5175");
  const result = await page.evaluate(async () => {
    const { runTCImportTask } = await import("/src/lib/quality-import-task.ts");
    const header =
      "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO";
    const rows = Array.from({ length: 100000 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 6, 1 + (index % 90)))
        .toISOString()
        .slice(0, 10)
        .split("-")
        .reverse()
        .join("/");
      return `Z${index % 1000};0;95;100;127;${day} 08:00:00;${day};Natal;Natal;Instalação;1;RN;QA-WO-${index};NTL-DMV`;
    });
    const file = new File([[header, ...rows].join("\r\n")], "quarterly.csv", { type: "text/csv" });
    const stages = [];
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const start = performance.now();
    try {
      const first = await runTCImportTask(file, undefined, "certification", (stage) =>
        stages.push(stage),
      );
      const firstMs = performance.now() - start;
      const repeat = await runTCImportTask(file, first.snapshot, "certification", () => {});
      return {
        bytes: file.size,
        count: first.snapshot.records.length,
        firstChanged: first.changed,
        repeatCount: repeat.snapshot.records.length,
        repeatChanged: repeat.changed,
        firstReport: first.report,
        repeatReport: repeat.report,
        ticks,
        stages,
        firstMs: Math.round(firstMs),
        totalMs: Math.round(performance.now() - start),
      };
    } finally {
      clearInterval(timer);
    }
  });
  assert.equal(result.count, 100000);
  assert.equal(result.repeatCount, 100000);
  assert.equal(result.firstChanged, true);
  assert.equal(result.repeatChanged, false);
  assert(result.ticks > 10, "The browser continues processing while imports run");
  assert.deepEqual(result.stages, ["reading", "validating", "merging", "comparing"]);
  console.log(JSON.stringify({ ...result, productionRequests: 0 }));
} finally {
  await browser.close();
}
