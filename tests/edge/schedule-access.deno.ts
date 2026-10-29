import { mock } from "./supabase-mock.ts";
type Handler = (request: Request) => Response | Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-access/index.ts");
} finally {
  Deno.serve = serve;
}
const actor = "00000000-0000-0000-0000-000000000001";
const requestId = "20000000-0000-0000-0000-000000000001";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
function reset(role = "controller") {
  mock.role = role;
  mock.status = "active";
  mock.authenticated = true;
  mock.access = null;
  mock.rpcCalls = [];
  mock.queryCalls = [];
  mock.rpcError = null;
  mock.queryError = null;
  mock.requests = [];
  mock.events = [];
}
async function run(body: unknown) {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const old = names.map((n) => Deno.env.get(n));
  names.forEach((n) => Deno.env.set(n, "test-fixture"));
  try {
    const response = await handler(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { response, body: await response.json() };
  } finally {
    names.forEach((n, i) => (old[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, old[i]!)));
  }
}
Deno.test(
  "request binds the authenticated identity and never forwards a forged approval",
  async () => {
    reset();
    mock.access = { id: requestId, status: "pending" };
    const result = await run({
      action: "request",
      city: "natal",
      note: "Consulta",
      userId: "forged",
      status: "approved",
      actorId: "forged",
    });
    assert(
      result.response.status === 200 && result.body.canView === false,
      "request granted access",
    );
    assert(
      mock.rpcCalls.length === 1 && mock.rpcCalls[0]!.name === "schedule_control_request",
      "wrong mutation",
    );
    assert(
      mock.rpcCalls[0]!.args["p_user_id"] === actor && !("p_decision" in mock.rpcCalls[0]!.args),
      "client controls decision/identity",
    );
  },
);
Deno.test("status query always reads the authenticated user's record", async () => {
  reset();
  mock.access = { status: "approved" };
  const result = await run({ action: "status", city: "natal", userId: "other-user" });
  assert(result.response.status === 200 && result.body.canView === true, "approved user denied");
  const query = mock.queryCalls.find((x) => x.table === "schedule_control_access");
  assert(query?.filters["user_id"] === actor, "foreign permission looked up");
});
Deno.test("pending and revoked users remain blocked", async () => {
  for (const status of ["pending", "denied", "revoked"]) {
    reset();
    mock.access = { status };
    const result = await run({ action: "status", city: "natal" });
    assert(result.body.canView === false, "unapproved status was granted");
  }
});
Deno.test("inactive user is denied even with an approved permission", async () => {
  reset();
  mock.status = "inactive";
  mock.access = { status: "approved" };
  assert(
    (await run({ action: "status", city: "natal" })).response.status === 403,
    "inactive user granted access",
  );
});
Deno.test("unauthenticated requests return 401", async () => {
  reset();
  mock.authenticated = false;
  assert(
    (await run({ action: "request", city: "natal" })).response.status === 401,
    "invalid session accepted",
  );
});
Deno.test(
  "controller cannot approve, revoke, list, or inspect other request histories",
  async () => {
    for (const action of ["review", "list", "history"]) {
      reset();
      assert(
        (await run({ action, requestId })).response.status === 403,
        "controller became reviewer",
      );
      assert(mock.rpcCalls.length === 0, "unauthorized decision invoked RPC");
    }
  },
);
Deno.test("supervisor cannot become reviewer", async () => {
  reset("supervisor");
  assert(
    (await run({ action: "review", requestId, decision: "approved", updatedAt: "2026-10-28" }))
      .response.status === 403,
    "supervisor approved",
  );
  assert(mock.rpcCalls.length === 0, "unauthorized approval side effect");
});
Deno.test(
  "admin decision binds reviewer to authenticated admin and preserves optimistic lock",
  async () => {
    reset("admin");
    const updatedAt = "2026-10-28T16:00:00.123456Z";
    const result = await run({
      action: "review",
      requestId,
      decision: "approved",
      updatedAt,
      note: "Autorizado",
      actorId: "forged",
    });
    assert(result.response.status === 200 && mock.rpcCalls.length === 1, "admin decision failed");
    const args = mock.rpcCalls[0]!.args;
    assert(
      args["p_actor_id"] === actor && args["p_expected_updated_at"] === updatedAt,
      "review identity/timestamp changed",
    );
  },
);
Deno.test("stale admin decision returns conflict", async () => {
  reset("admin");
  mock.rpcError = { code: "40001", message: "Conflito: atualize" };
  const result = await run({
    action: "review",
    requestId,
    decision: "revoked",
    updatedAt: "2026-10-28T16:00:00Z",
  });
  assert(
    result.response.status === 409 && result.body.error === "Conflito: atualize",
    "conflict hidden",
  );
});
Deno.test(
  "admin list filters before pagination so older approved grants can be revoked",
  async () => {
    reset("admin");
    const result = await run({ action: "list", filter: "approved", offset: 50 });
    assert(
      result.response.status === 200 && result.body.total === 150 && result.body.hasMore,
      "pagination missing",
    );
    const query = mock.queryCalls.find((x) => x.table === "schedule_control_access");
    assert(
      query?.filters["status"] === "approved" && query.range?.[0] === 50 && query.range?.[1] === 99,
      "incorrect server filtering",
    );
  },
);
Deno.test("missing migration fails closed", async () => {
  reset();
  mock.queryError = { code: "42P01", message: "relation missing" };
  const result = await run({ action: "status", city: "natal" });
  assert(
    result.response.status === 503 && result.body.canView !== true,
    "schema error granted access",
  );
});
Deno.test("malformed requests and overlong notes are rejected", async () => {
  for (const body of [
    null,
    [],
    { action: "request", city: "NATAL" },
    { action: "request", city: "natal", note: "x".repeat(501) },
  ]) {
    reset();
    assert((await run(body)).response.status === 400, "invalid body accepted");
    assert(mock.rpcCalls.length === 0, "invalid input had side effect");
  }
});
