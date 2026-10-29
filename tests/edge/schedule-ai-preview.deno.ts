import { mock } from "./supabase-mock.ts";
type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-ai/index.ts");
} finally {
  Deno.serve = serve;
}
function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw Error(label);
}
const dates = Array.from({ length: 7 }, (_, i) => "2027-02-" + String(i + 7).padStart(2, "0"));
const payload = {
  dates,
  codes: ["M. 1", "Folga"],
  people: [0, 1].map((i) => ({
    name: "PRIVATE PERSON " + i,
    login: "SECRET LOGIN " + i,
    jobTitle: "PRIVATE ROLE",
    assignments: Object.fromEntries(dates.map((d, index) => [d, index === 0 ? "Folga" : "M. 1"])),
  })),
};
const input = () => ({
  city: "recife",
  sector: "desconexao",
  month: "2027-02",
  planned: structuredClone(payload),
  current: structuredClone(payload),
  rule: { sundayDutyCount: 0, holidayDutyCount: 0 },
});
async function run(
  body: unknown,
  options: { role?: string; active?: boolean; authenticated?: boolean; ai?: boolean } = {},
) {
  mock.role = options.role || "admin";
  mock.status = options.active === false ? "inactive" : "active";
  mock.authenticated = options.authenticated !== false;
  mock.mutationCalls = [];
  mock.rpcCalls = [];
  mock.queryCalls = [];
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY"];
  const previous = names.map((n) => Deno.env.get(n));
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  names.slice(0, 2).forEach((n) => Deno.env.set(n, "fixture"));
  if (options.ai) Deno.env.set("GROQ_API_KEY", "fixture");
  else Deno.env.delete("GROQ_API_KEY");
  globalThis.fetch = ((_url: unknown, args?: RequestInit) => {
    const text = String(args?.body || "");
    calls.push(text);
    return Promise.resolve(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Revisar folgas",
                suggestions: [
                  {
                    issueId: "weekly:2027-02-07:C1",
                    explanation: "Confira o descanso.",
                    candidateKeys: ["INVENTED"],
                    caution: "",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  }) as typeof fetch;
  try {
    const response = await handler!(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { response, data: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((n, i) =>
      previous[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, previous[i]!),
    );
  }
}
Deno.test("unsaved preview is analyzed without database or Sheets writes", async () => {
  const result = await run({ preview: input() });
  assert(
    result.response.status === 200 && result.data.source === "preview",
    "preview not accepted",
  );
  assert(
    result.data.analysis.issues.some((i: { kind: string }) => i.kind === "weekly"),
    "current preview not analyzed",
  );
  assert(
    result.data.writeActions === 0 && mock.rpcCalls.length === 0 && mock.mutationCalls.length === 0,
    "write attempted",
  );
  assert(
    mock.queryCalls.every((c) => c.table === "profiles"),
    "saved draft required",
  );
});
Deno.test("preview updates are analyzed using current cells rather than saved data", async () => {
  const preview = structuredClone(input());
  for (const person of preview.current.people) person.assignments["2027-02-09"] = "Folga";
  const result = await run({ preview });
  assert(
    !result.data.analysis.issues.some((i: { kind: string }) => i.kind === "weekly"),
    "stale weekly issue",
  );
});
Deno.test("preview scope keeps Control restricted to active administrators", async () => {
  const preview = input();
  preview.city = "natal";
  preview.sector = "controle-operacional";
  const supervisor = await run({ preview }, { role: "supervisor" });
  assert(
    supervisor.response.status === 403 && supervisor.calls.length === 0,
    "supervisor bypassed Control",
  );
  assert(
    (await run({ preview }, { active: false })).response.status === 403,
    "inactive user allowed",
  );
  assert(
    (await run({ preview }, { authenticated: false })).response.status === 401,
    "anonymous user allowed",
  );
});
Deno.test(
  "malformed or mixed preview requests are rejected without consulting provider",
  async () => {
    const bad = input();
    bad.current = { ...payload, dates: Array(46).fill("2027-02-07") };
    assert(
      (await run({ preview: bad }, { ai: true })).response.status === 400,
      "oversized input accepted",
    );
    assert(
      (await run({ preview: input(), draftId: "10000000-0000-0000-0000-000000000001" })).response
        .status === 400,
      "mixed target accepted",
    );
  },
);
Deno.test("AI receives pseudonymous metrics without names logins roles or cell codes", async () => {
  const result = await run({ preview: input() }, { ai: true });
  assert(
    result.response.status === 200 && result.data.mode === "ai" && result.calls.length === 1,
    "provider not called",
  );
  const text = result.calls[0]!;
  for (const value of ["PRIVATE PERSON", "SECRET LOGIN", "PRIVATE ROLE", "M. 1"])
    assert(!text.includes(value), "private input leaked: " + value);
  assert(
    result.data.explanations.every(
      (i: { candidateKeys: string[] }) => !i.candidateKeys.includes("INVENTED"),
    ),
    "invented candidate accepted",
  );
  assert(mock.mutationCalls.length === 0 && mock.rpcCalls.length === 0, "AI wrote schedule");
});
