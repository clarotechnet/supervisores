import { mock } from "./supabase-mock.ts";
import { officialMonthValues } from "../../supabase/functions/_shared/schedule-google-source.ts";
import type { Payload } from "../../supabase/functions/_shared/schedule-operational.ts";

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as unknown as typeof Deno.serve;
  await import("../../supabase/functions/schedule-sync/index.ts");
} finally {
  Deno.serve = serve;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}

Deno.test(
  "Atualizar via API preserva logins compartilhados e pessoas sem TOA na Adesão RN",
  async () => {
    mock.role = "admin";
    mock.status = "active";
    mock.authenticated = true;
    mock.mutationCalls = [];
    mock.rpcCalls = [];
    mock.queryError = null;
    const month = "2026-12-01";
    const title = "Dezembro 26 Adesão-Serviço";
    const assignments = { [month]: "M. 1", "2026-12-02": "Folga" };
    const payload: Payload = {
      dates: Object.keys(assignments),
      codes: ["M. 1", "Folga"],
      people: [
        {
          name: "PESSOA SEM LOGIN A",
          jobTitle: "",
          login: "FORA TOA",
          fixedRest: "Terça",
          assignments,
        },
        {
          name: "PESSOA SEM LOGIN B",
          jobTitle: "",
          login: "FORA TOA",
          fixedRest: "Quinta",
          assignments,
        },
        { name: "TÉCNICO A", jobTitle: "", login: "ZFIXTURE", fixedRest: "Quarta", assignments },
        { name: "AUXILIAR B", jobTitle: "", login: "ZFIXTURE", fixedRest: "Quarta", assignments },
      ],
    };
    const envNames = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
      "GOOGLE_SHEETS_RN_MAIN_ID",
    ];
    const envBefore = envNames.map((name) => Deno.env.get(name));
    envNames.forEach((name) => Deno.env.set(name, "fixture"));
    const fetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      const address = String(url);
      if (address.includes("oauth2.googleapis.com/token"))
        return Response.json({ access_token: "fixture" });
      assert(address.includes("sheets.googleapis.com/v4/spreadsheets/fixture"), "wrong workbook");
      assert(!init?.method || init.method === "GET", "sync tried to write to Google");
      if (address.includes("/values/")) {
        assert(decodeURIComponent(address).includes(title), "wrong tab");
        return Response.json({ values: officialMonthValues(payload, month) });
      }
      return Response.json({
        properties: { title: "Escalas RN" },
        sheets: [{ properties: { title, sheetId: 9 } }],
      });
    }) as typeof globalThis.fetch;
    try {
      const response = await handler(
        new Request("https://fixture.invalid/", {
          method: "POST",
          headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
          body: JSON.stringify({ city: "natal", front: "adesao-servico", scheduleMonth: month }),
        }),
      );
      const body = await response.json();
      assert(
        response.status === 200 && body.employeeCount === 4 && body.entryCount === 8,
        "wrong sync totals",
      );
      assert(mock.mutationCalls.length === 1 && mock.rpcCalls.length === 0, "unexpected writes");
      const saved = mock.mutationCalls[0]!;
      assert(
        saved.table === "schedule_uploads" && saved.operation === "upsert",
        "wrong persistence",
      );
      const { people } = (saved.values as { payload: Payload }).payload;
      assert(people.filter((p) => p.login === "ZFIXTURE").length === 2, "shared pair was merged");
      assert(people.filter((p) => !p.login).length === 2, "FORA TOA turned into an identity");
      assert(
        people.find((p) => p.name === "PESSOA SEM LOGIN A")?.fixedRest === "Terça",
        "fixed day changed",
      );
    } finally {
      globalThis.fetch = fetch;
      envNames.forEach((name, i) => {
        const value = envBefore[i];
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      });
    }
  },
);
