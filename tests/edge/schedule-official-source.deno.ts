import { mock } from "./supabase-mock.ts";
import {
  officialMonthValues,
  officialMonthTitle,
} from "../../supabase/functions/_shared/schedule-google-source.ts";
const dates = Array.from({ length: 31 }, (_, i) => "2026-12-" + String(i + 1).padStart(2, "0"));
const payload = {
  dates,
  codes: ["M. 1"],
  people: [
    {
      name: "FIXTURE",
      login: "ZFIXTURE",
      jobTitle: "TEST",
      assignments: Object.fromEntries(
        dates.map((d) => {
          const weekday = new Date(d + "T12:00:00Z").getUTCDay();
          return [d, weekday === 2 || weekday === 3 ? "Folga" : "M. 1"];
        }),
      ),
    },
  ],
};
type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-operational/index.ts");
} finally {
  Deno.serve = serve;
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
async function run(action: "create" | "publish", existing = false, includeRevision = true) {
  mock.role = "admin";
  mock.status = "active";
  mock.authenticated = true;
  mock.queryError = null;
  mock.rpcError = null;
  mock.auditError = null;
  mock.mutationCalls = [];
  mock.rpcCalls = [];
  mock.sheet = {
    id: "20000000-0000-0000-0000-000000000001",
    draft_id: "20000000-0000-0000-0000-000000000001",
    city: "natal",
    sector: "vt",
    schedule_month: "2026-12-01",
    payload,
    planned_payload: payload,
    current_payload: payload,
    policy_snapshot: {},
    status: "draft",
    archived_at: null,
    spreadsheet_id: "official-fixture",
    sheet_tab: officialMonthTitle("vt", "2026-12"),
    updated_at: "2026-10-28T12:00:00Z",
  };
  mock.rowsByTable = action === "create" ? { schedule_operational_sheets: null } : {};
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
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  globalThis.fetch = (async (url, init) => {
    const address = String(url),
      method = init?.method || "GET",
      body = init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : null;
    calls.push({ url: address, method, body });
    if (address.includes("oauth2")) return Response.json({ access_token: "fixture" });
    assert(address.includes("/spreadsheets/official-fixture"), "not official workbook");
    if (address.includes("/values/"))
      return Response.json({ values: officialMonthValues(payload, "2026-12") });
    if (address.includes(":batchUpdate") && body?.requests)
      return Response.json({ replies: [{ addSheet: { properties: { sheetId: 92 } } }] });
    if (address.includes("values:batchUpdate")) return Response.json({ totalUpdatedCells: 124 });
    return Response.json({
      properties: { title: "Official fixture" },
      sheets: existing
        ? [{ properties: { title: officialMonthTitle("vt", "2026-12"), sheetId: 92 } }]
        : [],
    });
  }) as typeof globalThis.fetch;
  try {
    const response = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "create" || includeRevision ? { draftId: mock.sheet.id } : {}),
          sheetId: mock.sheet.id,
        }),
      }),
    );
    return { response, body: await response.json(), calls };
  } finally {
    globalThis.fetch = fetch;
    mock.rowsByTable = {};
    names.forEach((n, i) =>
      previous[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, previous[i]!),
    );
  }
}
Deno.test(
  "nova VT cria apenas uma aba mensal no workbook oficial, sem arquivo ou PLANEJADA",
  async () => {
    const r = await run("create");
    assert(r.response.status === 200, "monthly creation failed");
    assert(r.calls.filter((c) => c.body?.requests).length === 1, "unexpected tab operations");
    assert(JSON.stringify(r.calls).includes("addSheet"), "monthly tab not created");
    assert(!JSON.stringify(r.calls).includes("PLANEJADA"), "parallel planning tab created");
    assert(
      mock.mutationCalls.some(
        (c) =>
          c.table === "schedule_operational_sheets" &&
          (c.values as Record<string, unknown>).spreadsheet_id === "official-fixture",
      ),
      "wrong stored workbook",
    );
    assert(mock.rpcCalls.length === 0, "creation approved automatically");
  },
);
Deno.test("aba oficial existente impede outra cópia ou sobrescrita", async () => {
  const r = await run("create", true);
  assert(r.response.status === 409, "duplicate accepted");
  assert(
    r.calls.every((c) => c.method === "GET" || c.url.includes("oauth2")),
    "existing tab modified",
  );
});
Deno.test("admin publica VT explicitamente e Google permanece somente leitura", async () => {
  const r = await run("publish");
  assert(r.response.status === 200 && r.body.published === true, "publication failed");
  assert(
    mock.rpcCalls[0]?.name === "schedule_operational_publish_revision",
    "no atomic revision publication",
  );
  assert(
    r.calls.every((c) => c.method === "GET" || c.url.includes("oauth2")),
    "publication wrote Google",
  );
});

Deno.test("cliente anterior ainda publica VT sem draftId e sem gravar no Google", async () => {
  const r = await run("publish", false, false);
  assert(r.response.status === 200 && r.body.published === true, "legacy publication failed");
  assert(mock.rpcCalls[0]?.name === "schedule_operational_publish", "legacy RPC changed");
  assert(
    r.calls.every((c) => c.method === "GET" || c.url.includes("oauth2")),
    "legacy publication wrote Google",
  );
});
