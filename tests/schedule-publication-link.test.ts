import { describe, expect, it, vi } from "vitest";
const call = vi.hoisted(() =>
  vi.fn(async () => ({ data: { ok: true, published: true }, error: null })),
);
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: call } } }));
import {
  publicationSheetForDraft,
  draftHasPublicationBlockers,
  publishOperationalSheet,
  type OperationalSheet,
} from "../src/services/schedule-operational";
import type { GenerationDraft } from "../src/services/schedule-generation";
const draft = {
  id: "v4",
  city: "natal",
  sector: "controle-operacional",
  schedule_month: "2027-01-01",
  warnings: [],
} as unknown as GenerationDraft;
const sheet = {
  id: "same-tab",
  draft_id: "v3",
  city: draft.city,
  sector: draft.sector,
  schedule_month: draft.schedule_month,
  sheet_tab: "Controle JANEIRO 27 - 5X2",
  deleted_at: null,
  deletion_requested_at: null,
} as OperationalSheet;
describe("publicação de nova versão na aba mensal existente", () => {
  it("encontra a aba da revisão anterior preservada após arquivamento", () => {
    expect(publicationSheetForDraft(draft, [sheet])).toBe(sheet);
    expect(sheet.draft_id).toBe("v3");
  });
  it("prefere o vínculo exato da revisão", () => {
    const exact = { ...sheet, id: "v4-tab", draft_id: "v4" };
    expect(publicationSheetForDraft(draft, [sheet, exact])).toBe(exact);
  });
  it.each([
    { city: "recife" },
    { sector: "vt" },
    { schedule_month: "2026-12-01" },
    { deleted_at: "2026-10-30" },
    { deletion_requested_at: "2026-10-30" },
    { sheet_tab: "ATUALIZADA" },
  ])("não reutiliza uma aba incompatível: %j", (change) => {
    expect(publicationSheetForDraft(draft, [{ ...sheet, ...change }])).toBeNull();
  });
  it("não escolhe silenciosamente entre vínculos ambíguos", () => {
    expect(publicationSheetForDraft(draft, [sheet, { ...sheet, id: "other" }])).toBeNull();
  });
  it("reconhece bloqueios persistidos sem confundir avisos", () => {
    expect(draftHasPublicationBlockers({ ...draft, warnings: [{ level: "warning" }] })).toBe(false);
    expect(draftHasPublicationBlockers({ ...draft, warnings: [{ level: "blocking" }] })).toBe(true);
  });
  it("envia a versão explicitamente escolhida apenas ao clicar em publicar", async () => {
    expect(call).not.toHaveBeenCalled();
    await publishOperationalSheet(sheet.id, draft.id);
    expect(call).toHaveBeenCalledExactlyOnceWith("schedule-operational", {
      body: { action: "publish", sheetId: "same-tab", draftId: "v4" },
    });
  });
});
