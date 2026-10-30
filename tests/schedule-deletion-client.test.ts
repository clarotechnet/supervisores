import { beforeEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import {
  deleteOperationalSheet,
  inspectOperationalSheetDeletion,
  readOperationalSheet,
} from "../src/services/schedule-operational";
beforeEach(() => invoke.mockReset());
describe("cliente da exclusão e leitura atuais", () => {
  it("inspeção não manda confirmação nem ação destrutiva", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, gridId: 100, confirmation: "EXCLUIR 2027-01 ABA 100" },
      error: null,
    });
    expect((await inspectOperationalSheetDeletion("sheet")).gridId).toBe(100);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("schedule-operational", {
      body: { action: "inspect_delete", sheetId: "sheet" },
    });
  });
  it("preserva o corpo JSON do HTTP 409 para exibir o impedimento real", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: Response.json(
          { code: "SHEET_LINK_CHANGED", error: "O vínculo mudou. Reabra a confirmação." },
          { status: 409 },
        ),
      },
    });
    await expect(
      deleteOperationalSheet("sheet", "official", "EXCLUIR 2027-01 ABA 100", {
        gridId: 100,
        expectedUpdatedAt: "fresh",
      }),
    ).rejects.toThrow("O vínculo mudou. Reabra a confirmação.");
    expect(invoke.mock.calls[0]![1].body).toMatchObject({
      confirmedGridId: 100,
      expectedUpdatedAt: "fresh",
      scheduleId: "official",
    });
  });
  it("não aceita servidor antigo sem payload atual como leitura válida", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(readOperationalSheet("sheet")).rejects.toThrow("Nenhuma base antiga");
  });
});
