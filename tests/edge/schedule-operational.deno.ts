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
async function run(
  action: unknown = "publish",
  changeRows?: (rows: unknown[][]) => void,
  sourcePayload: Payload = payload,
  extraParams: Record<string, unknown> = {},
) {
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
      ? controlMonthValues(sourcePayload, "2026-12-01")
      : officialMonthValues(sourcePayload, "2026-12-01");
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
        body: JSON.stringify(action === null ? null : { action, sheetId, ...extraParams }),
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
  mock.rowsByTable = {};
  mock.mutationCalls = [];
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

Deno.test(
  "Control sync accepts a native date or formatted month in B1 without Google writes",
  async () => {
    for (const value of [46357, "dezembro 26"]) {
      reset();
      const { response, body, googleCalls } = await run("sync", (rows) => {
        rows[0]![1] = value;
      });
      assert(
        response.status === 200 && !body.published,
        "equivalent month was rejected or published",
      );
      assert(
        mock.rpcCalls.length === 1 && mock.rpcCalls[0]!.name === "schedule_operational_apply_sync",
        "wrong synchronization action",
      );
      assert(
        (mock.rpcCalls[0]!.args["p_changes"] as unknown[]).length === 1,
        "schedule change lost",
      );
      assert(
        googleCalls.every((call) => call.url.includes("oauth2") || call.method === "GET"),
        "Google write attempted",
      );
    }
  },
);
Deno.test("Control rejects a real month change before saving any schedule changes", async () => {
  reset();
  const { response, body } = await run("sync", (rows) => {
    rows[0]![1] = 46388;
  });
  assert(
    response.status === 409 && body.code === "SHEET_STRUCTURE_CHANGED",
    "wrong month accepted",
  );
  assert(mock.rpcCalls.length === 0, "wrong month reached database writes");
});

Deno.test(
  "Control reordered rows keep employee assignments and audit linked during sync",
  async () => {
    reset();
    const source: Payload = {
      ...payload,
      people: [
        { ...structuredClone(payload.people[0]!), name: "ANTONIA ELIZIENE" },
        {
          ...structuredClone(payload.people[0]!),
          name: "MATHEUS FREITAS",
          jobTitle: "ANALISTA",
        },
      ],
    };
    mock.sheet["planned_payload"] = source;
    mock.sheet["current_payload"] = source;
    const before = JSON.stringify(source);
    const { response, body, googleCalls } = await run(
      "sync",
      (rows) => {
        rows[0]![1] = 46357;
        [rows[2], rows[3]] = [rows[3]!, rows[2]!];
      },
      source,
    );
    assert(response.status === 200 && !body.published, "reordered sync rejected or published");
    assert(mock.rpcCalls.length === 1, "unexpected database actions");
    const call = mock.rpcCalls[0]!;
    assert(call.name === "schedule_operational_apply_sync", "sync published automatically");
    const next = call.args["p_payload"] as Payload;
    assert(next.people[0]!.name === "ANTONIA ELIZIENE", "baseline identity order changed");
    assert(next.people[0]!.assignments["2026-12-01"] === "FALTA", "Antonia change lost");
    assert(
      next.people[1]!.assignments["2026-12-01"] === "T. 1",
      "Matheus received another person's code",
    );
    const changes = call.args["p_changes"] as Array<Record<string, unknown>>;
    assert(
      changes.length === 1 && changes[0]!["employee_name"] === "ANTONIA ELIZIENE",
      "audit attributed to the wrong employee",
    );
    assert(
      changes[0]!["previous_code"] === "T. 1" && changes[0]!["current_code"] === "FALTA",
      "audit values lost",
    );
    assert(JSON.stringify(source) === before, "original plan mutated");
    assert(
      googleCalls.every((call) => call.url.includes("oauth2") || call.method === "GET"),
      "Google write attempted",
    );
  },
);
Deno.test("Control duplicate or unknown name returns 409 before database writes", async () => {
  for (const name of ["ANTONIA ELIZIENE", "UNKNOWN EMPLOYEE"]) {
    reset();
    const source: Payload = {
      ...payload,
      people: [
        { ...structuredClone(payload.people[0]!), name: "ANTONIA ELIZIENE" },
        { ...structuredClone(payload.people[0]!), name: "MATHEUS FREITAS" },
      ],
    };
    mock.sheet["planned_payload"] = source;
    mock.sheet["current_payload"] = source;
    const { response, body } = await run(
      "sync",
      (rows) => {
        rows[3]![0] = name;
      },
      source,
    );
    assert(
      response.status === 409 && body.code === "SHEET_STRUCTURE_CHANGED",
      "invalid employee structure accepted",
    );
    assert(mock.rpcCalls.length === 0, "invalid names reached database writes");
  }
});

Deno.test(
  "Control function/base changes use the same audited sync, including metadata-only updates",
  async () => {
    for (const cellsChanged of [true, false]) {
      reset();
      mock.metadataAuditReady = true;
      const source: Payload = {
        ...payload,
        people: [
          {
            ...structuredClone(payload.people[0]!),
            jobTitle: "CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO",
          },
        ],
      };
      mock.sheet["planned_payload"] = source;
      mock.sheet["current_payload"] = source;
      const { response, body, googleCalls } = await run(
        "sync",
        (rows) => {
          rows[2]![1] = "CONTROLADOR (ADESÃO) - FTZ - APOIO";
          if (!cellsChanged) rows[2]![2] = "T. 1";
        },
        source,
      );
      assert(
        response.status === 200 && !body.published,
        "function change rejected or auto-published",
      );
      assert(
        body.changes === (cellsChanged ? 2 : 1) &&
          body.functionChanges === 1 &&
          body.cellChanges === (cellsChanged ? 1 : 0) &&
          body.auditLogged === true,
        "metadata-only change reported as unchanged",
      );
      assert(
        mock.rpcCalls.map((c) => c.name).join(",") ===
          "schedule_operational_metadata_audit_ready,schedule_operational_apply_sync",
        "audit check skipped",
      );
      const next = mock.rpcCalls[1]!.args["p_payload"] as Payload;
      assert(next.people[0]!.jobTitle === "CONTROLADOR (ADESÃO) - FTZ - APOIO", "new role lost");
      assert(source.people[0]!.jobTitle === "CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO", "plan mutated");
      assert(
        googleCalls.every((c) => c.url.includes("oauth2") || c.method === "GET"),
        "Google write attempted",
      );
    }
  },
);
Deno.test("Control general function changes cannot bypass missing metadata audit", async () => {
  reset();
  mock.metadataAuditReady = false;
  const { response } = await run("sync", (rows) => {
    rows[2]![1] = "CONTROLADOR (ADESÃO) - FTZ - APOIO";
  });
  assert(response.status === 409, "missing audit accepted");
  assert(
    mock.rpcCalls.length === 1 &&
      mock.rpcCalls[0]!.name === "schedule_operational_metadata_audit_ready",
    "unprotected sync attempted",
  );
});

const selectedId = "10000000-0000-0000-0000-000000000004";
function revisionFixture() {
  reset();
  const normal = structuredClone(payload);
  for (const date of normal.dates) {
    const day = new Date(date + "T12:00:00Z").getUTCDay();
    normal.people[0]!.assignments[date] = day === 0 || day === 6 ? "Folga" : "T. 1";
  }
  mock.sheet["draft_id"] = "10000000-0000-0000-0000-000000000003";
  mock.sheet["planned_payload"] = normal;
  mock.sheet["current_payload"] = normal;
  mock.rowsByTable["schedule_generation_drafts"] = {
    id: selectedId,
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-12-01",
    status: "draft",
    archived_at: null,
    warnings: [],
    payload: normal,
    policy_snapshot: { rule: { sundayDutyCount: 0, holidayDutyCount: 0 } },
  };
  return normal;
}
Deno.test("explicit selected revision uses one atomic RPC and never writes Google", async () => {
  const normal = revisionFixture();
  const result = await run("publish", undefined, normal, { draftId: selectedId });
  assert(
    result.response.status === 200 && result.body.published === true,
    "selected revision not published",
  );
  assert(
    mock.rpcCalls.length === 1 &&
      mock.rpcCalls[0]!.name === "schedule_operational_publish_revision",
    "binding and publish were split",
  );
  assert(mock.rpcCalls[0]!.args["p_draft_id"] === selectedId, "wrong revision published");
  assert(mock.mutationCalls.length === 0, "Edge directly changed binding");
  assert(
    result.googleCalls
      .filter((c) => c.url.includes("sheets.googleapis.com"))
      .every((c) => c.method === "GET"),
    "Google was modified",
  );
});
Deno.test("selected draft scope and archive are validated before consulting Google", async () => {
  for (const change of [
    { city: "recife" },
    { archived_at: "2026-10-30" },
    { status: "rejected" },
    { warnings: [{ level: "blocking" }] },
  ]) {
    const normal = revisionFixture();
    Object.assign(mock.rowsByTable["schedule_generation_drafts"]!, change);
    const result = await run("publish", undefined, normal, { draftId: selectedId });
    assert(
      result.response.status === 409 &&
        result.googleCalls.length === 0 &&
        mock.rpcCalls.length === 0,
      "invalid draft had effects",
    );
  }
});
Deno.test(
  "live Sheets weekly conflict blocks even when saved revision has zero warnings",
  async () => {
    const normal = revisionFixture();
    const result = await run(
      "publish",
      (rows) => {
        rows[2]![7] = "PLANTÃO";
      },
      normal,
      { draftId: selectedId },
    );
    assert(
      result.response.status === 409 && result.body.code === "SHEET_PUBLICATION_BLOCKED",
      "live weekly conflict ignored",
    );
    assert(
      mock.rpcCalls.length === 0 && mock.mutationCalls.length === 0,
      "blocked publication changed binding",
    );
    assert(result.body.error.includes("TEST EMPLOYEE"), "affected name missing");
  },
);
Deno.test("live Sheets missing coverage blocks a clean saved revision", async () => {
  const normal = revisionFixture();
  const selected = mock.rowsByTable["schedule_generation_drafts"]!;
  selected["policy_snapshot"] = {
    rule: { sundayDutyCount: 3, holidayDutyCount: 0, minimumSupervisorDuty: 1 },
  };
  const result = await run("publish", undefined, normal, { draftId: selectedId });
  assert(
    result.response.status === 409 && result.body.code === "SHEET_PUBLICATION_BLOCKED",
    "live coverage conflict ignored",
  );
  assert(mock.rpcCalls.length === 0, "invalid Sheets published");
});
Deno.test("missing revision publication SQL returns actionable migration instruction", async () => {
  const normal = revisionFixture();
  mock.rpcError = { code: "PGRST202", message: "missing function" };
  const result = await run("publish", undefined, normal, { draftId: selectedId });
  assert(
    result.response.status === 409 &&
      result.body.error.includes("20261030153159_schedule_publish_saved_revision.sql"),
    "migration error hidden",
  );
});
Deno.test("invalid publication draft ID is rejected before Google", async () => {
  revisionFixture();
  const result = await run("publish", undefined, payload, { draftId: "invalid" });
  assert(
    result.response.status === 400 && result.googleCalls.length === 0 && mock.rpcCalls.length === 0,
    "invalid id accepted",
  );
});
