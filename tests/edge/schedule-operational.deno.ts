import { officialMonthValues } from "../../supabase/functions/_shared/schedule-google-source.ts";
// Run with Deno and tests/edge/import-map.json; no network permission is granted.
import { mock } from "./supabase-mock.ts";
import {
  controlMonthValues,
  CONTROL_EXPECTED_MASTER_ID,
} from "../../supabase/functions/_shared/schedule-operational-master.ts";
import type { Payload } from "../../supabase/functions/_shared/schedule-operational.ts";
type Handler = (request: Request) => Response | Promise<Response>;
let handler: Handler;
const originalServe = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-operational/index.ts");
} finally {
  Deno.serve = originalServe;
}
const sheetId = "20000000-0000-0000-0000-000000000001";
const dates = Array.from({ length: 31 }, (_, i) => "2026-12-" + String(i + 1).padStart(2, "0"));
const payload: Payload = {
  dates,
  codes: ["T. 1"],
  people: [
    {
      name: "TEST EMPLOYEE",
      jobTitle: "CONTROLADOR",
      assignments: Object.fromEntries(dates.map((date) => [date, "T. 1"])),
    },
  ],
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
async function run(action: unknown = "publish", changeRows?: (rows: string[][]) => void) {
  const googleCalls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
  ];
  const previous = names.map((name) => Deno.env.get(name));
  names.forEach((name) => Deno.env.set(name, "test-fixture"));
  globalThis.fetch = ((url: string | URL | Request, options?: RequestInit) => {
    const address = String(url);
    googleCalls.push({ url: address, method: options?.method ?? "GET" });
    const control = mock.sheet["sector"] === "controle-operacional";
    const rows = control
      ? controlMonthValues(payload, "2026-12-01")
      : officialMonthValues(payload, "2026-12-01");
    rows[2]![control ? 2 : 3] = "FALTA";
    changeRows?.(rows);
    if (address === "https://oauth2.googleapis.com/token")
      return Promise.resolve(Response.json({ access_token: "mock-google-token" }));
    assert(
      address.startsWith("https://sheets.googleapis.com/v4/spreadsheets/"),
      "unexpected network target",
    );
    assert(!options?.method || options.method === "GET", "Google write attempted");
    return Promise.resolve(Response.json({ values: rows }));
  }) as typeof fetch;
  try {
    const response = await handler(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify(action === null ? null : { action, sheetId }),
      }),
    );
    return { response, body: await response.json(), googleCalls };
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, i) =>
      previous[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[i]!),
    );
  }
}
function reset() {
  mock.role = "admin";
  mock.status = "active";
  mock.authenticated = true;
  mock.rpcCalls = [];
  mock.rpcError = null;
  mock.sheet = {
    id: sheetId,
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-12-01",
    spreadsheet_id: CONTROL_EXPECTED_MASTER_ID,
    sheet_tab: "Controle DEZEMBRO 26 - 5X2",
    planned_payload: payload,
    current_payload: payload,
    updated_at: "2026-10-28T12:00:00Z",
  };
}
Deno.test("admin explicitly publishes via one atomic RPC, Google is read-only", async () => {
  reset();
  const { response, body, googleCalls } = await run();
  assert(
    response.status === 200 && body.published === true && body.officialId === "official-id",
    "publication not confirmed",
  );
  assert(mock.rpcCalls.length === 1, "publication used separate synchronization RPC");
  const call = mock.rpcCalls[0]!;
  assert(call.name === "schedule_operational_publish", "wrong RPC");
  assert(
    call.args["p_expected_updated_at"] === mock.sheet["updated_at"],
    "concurrency token missing",
  );
  assert((call.args["p_changes"] as unknown[]).length === 1, "cell change missing");
  assert(
    googleCalls.length === 2 && googleCalls[1]!.method === "GET",
    "unexpected Google operations",
  );
  assert(
    decodeURIComponent(googleCalls[1]!.url).includes("'Controle DEZEMBRO 26 - 5X2'"),
    "wrong Google tab",
  );
});
Deno.test("supervisor cannot approve or read Google during publication", async () => {
  reset();
  mock.role = "supervisor";
  const result = await run();
  assert(result.response.status === 403, "supervisor approved");
  assert(
    mock.rpcCalls.length === 0 && result.googleCalls.length === 0,
    "rejected request had side effects",
  );
});
Deno.test("inactive admin cannot approve", async () => {
  reset();
  mock.status = "pending";
  const result = await run();
  assert(result.response.status === 403 && mock.rpcCalls.length === 0, "pending admin approved");
});
Deno.test("invalid session cannot approve", async () => {
  reset();
  mock.authenticated = false;
  assert(
    (await run()).response.status === 401 && mock.rpcCalls.length === 0,
    "invalid session accepted",
  );
});
Deno.test("ordinary API synchronization never calls publication", async () => {
  reset();
  const { response, body } = await run("sync");
  assert(response.status === 200 && !body.published, "sync auto-published");
  assert(
    mock.rpcCalls.length === 1 && mock.rpcCalls[0]!.name === "schedule_operational_apply_sync",
    "wrong sync RPC",
  );
});
Deno.test("no-op synchronization still validates official linkage", async () => {
  reset();
  const current = structuredClone(payload);
  current.people[0]!.assignments["2026-12-01"] = "FALTA";
  mock.sheet["current_payload"] = current;
  const result = await run("sync");
  assert(result.response.status === 200 && result.body.changes === 0, "unexpected change");
  assert(mock.rpcCalls.length === 1, "no-op skipped link validation");
});
Deno.test("conflict error remains visible and publication is not confirmed", async () => {
  reset();
  mock.rpcError = { code: "40001", message: "Conflito: recarregue" };
  const result = await run();
  assert(
    result.response.status === 409 &&
      result.body.error === "Conflito: recarregue" &&
      !result.body.published,
    "conflict hidden",
  );
});
Deno.test("legacy or wrong workbook is blocked before reading Google", async () => {
  reset();
  mock.sheet["spreadsheet_id"] = "OTHER";
  const result = await run();
  assert(
    result.response.status === 409 && result.googleCalls.length === 0 && mock.rpcCalls.length === 0,
    "wrong workbook accepted",
  );
});
Deno.test("wrong monthly tab is blocked", async () => {
  reset();
  mock.sheet["sheet_tab"] = "Controle NOVEMBRO 26 - ORIGINAL";
  const result = await run();
  assert(
    result.response.status === 409 && result.googleCalls.length === 0,
    "historical tab accepted",
  );
});
Deno.test("malformed body returns 400", async () => {
  reset();
  assert(
    (await run(null)).response.status === 400 && mock.rpcCalls.length === 0,
    "malformed body accepted",
  );
});

Deno.test("supervisor cannot synchronize restricted Control or read its Google tab", async () => {
  reset();
  mock.role = "supervisor";
  const result = await run("sync");
  assert(
    result.response.status === 403 && mock.rpcCalls.length === 0 && result.googleCalls.length === 0,
    "supervisor accessed restricted operational data",
  );
});
Deno.test("supervisor can still synchronize an unrestricted operational front", async () => {
  reset();
  mock.role = "supervisor";
  mock.sheet["sector"] = "adesao-servico";
  const result = await run("sync");
  assert(
    result.response.status === 200 && mock.rpcCalls[0]?.name === "schedule_operational_apply_sync",
    "other front behavior changed",
  );
});

Deno.test("invalid B2 is a useful structure conflict rather than a provider 502", async () => {
  reset();
  const { response, body } = await run("sync", (rows) => {
    rows[1]![1] = "0";
  });
  assert(
    response.status === 409 && body.code === "SHEET_STRUCTURE_CHANGED" && body.error.includes("B2"),
    "header conflict misclassified",
  );
  assert(mock.rpcCalls.length === 0, "invalid header reached database writes");
});
Deno.test(
  "equivalent FTA FTZ correction is synchronized only with transactional audit installed",
  async () => {
    reset();
    mock.metadataAuditReady = true;
    const alias = {
      ...payload,
      people: payload.people.map((p) => ({ ...p, jobTitle: "CONTROLADOR (DESC FTA)" })),
    };
    mock.sheet["planned_payload"] = alias;
    mock.sheet["current_payload"] = alias;
    const { response } = await run("sync", (rows) => {
      rows[2]![1] = "CONTROLADOR (DESC FTZ)";
    });
    assert(response.status === 200, "equivalent correction rejected");
    assert(
      mock.rpcCalls.map((c) => c.name).join(",") ===
        "schedule_operational_metadata_audit_ready,schedule_operational_apply_sync",
      "audit readiness not checked",
    );
    const next = mock.rpcCalls[1]!.args["p_payload"] as Payload;
    assert(
      next.people[0]!.jobTitle === "CONTROLADOR (DESC FTZ)",
      "correction not sent to atomic sync",
    );
  },
);
Deno.test(
  "missing function audit migration blocks metadata changes without applying cells",
  async () => {
    reset();
    mock.metadataAuditReady = false;
    const alias = {
      ...payload,
      people: payload.people.map((p) => ({ ...p, jobTitle: "CONTROLADOR (DESC FTA)" })),
    };
    mock.sheet["planned_payload"] = alias;
    mock.sheet["current_payload"] = alias;
    const { response } = await run("sync", (rows) => {
      rows[2]![1] = "CONTROLADOR (DESC FTZ)";
    });
    assert(
      response.status === 409 && mock.rpcCalls.length === 1,
      "unaudited metadata synchronized",
    );
  },
);
Deno.test(
  "supervisor cannot delete any official month or consult Google for deletion",
  async () => {
    reset();
    mock.role = "supervisor";
    const { response, googleCalls } = await run("delete");
    assert(
      response.status === 403 && googleCalls.length === 0 && mock.rpcCalls.length === 0,
      "supervisor reached deletion",
    );
  },
);
Deno.test(
  "deletion requires official id and typed confirmation before contacting Google",
  async () => {
    reset();
    const { response, googleCalls } = await run("delete");
    assert(
      response.status === 400 && googleCalls.length === 0,
      "malformed deletion reached Google",
    );
  },
);
Deno.test("pending or completed deletion blocks later synchronization before Google", async () => {
  for (const field of ["deletion_requested_at", "deleted_at"]) {
    reset();
    mock.sheet[field] = "2026-10-29T12:00:00Z";
    const { response, googleCalls } = await run("sync");
    assert(response.status === 409 && googleCalls.length === 0, "retired sheet synchronized");
  }
});
