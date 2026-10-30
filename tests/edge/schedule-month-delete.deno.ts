import {
  deleteOperationalMonth,
  inspectOperationalMonth,
  ScheduleDeletionError,
  type DeleteSheetLink,
} from "../../supabase/functions/_shared/schedule-month-delete.ts";
const sheetId = "20000000-0000-0000-0000-000000000001",
  scheduleId = "30000000-0000-0000-0000-000000000001",
  operationId = "40000000-0000-0000-0000-000000000001";
const sheet: DeleteSheetLink = {
  id: sheetId,
  city: "natal",
  sector: "controle-operacional",
  schedule_month: "2027-01-01",
  spreadsheet_id: "official-book",
  sheet_tab: "Controle JANEIRO 27 - 5X2",
  spreadsheet_url: "https://docs.google.com/spreadsheets/d/official-book/edit#gid=99",
};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
async function run(
  options: {
    missing?: boolean;
    prepareError?: boolean;
    finishError?: boolean;
    wrongId?: boolean;
    wrongTitle?: boolean;
    badConfirmation?: boolean;
    differentSource?: boolean;
    legacy?: boolean;
    verifyStillPresent?: boolean;
    applied?: boolean;
  } = {},
) {
  let present = !options.missing;
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const inputSheet = options.legacy ? { ...sheet, sheet_tab: "ATUALIZADA" } : sheet;
  const result = await deleteOperationalMonth({
    sheet: inputSheet,
    actorId: "00000000-0000-0000-0000-000000000001",
    scheduleId,
    confirmation: options.badConfirmation ? "EXCLUIR 2026-12" : "EXCLUIR 2027-01",
    expectedSpreadsheet: options.differentSource ? "different-book" : "official-book",
    expectedTab: sheet.sheet_tab,
    google: async (url, method = "GET", body) => {
      calls.push({ url, method, body });
      if (method === "POST") {
        assert(
          JSON.stringify(body) === '{"requests":[{"deleteSheet":{"sheetId":99}}]}',
          "wrong delete scope",
        );
        if (!options.verifyStillPresent) present = false;
        return {};
      }
      if (url.includes("/values/"))
        return {
          values: [
            ["Name", "Function"],
            ["TEST EMPLOYEE", "T. 1"],
          ],
        };
      return {
        sheets: [
          ...(present
            ? [
                {
                  properties: {
                    sheetId: options.wrongId ? 100 : 99,
                    title: options.wrongTitle ? "Controle DEZEMBRO 26 - 5X2" : sheet.sheet_tab,
                  },
                },
              ]
            : []),
          { properties: { sheetId: 1, title: "HISTORICAL" } },
        ],
      };
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === "schedule_month_begin_delete")
        return {
          data: options.prepareError
            ? null
            : { id: operationId, status: options.applied ? "applied" : "pending" },
          error: options.prepareError ? { message: "migration missing" } : null,
        };
      return {
        data: options.finishError ? null : { deleted: true },
        error: options.finishError ? { message: "database unavailable" } : null,
      };
    },
  });
  return { result, calls, rpcCalls };
}
Deno.test(
  "delete removes only the linked gid after durable preparation and verifies absence before finalization",
  async () => {
    const { result, calls, rpcCalls } = await run();
    assert(result.deleted, "not deleted");
    assert(calls.filter((c) => c.method === "POST").length === 1, "unexpected Google mutations");
    assert(
      rpcCalls.map((c) => c.name).join(",") ===
        "schedule_month_begin_delete,schedule_month_finish_delete",
      "not staged",
    );
    assert(
      (rpcCalls[0]!.args["p_google_snapshot"] as { values: unknown[] }).values.length === 2,
      "unsynced Google snapshot missing",
    );
    assert(
      !JSON.stringify(calls.filter((c) => c.method === "POST")).includes("HISTORICAL"),
      "historical tab modified",
    );
  },
);
Deno.test("missing migration never deletes Google", async () => {
  let error: unknown;
  try {
    await run({ prepareError: true });
  } catch (e) {
    error = e;
  }
  assert(
    error instanceof ScheduleDeletionError && error.message.includes("preparar"),
    "preparation failure ignored",
  );
});
Deno.test("retry completes a previously removed tab without another Google deletion", async () => {
  const { result, calls } = await run({ missing: true });
  assert(result.deleted && calls.every((c) => c.method === "GET"), "retry changed another tab");
});
Deno.test(
  "database failure after Google deletion is reported as partial and retryable",
  async () => {
    let error: unknown;
    try {
      await run({ finishError: true });
    } catch (e) {
      error = e;
    }
    assert(
      error instanceof ScheduleDeletionError &&
        error.status === 503 &&
        error.message.includes("aba foi removida"),
      "partial success hidden",
    );
  },
);
for (const [label, options] of Object.entries({
  "different workbook": { differentSource: true },
  "legacy historical tab": { legacy: true },
  "wrong confirmation": { badConfirmation: true },
  "recreated tab with another gid": { wrongId: true },
  "renamed tab": { wrongTitle: true },
})) {
  Deno.test("reject " + label + " before deleting", async () => {
    let error: unknown;
    try {
      await run(options);
    } catch (e) {
      error = e;
    }
    assert(error instanceof ScheduleDeletionError, "unsafe target accepted");
  });
}
Deno.test(
  "Google confirmation is mandatory before removing the official database row",
  async () => {
    let error: unknown;
    try {
      await run({ verifyStillPresent: true });
    } catch (e) {
      error = e;
    }
    assert(
      error instanceof ScheduleDeletionError && error.status === 502,
      "unconfirmed deletion accepted",
    );
  },
);
Deno.test("completed deletion is idempotent", async () => {
  const { result, calls, rpcCalls } = await run({ missing: true, applied: true });
  assert(
    result.alreadyDeleted === true &&
      calls.every((c) => c.method === "GET") &&
      rpcCalls.length === 1,
    "duplicate finalization",
  );
});
Deno.test(
  "reused monthly tab requires explicit new gid, validates snapshot and preserves the old tab",
  async () => {
    const linked = { ...sheet, updated_at: "2026-10-30T12:00:00Z" };
    let present = true;
    const writes: unknown[] = [],
      rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const google = async (url: string, method = "GET", body?: unknown) => {
      if (method === "POST") {
        writes.push(body);
        present = false;
        return {};
      }
      if (url.includes("/values/"))
        return {
          values: [
            ["Mês-ano:", "JANEIRO 27"],
            ["Nome", "Função"],
          ],
        };
      return {
        sheets: [
          { properties: { sheetId: 99, title: "ARQUIVADA - revisão anterior" } },
          ...(present ? [{ properties: { sheetId: 100, title: sheet.sheet_tab } }] : []),
          { properties: { sheetId: 55, title: "Controle DEZEMBRO 26 - 5X2" } },
        ],
      };
    };
    const base = {
      sheet: linked,
      expectedSpreadsheet: "official-book",
      expectedTab: sheet.sheet_tab,
      google,
      actorId: "00000000-0000-0000-0000-000000000001",
      scheduleId,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcs.push({ name, args });
        return {
          data:
            name === "schedule_month_relink_begin_delete"
              ? { id: operationId, status: "pending" }
              : { deleted: true },
          error: null,
        };
      },
    };
    const target = await inspectOperationalMonth(base);
    assert(
      target.gridId === 100 &&
        target.linkChanged &&
        target.confirmation === "EXCLUIR 2027-01 ABA 100",
      "unsafe preflight",
    );
    assert(writes.length === 0 && rpcs.length === 0, "inspection mutated state");
    for (const input of [
      { confirmation: "EXCLUIR 2027-01" },
      {
        confirmation: target.confirmation,
        confirmedGridId: 99,
        expectedUpdatedAt: linked.updated_at,
      },
      { confirmation: target.confirmation, confirmedGridId: 100, expectedUpdatedAt: "stale" },
    ]) {
      let rejected = false;
      try {
        await deleteOperationalMonth({ ...base, ...input });
      } catch (e) {
        rejected = e instanceof ScheduleDeletionError;
      }
      assert(
        rejected && writes.length === 0 && rpcs.length === 0,
        "changed target accepted without fresh confirmation",
      );
    }
    let validated = false;
    const result = await deleteOperationalMonth({
      ...base,
      confirmation: target.confirmation,
      confirmedGridId: target.gridId,
      expectedUpdatedAt: linked.updated_at,
      validateSnapshot: (rows) => {
        validated = rows.length === 2;
      },
    });
    assert(result.deleted && validated, "reused tab was not validated/deleted");
    assert(
      JSON.stringify(writes) === '[{"requests":[{"deleteSheet":{"sheetId":100}}]}]',
      "wrong tab deleted",
    );
    assert(
      rpcs[0]?.name === "schedule_month_relink_begin_delete" &&
        rpcs[0].args.p_previous_grid_id === 99,
      "link correction was not prepared atomically",
    );
  },
);
