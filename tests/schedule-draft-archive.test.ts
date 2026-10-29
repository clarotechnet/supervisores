import { describe, expect, it, vi, beforeEach } from "vitest";
const ctx = vi.hoisted(() => ({ linked: false, updated: false, archived: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const query = {
        select: (_cols?: string) => query,
        eq: (_col: string, _value: unknown) => query,
        order: () => query,
        is: () => query,
        async limit() {
          if (table === "schedule_operational_sheets")
            return { data: ctx.linked ? [{ id: "sheet-1" }] : [], error: null };
          return { data: [], error: null };
        },
        update(_value: Record<string, unknown>) {
          ctx.updated = true;
          return query;
        },
        async maybeSingle() {
          return { data: { id: "draft-1" }, error: null };
        },
      };
      return query;
    },
  },
}));
import { archiveGenerationDraft } from "../src/services/schedule-generation";
import type { GenerationDraft } from "../src/services/schedule-generation";
const record = { id: "draft-1", status: "draft", revision: 2 } as GenerationDraft;
describe("remoção segura de rascunho com histórico", () => {
  beforeEach(() => {
    ctx.linked = false;
    ctx.updated = false;
    ctx.archived = false;
  });
  it("arquiva versão sem destruir dados ou eventos", async () => {
    await expect(archiveGenerationDraft(record, "user-1")).resolves.toBeUndefined();
    expect(ctx.updated).toBe(true);
  });
  it("permite ocultar da lista mesmo quando há planilha vinculada, preservando o vínculo", async () => {
    ctx.linked = true;
    await expect(archiveGenerationDraft(record, "user-1")).resolves.toBeUndefined();
    expect(ctx.updated).toBe(true);
  });
  it("impede remover rascunho aprovado", async () => {
    await expect(
      archiveGenerationDraft({ ...record, status: "approved" }, "user-1"),
    ).rejects.toThrow("não aprovados");
    expect(ctx.updated).toBe(false);
  });
});
