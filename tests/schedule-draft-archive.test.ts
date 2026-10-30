import { describe, expect, it, vi, beforeEach } from "vitest";
const ctx = vi.hoisted(() => ({
  updated: false,
  applied: false,
  currentStatus: "draft",
  noAccess: false,
  tables: [] as string[],
  filters: {} as Record<string, unknown>,
  values: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      ctx.tables.push(table);
      const query = {
        select: (_cols?: string) => query,
        eq(col: string, value: unknown) {
          ctx.filters[col] = value;
          return query;
        },
        is(col: string, value: unknown) {
          ctx.filters[col] = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          ctx.updated = true;
          ctx.values = value;
          return query;
        },
        async maybeSingle() {
          ctx.applied = !ctx.noAccess && ctx.filters.status === ctx.currentStatus;
          return { data: ctx.applied ? { id: "draft-1" } : null, error: null };
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
    ctx.updated = false;
    ctx.applied = false;
    ctx.currentStatus = "draft";
    ctx.noAccess = false;
    ctx.tables = [];
    ctx.filters = {};
    ctx.values = {};
  });
  it.each(["draft", "rejected"])(
    "arquiva status %s sem destruir dados ou eventos",
    async (status) => {
      ctx.currentStatus = status;
      const draft = { ...record, status } as GenerationDraft;
      const original = structuredClone(draft);
      await expect(archiveGenerationDraft(draft, "user-1")).resolves.toBeUndefined();
      expect(ctx.applied).toBe(true);
      expect(ctx.tables).toEqual(["schedule_generation_drafts"]);
      expect(ctx.filters).toEqual({ id: "draft-1", status, archived_at: null });
      expect(Object.keys(ctx.values).sort()).toEqual(["archived_at", "archived_by"]);
      expect(ctx.values.archived_by).toBe("user-1");
      expect(Number.isNaN(Date.parse(String(ctx.values.archived_at)))).toBe(false);
      expect(draft).toEqual(original);
    },
  );
  it("permite ocultar versão de mês excluído mantendo os vínculos e o histórico", async () => {
    ctx.currentStatus = "rejected";
    const draft = {
      ...record,
      status: "rejected",
      policy_snapshot: { deleted: true, officialScheduleId: "former-official-id" },
    } as GenerationDraft;
    await archiveGenerationDraft(draft, "admin-1");
    expect(ctx.applied).toBe(true);
    expect(ctx.tables).not.toContain("schedule_operational_sheets");
    expect(draft.policy_snapshot).toEqual({
      deleted: true,
      officialScheduleId: "former-official-id",
    });
  });
  it("impede remover versão aprovada", async () => {
    await expect(
      archiveGenerationDraft({ ...record, status: "approved" }, "user-1"),
    ).rejects.toThrow("não aprovados");
    expect(ctx.updated).toBe(false);
    expect(ctx.tables).toEqual([]);
  });
  it("não altera versão que foi aprovada depois da abertura da lista", async () => {
    ctx.currentStatus = "approved";
    await expect(archiveGenerationDraft(record, "user-1")).rejects.toThrow("permissão");
    expect(ctx.applied).toBe(false);
    expect(ctx.filters.status).toBe("draft");
  });
  it("não informa sucesso quando a permissão do banco impede a remoção", async () => {
    ctx.noAccess = true;
    await expect(archiveGenerationDraft(record, "user-1")).rejects.toThrow("permissão");
    expect(ctx.applied).toBe(false);
  });
  it("recusa versão já arquivada antes de tentar gravar novamente", async () => {
    await expect(
      archiveGenerationDraft(
        {
          ...record,
          archived_at: "2026-10-29T12:00:00Z",
        },
        "user-1",
      ),
    ).rejects.toThrow("já foi removido");
    expect(ctx.updated).toBe(false);
  });
});
