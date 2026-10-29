import { describe, it, expect, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  official: null as null | { id: string; source_file: string; source_sheet: string },
  draft: null as null | { id: string },
  sheets: [] as Array<{ id: string; sheet_tab: string; draft_id: string }>,
  error: null as null | Error,
  calls: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      state.calls.push({ table, filters });
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        is: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        contains: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        order: () => builder,
        async limit() {
          return { data: state.sheets.slice(0, 30), error: state.error };
        },
        async maybeSingle() {
          const data =
            table === "schedule_uploads"
              ? state.official
              : table === "schedule_generation_drafts"
                ? state.draft
                : (state.sheets.find(
                    (sheet) =>
                      sheet.draft_id === filters["draft_id"] &&
                      sheet.sheet_tab === filters["sheet_tab"],
                  ) ?? null);
          return { data, error: state.error };
        },
      };
      return builder;
    },
  },
}));
import { latestOperationalSource } from "../src/services/schedule-operational";
describe("Sincronização acompanha a versão OFICIAL", () => {
  const lookup = () => latestOperationalSource("natal", "controle-operacional", "2026-12");
  beforeEach(() => {
    state.sheets = [
      { id: "newer-draft", sheet_tab: "OUTRA REVISAO", draft_id: "rev3" },
      { id: "approved", sheet_tab: "Controle DEZEMBRO 26 - 5X2", draft_id: "rev2" },
    ];
    state.official = null;
    state.draft = { id: "rev2" };
    state.error = null;
    state.calls = [];
  });
  function official() {
    state.official = {
      id: "official-id",
      source_file: "Google Sheets - Escala operacional oficial",
      source_sheet: "Controle DEZEMBRO 26 - 5X2",
    };
  }
  it("sem oficial não usa rascunho nem planilha paralela como fonte", async () => {
    expect(await lookup()).toBeNull();
  });
  it("com oficial seleciona a versão aprovada pelo ID publicado", async () => {
    official();
    expect((await lookup())?.id).toBe("approved");
    expect(
      state.calls.find((call) => call.table === "schedule_generation_drafts")?.filters,
    ).toMatchObject({
      status: "approved",
      archived_at: null,
      policy_snapshot: { published: true, officialScheduleId: "official-id" },
    });
  });
  it("encontra a oficial mesmo depois de 30 rascunhos mais recentes", async () => {
    official();
    state.sheets.unshift(
      ...Array.from({ length: 40 }, (_, i) => ({
        id: "draft-" + i,
        sheet_tab: "OTHER",
        draft_id: "revision-" + i,
      })),
    );
    expect((await lookup())?.id).toBe("approved");
  });
  it("não escolhe outra versão só porque o nome da aba coincide", async () => {
    official();
    state.sheets[0]!.sheet_tab = state.official!.source_sheet;
    expect((await lookup())?.id).toBe("approved");
  });
  it("bloqueia se a versão aprovada não estiver vinculada", async () => {
    official();
    state.draft = null;
    await expect(lookup()).rejects.toThrow("versão da escala oficial");
  });
  it("bloqueia se a aba oficial desaparecer", async () => {
    official();
    state.sheets = [];
    await expect(lookup()).rejects.toThrow("aba da escala oficial");
  });
  it("preserva o fluxo legado de uma oficial de outra origem", async () => {
    state.official = { id: "legacy", source_file: "Importada", source_sheet: "Original" };
    expect(await lookup()).toBeNull();
  });
  it("propaga falhas de consulta sem escolher um rascunho", async () => {
    state.error = Error("database unavailable");
    await expect(lookup()).rejects.toThrow("database unavailable");
  });
});
