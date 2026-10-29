import { mock } from "./supabase-mock.ts";
type Handler = (req: Request) => Response | Promise<Response>;
const handlers: Record<string, Handler> = {};
const original = Deno.serve;
const modules = [
  ["sync", () => import("../../supabase/functions/schedule-sync/index.ts")],
  ["ai", () => import("../../supabase/functions/schedule-ai/index.ts")],
  ["operational", () => import("../../supabase/functions/schedule-operational/index.ts")],
] as const;
for (const [name, load] of modules) {
  try {
    Deno.serve = ((callback: Handler) => {
      handlers[name!] = callback;
      return {};
    }) as unknown as typeof Deno.serve;
    await load();
  } finally {
    Deno.serve = original;
  }
}
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
async function run(name: string, body: unknown) {
  mock.role = "supervisor";
  mock.status = "active";
  mock.authenticated = true;
  mock.rpcCalls = [];
  mock.queryCalls = [];
  mock.rpcError = null;
  mock.queryError = null;
  mock.sheet = {
    id: "20000000-0000-0000-0000-000000000001",
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-12-01",
    status: "draft",
    draft_id: "10000000-0000-0000-0000-000000000001",
    payload: { dates: [], people: [], codes: [] },
    planned_payload: { dates: [], people: [], codes: [] },
    current_payload: { dates: [], people: [], codes: [] },
  };
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const old = names.map((n) => Deno.env.get(n));
  names.forEach((n) => Deno.env.set(n, "fixture"));
  try {
    return await handlers[name]!(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fixture" },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    names.forEach((n, i) => (old[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, old[i]!)));
  }
}
Deno.test(
  "legacy sync blocks Control including the old controle alias before Google calls",
  async () => {
    for (const front of ["controle", "controle-operacional"]) {
      const response = await run("sync", { city: "natal", front, scheduleMonth: "2026-12" });
      assert(response.status === 403, "legacy service-role path bypassed scope");
    }
  },
);
Deno.test("AI cannot disclose Control operational data to a supervisor", async () => {
  const response = await run("ai", { sheetId: "20000000-0000-0000-0000-000000000001" });
  assert(response.status === 403, "AI operational path leaked private Control");
});
Deno.test("AI cannot disclose Control draft data to a supervisor", async () => {
  const response = await run("ai", { draftId: "10000000-0000-0000-0000-000000000001" });
  assert(response.status === 403, "AI draft path leaked private Control");
});
Deno.test("creating a Google tab for Control requires administrator", async () => {
  const response = await run("operational", {
    action: "create",
    draftId: "10000000-0000-0000-0000-000000000001",
  });
  assert(
    response.status === 403 && mock.rpcCalls.length === 0,
    "tab creation bypassed management guard",
  );
});
