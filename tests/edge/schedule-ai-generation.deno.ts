import { mock } from "./supabase-mock.ts";
type Handler = (r: Request) => Response | Promise<Response>;
let handler: Handler;
const savedServe = Deno.serve;
try {
  Deno.serve = ((h: Handler) => {
    handler = h;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-ai/index.ts");
} finally {
  Deno.serve = savedServe;
}
const input = () => ({
  city: "natal",
  sector: "controle-operacional",
  month: "2027-01",
  options: [0, 1, 2].map((i) => ({
    id: "option-" + i,
    pendingChecks: 0,
    repeatedDuties: i,
    maxDuties: 1,
    workloadSpread: 1,
    events: [{ date: "2027-01-03", planned: 3, roster: ["P00" + i, "P01" + i, "P02" + i] }],
  })),
});
function assert(v: unknown, label: string): asserts v {
  if (!v) throw Error(label);
}
async function run(
  generation: unknown,
  config: {
    ai?: boolean;
    role?: string;
    active?: boolean;
    authenticated?: boolean;
    selected?: string;
    http?: number;
    mix?: boolean;
  } = {},
) {
  mock.role = config.role || "admin";
  mock.status = config.active === false ? "inactive" : "active";
  mock.authenticated = config.authenticated !== false;
  mock.mutationCalls = [];
  mock.rpcCalls = [];
  mock.queryCalls = [];
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY"],
    prior = keys.map((k) => Deno.env.get(k));
  keys.slice(0, 2).forEach((k) => Deno.env.set(k, "fixture"));
  if (config.ai) Deno.env.set("GROQ_API_KEY", "fixture");
  else Deno.env.delete("GROQ_API_KEY");
  const originalFetch = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = ((_url: unknown, args?: RequestInit) => {
    calls.push(String(args?.body));
    return Promise.resolve(
      config.http
        ? new Response("provider details must not leak", { status: config.http })
        : Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedOption: config.selected || "option-1",
                    summary: "Melhor rodízio",
                  }),
                },
              },
            ],
          }),
    );
  }) as typeof fetch;
  try {
    const res = await handler!(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify({
          generation,
          ...(config.mix ? { draftId: "10000000-0000-0000-0000-000000000001" } : {}),
        }),
      }),
    );
    return { status: res.status, data: await res.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((k, i) =>
      prior[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, prior[i]!),
    );
  }
}
Deno.test("generation AI selects a concrete plan without database or Google writes", async () => {
  const r = await run(input(), { ai: true });
  assert(
    r.status === 200 && r.data.mode === "ai" && r.data.selectedOption === "option-1",
    "not composed",
  );
  assert(
    r.data.writeActions === 0 && mock.mutationCalls.length === 0 && mock.rpcCalls.length === 0,
    "write attempted",
  );
  assert(
    mock.queryCalls.every((q) => q.table === "profiles"),
    "unexpected data read",
  );
  assert(r.calls.length === 1, "provider not consulted");
  for (const v of ["natal", "controle-operacional", "GROQ_API_KEY", "PRIVATE", "AT", "Folga"])
    assert(!r.calls[0]!.includes(v), "private metadata sent: " + v);
});
Deno.test(
  "Control generation requires active admin; other scopes retain supervisor access",
  async () => {
    assert(
      (await run(input(), { role: "supervisor", ai: true })).status === 403,
      "Control bypassed",
    );
    assert((await run(input(), { active: false })).status === 403, "inactive allowed");
    assert((await run(input(), { authenticated: false })).status === 401, "anonymous allowed");
    const other = input();
    other.city = "recife";
    other.sector = "instalacao";
    assert(
      (await run(other, { role: "supervisor" })).status === 200,
      "supervisor blocked outside Control",
    );
  },
);
Deno.test(
  "generation rejects mixed targets and private/free-text fields before provider",
  async () => {
    assert((await run(input(), { mix: true, ai: true })).status === 400, "mixed target accepted");
    const bad = { ...input(), names: ["PRIVATE PERSON"] };
    const r = await run(bad, { ai: true });
    assert(r.status === 400 && r.calls.length === 0, "private field accepted");
    const roster = input();
    roster.options[0]!.events[0]!.roster = ["EMPLOYEE NAME"];
    assert((await run(roster, { ai: true })).status === 400, "arbitrary roster key accepted");
  },
);
Deno.test("invalid AI choices and provider errors keep the verified fallback", async () => {
  const invalid = await run(input(), { ai: true, selected: "invented" });
  assert(
    invalid.data.mode === "rules" && invalid.data.selectedOption === "option-0",
    "invented choice used",
  );
  const failed = await run(input(), { ai: true, http: 429 });
  assert(
    failed.status === 200 &&
      failed.data.mode === "rules" &&
      failed.data.selectedOption === "option-0",
    "no fallback",
  );
  assert(!JSON.stringify(failed.data).includes("provider details"), "provider body leaked");
});
Deno.test("AI cannot select a proposal with more unresolved checks", async () => {
  const options = input();
  options.options[1]!.pendingChecks = 5;
  const r = await run(options, { ai: true });
  assert(r.data.mode === "rules" && r.data.selectedOption === "option-0", "worse plan selected");
  assert(!r.calls[0]!.includes('"id":"option-1"'), "worse plan sent to AI");
});
Deno.test("no configured model uses rules without a remote call", async () => {
  const r = await run(input());
  assert(
    r.status === 200 && r.data.mode === "rules" && r.calls.length === 0,
    "unconfigured provider contacted",
  );
});
Deno.test("generation validates bounds, repeated IDs and dates outside competence", async () => {
  const tooMany = input();
  tooMany.options.push({ ...tooMany.options[0]!, id: "option-3" });
  assert((await run(tooMany)).status === 400, "oversized options");
  const duplicate = input();
  duplicate.options[1]!.id = "option-0";
  assert((await run(duplicate)).status === 400, "duplicate id");
  const outside = input();
  outside.options[0]!.events[0]!.date = "2027-02-01";
  assert((await run(outside)).status === 400, "outside month");
});
