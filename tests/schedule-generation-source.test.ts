import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  live: null as unknown,
  error: null as unknown,
  row: null as unknown,
  filters: [] as Array<[string, unknown]>,
  tables: [] as string[],
}));
vi.mock("../src/services/schedule-operational", () => ({
  latestOperationalSource: vi.fn(async () => {
    if (state.error) throw state.error;
    return state.live;
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      state.tables.push(table);
      const q = {
        select: () => q,
        eq: (key: string, v: unknown) => {
          state.filters.push([key, v]);
          return q;
        },
        maybeSingle: async () => ({ data: state.row, error: null }),
      };
      return q;
    },
  },
}));
import { loadScheduleGenerationSource } from "../src/services/schedule-generation-source";
beforeEach(() => {
  state.live = null;
  state.row = null;
  state.error = null;
  state.filters = [];
  state.tables = [];
});
describe("fonte oficial para o gerador", () => {
  it("usa payload atual e política da versão aprovada, com o nome real da aba", async () => {
    state.live = {
      id: "op",
      sheet_tab: "Controle DEZEMBRO 26 - 5X2",
      current_payload: { dates: ["2026-12-01"], people: [{ name: "UPDATED" }], codes: [] },
      created_by: "admin",
      created_at: "2026-12-01",
      last_synced_at: "2026-12-31",
      updated_at: "2026-12-31",
      generationRule: { excludedFromDuty: ["NO DUTY"] },
    };
    const source = await loadScheduleGenerationSource("natal", "controle-operacional", "2026-12");
    expect(source).toMatchObject({
      id: "op",
      operationalSourceId: "op",
      source_sheet: "Controle DEZEMBRO 26 - 5X2",
      payload: { people: [{ name: "UPDATED" }] },
      inheritedRule: { excludedFromDuty: ["NO DUTY"] },
    });
    expect(state.tables).toEqual([]);
  });
  it("lê dezembro manual sincronizado pelo escopo exato, sem usar cópia/modelo", async () => {
    state.row = {
      id: "manual",
      city: "recife",
      sector: "instalacao",
      schedule_month: "2026-12-01",
      source_file: "Google Sheets API",
      payload: { people: [] },
    };
    expect((await loadScheduleGenerationSource("recife", "instalacao", "2026-12"))?.id).toBe(
      "manual",
    );
    expect(state.tables).toEqual(["schedule_uploads"]);
    expect(state.filters).toEqual([
      ["city", "recife"],
      ["sector", "instalacao"],
      ["schedule_month", "2026-12-01"],
    ]);
  });
  it("não cai em uma importação antiga se a leitura oficial falhar", async () => {
    state.error = Error("Official unavailable");
    state.row = { id: "old" };
    await expect(loadScheduleGenerationSource("natal", "vt", "2026-12")).rejects.toThrow(
      "Official unavailable",
    );
    expect(state.tables).toEqual([]);
  });
  it("não aceita uma oficial sem vínculo como fallback", async () => {
    state.row = { id: "official", source_file: "Google Sheets - Escala operacional oficial" };
    await expect(loadScheduleGenerationSource("natal", "vt", "2026-12")).rejects.toThrow("vínculo");
  });
});
