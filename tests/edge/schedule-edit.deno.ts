import { mock } from "./supabase-mock.ts";
import {
  controlMonthValues,
  CONTROL_EXPECTED_MASTER_ID,
} from "../../supabase/functions/_shared/schedule-operational-master.ts";
import type { Payload } from "../../supabase/functions/_shared/schedule-operational.ts";
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
    officialControl?: boolean;
    auditReady?: boolean;
    badControlName?: boolean;
  } = {},
) {
  mock.role = options.role || "supervisor";
  mock.status = "active";
  mock.authenticated = true;
  mock.queryError = null;
  mock.auditError = options.auditError ? { message: "missing migration" } : null;
  mock.mutationCalls = [];
  mock.rpcCalls = [];
  mock.rowsByTable = {};
  mock.metadataAuditReady = options.auditReady ?? true;
  const control = options.officialControl === true;
  const sector = control ? "controle-operacional" : options.sector || "vt",
    name = "FIXTURE USER",
    date = "2026-12-01";
  const baseCode = control ? "T. 1" : "M. 1";
  const tab = control ? "Controle DEZEMBRO 26 - 5X2" : "VT 2026-12";
  const target = control ? "'Controle DEZEMBRO 26 - 5X2'!C4" : "'VT 2026-12'!D3";
  const controlPayload: Payload = {
    dates: [date],
    codes: [baseCode],
    people: [
      { name, jobTitle: "CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO", assignments: { [date]: baseCode } },
      { name: "OTHER CONTROL USER", jobTitle: "ANALISTA", assignments: { [date]: baseCode } },
    ],
  };
  const rows: unknown[][] = control
    ? controlMonthValues(controlPayload, date)
    : [
        ["Mês-ano:", "2026-12-01", "", "2026-12-01"],
        ["Login", "Nome", "Função", "1"],
        ["ZFIXTURE", name, "TÉCNICO", "M. 1"],
      ];
  if (control) {
    rows[0]![1] = 46357;
    rows[2]![1] = "CONTROLADOR (ADESÃO) - FTZ - APOIO";
    [rows[2], rows[3]] = [rows[3]!, rows[2]!];
    if (options.badControlName) rows[3]![0] = "UNKNOWN CONTROL USER";
  }
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
  if (control) {
    mock.sheet["source_file"] = "Google Sheets - Escala operacional oficial";
    mock.sheet["source_sheet"] = tab;
    mock.sheet["payload"] = controlPayload;
    mock.rowsByTable["schedule_generation_drafts"] = { id: "approved-draft" };
    mock.rowsByTable["schedule_operational_sheets"] = {
      id: "operational-fixture",
      draft_id: "approved-draft",
      city: "natal",
      sector,
      schedule_month: date,
      spreadsheet_id: CONTROL_EXPECTED_MASTER_ID,
      sheet_tab: tab,
      planned_payload: controlPayload,
      current_payload: controlPayload,
      updated_at: "2026-10-29T12:00:00Z",
    };
  }
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
      assert(body.data.length === 1 && body.data[0].range === target, "wrong target");
      rows[control ? 3 : 2]![control ? 2 : 3] = body.data[0].values[0][0];
      if (options.cacheError) mock.queryError = { code: "fixture", message: "cache failed" };
      return Response.json({ totalUpdatedCells: 1 });
    }
    if (address.includes("valueRenderOption=FORMULA"))
      return Response.json({ values: [[options.formula ? "=TEST()" : baseCode]] });
    if (decodeURIComponent(address).includes(control ? "!C4" : "!D3"))
      return Response.json({ values: [[rows[control ? 3 : 2]![control ? 2 : 3]]] });
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
          expectedCode: options.expected ?? baseCode,
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

Deno.test(
  "admin edita a célula correta no Controle reordenado e sincroniza funções com auditoria",
  async () => {
    const { response, body, calls } = await run({ officialControl: true, role: "admin" });
    assert(response.status === 200 && body.sheetWritten === true, "Control edit failed");
    const writes = calls.filter((c) => c.url.includes("values:batchUpdate"));
    assert(writes.length === 1, "unexpected Google writes");
    assert(
      calls
        .filter((c) => !c.url.includes("oauth2"))
        .every((c) => c.url.includes(CONTROL_EXPECTED_MASTER_ID)),
      "read a different workbook",
    );
    assert(
      mock.rpcCalls.map((c) => c.name).join(",") ===
        "schedule_operational_metadata_audit_ready,schedule_operational_apply_sync",
      "audit not checked",
    );
    const next = mock.rpcCalls[1]!.args["p_payload"] as Payload;
    assert(
      next.people[0]!.name === "FIXTURE USER" &&
        next.people[0]!.jobTitle === "CONTROLADOR (ADESÃO) - FTZ - APOIO" &&
        next.people[0]!.assignments["2026-12-01"] === "AT",
      "edited person lost metadata/code",
    );
    assert(next.people[1]!.assignments["2026-12-01"] === "T. 1", "edited another person's cell");
    const baseline = mock.rowsByTable["schedule_operational_sheets"]!["planned_payload"] as Payload;
    assert(
      baseline.people[0]!.jobTitle === "CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO",
      "plan overwritten",
    );
  },
);
Deno.test(
  "Controle com função alterada e sem auditoria bloqueia edição antes de gravar",
  async () => {
    const { response, calls } = await run({
      officialControl: true,
      role: "admin",
      auditReady: false,
    });
    assert(response.status === 409, "missing metadata audit accepted");
    assert(
      !calls.some((c) => c.url.includes("values:batchUpdate")),
      "Google changed without audit",
    );
    assert(mock.mutationCalls.length === 0, "edit prepared before metadata validation");
    assert(
      mock.rpcCalls.length === 1 &&
        mock.rpcCalls[0]!.name === "schedule_operational_metadata_audit_ready",
      "unprotected sync attempted",
    );
  },
);
Deno.test("Controle com pessoa desconhecida bloqueia edição antes de gravar", async () => {
  const { response, calls } = await run({
    officialControl: true,
    role: "admin",
    badControlName: true,
  });
  assert(response.status === 409, "unknown person accepted");
  assert(
    !calls.some((c) => c.url.includes("values:batchUpdate")),
    "invalid structure changed Google",
  );
  assert(
    mock.mutationCalls.length === 0 && mock.rpcCalls.length === 0,
    "invalid structure reached mutations",
  );
});
