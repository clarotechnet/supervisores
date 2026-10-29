import { mock } from "./supabase-mock.ts";
type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-edit/index.ts");
} finally {
  Deno.serve = serve;
}
const id = "10000000-0000-0000-0000-000000000001";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
async function run(
  options: {
    role?: string;
    sector?: string;
    expected?: string;
    formula?: boolean;
    auditError?: boolean;
    cacheError?: boolean;
    code?: string;
  } = {},
) {
  mock.role = options.role || "supervisor";
  mock.status = "active";
  mock.authenticated = true;
  mock.queryError = null;
  mock.auditError = options.auditError ? { message: "missing migration" } : null;
  mock.mutationCalls = [];
  mock.rpcCalls = [];
  const sector = options.sector || "vt",
    name = "FIXTURE USER",
    date = "2026-12-01";
  const rows: unknown[][] = [
    ["Mês-ano:", "2026-12-01", "", "2026-12-01"],
    ["Login", "Nome", "Função", "1"],
    ["ZFIXTURE", name, "TÉCNICO", "M. 1"],
  ];
  mock.sheet = {
    id,
    city: "natal",
    sector,
    schedule_month: "2026-12-01",
    source_file: "Google Sheets · TEST",
    source_sheet: "VT 2026-12",
    payload: {
      dates: [date],
      codes: ["M. 1"],
      people: [{ name, login: "ZFIXTURE", jobTitle: "TÉCNICO", assignments: { [date]: "M. 1" } }],
    },
  };
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetch = globalThis.fetch,
    names = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
      "GOOGLE_SHEETS_RN_MAIN_ID",
    ],
    previous = names.map((n) => Deno.env.get(n));
  names.forEach((n) =>
    Deno.env.set(n, n === "GOOGLE_SHEETS_RN_MAIN_ID" ? "official-fixture" : "fixture"),
  );
  globalThis.fetch = (async (url, init) => {
    const address = String(url),
      method = init?.method || "GET";
    calls.push({
      url: address,
      method,
      ...(init?.body
        ? { body: JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "{}") }
        : {}),
    });
    if (address.includes("oauth2")) return Response.json({ access_token: "fixture" });
    if (address.includes("values:batchUpdate")) {
      const body = JSON.parse(String(init?.body));
      assert(body.valueInputOption === "RAW", "unsafe value mode");
      assert(body.data.length === 1 && body.data[0].range === "'VT 2026-12'!D3", "wrong target");
      rows[2]![3] = body.data[0].values[0][0];
      if (options.cacheError) mock.queryError = { code: "fixture", message: "cache failed" };
      return Response.json({ totalUpdatedCells: 1 });
    }
    if (address.includes("valueRenderOption=FORMULA"))
      return Response.json({ values: [[options.formula ? "=TEST()" : "M. 1"]] });
    if (address.includes("!D3") || decodeURIComponent(address).includes("!D3"))
      return Response.json({ values: [[rows[2]![3]]] });
    if (address.includes("/values/")) return Response.json({ values: rows });
    return Response.json({
      properties: { title: "TEST" },
      sheets: [{ properties: { title: "VT 2026-12", sheetId: 71 } }],
    });
  }) as typeof globalThis.fetch;
  try {
    const response = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: id,
          name,
          date,
          expectedCode: options.expected ?? "M. 1",
          code: options.code ?? "AT",
        }),
      }),
    );
    return { response, body: await response.json(), calls };
  } finally {
    globalThis.fetch = fetch;
    names.forEach((n, i) =>
      previous[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, previous[i]!),
    );
    mock.queryError = null;
  }
}
Deno.test(
  "edição grava uma única célula RAW no Sheets oficial e atualiza o cache existente",
  async () => {
    const { response, body, calls } = await run();
    assert(response.status === 200 && body.sheetWritten === true, "edit failed");
    assert(
      calls.filter((c) => c.method === "POST" && !c.url.includes("oauth2")).length === 1,
      "multiple Google writes",
    );
    assert(
      calls.every((c) => !c.url.endsWith("/spreadsheets")),
      "created another spreadsheet",
    );
    assert(
      mock.mutationCalls[0]?.table === "schedule_sheet_edits" &&
        mock.mutationCalls[0].operation === "insert",
      "no audit before write",
    );
    assert(
      mock.mutationCalls.some((c) => c.table === "schedule_uploads" && c.operation === "update"),
      "existing cache not synchronized",
    );
  },
);
Deno.test("valor alterado por outra pessoa bloqueia gravação", async () => {
  const r = await run({ expected: "Folga" });
  assert(r.response.status === 409, "conflict accepted");
  assert(!r.calls.some((c) => c.url.includes("values:batchUpdate")), "conflict wrote Google");
});
Deno.test("fórmula nunca é substituída", async () => {
  const r = await run({ formula: true });
  assert(r.response.status === 409, "formula accepted");
  assert(!r.calls.some((c) => c.url.includes("values:batchUpdate")), "formula overwritten");
});
Deno.test("sem migration de auditoria nenhuma célula é gravada", async () => {
  const r = await run({ auditError: true });
  assert(r.response.status === 409, "audit failure accepted");
  assert(!r.calls.some((c) => c.url.includes("values:batchUpdate")), "write without audit");
});
Deno.test("falha do cache após Google confirma gravação parcial recuperável por API", async () => {
  const r = await run({ cacheError: true });
  assert(r.response.status === 502 && r.body.sheetWritten === true, "partial write hidden");
});
Deno.test("supervisor não edita Controle operacional", async () => {
  const r = await run({ sector: "controle-operacional" });
  assert(r.response.status === 403 && r.calls.length === 0, "Control permission bypass");
});
Deno.test("controlador não edita outras frentes", async () => {
  const r = await run({ role: "controller" });
  assert(r.response.status === 403 && r.calls.length === 0, "controller wrote");
});
Deno.test("código inválido falha antes de consultar Google", async () => {
  const r = await run({ code: "<script>" });
  assert(r.response.status === 400 && r.calls.length === 0, "invalid code accepted");
});
