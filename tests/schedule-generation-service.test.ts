import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleUpload } from "../src/lib/types";
import type { ScheduleGeneratedPreview } from "../src/lib/schedule-generator";

const state = vi.hoisted(() => {
  return {
    tables: [] as string[],
    inserts: [] as Array<{ table: string; value: Record<string, unknown> }>,
    eventFailure: false,
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      state.tables.push(table);
      const base = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async limit() {
          return { data: [], error: null };
        },
        insert(value: Record<string, unknown>) {
          state.inserts.push({ table, value });
          if (table === "schedule_generation_events") {
            return Promise.resolve({
              error: state.eventFailure ? { code: "42501", message: "Unauthorized" } : null,
            });
          }
          return {
            select() {
              return this;
            },
            async single() {
              return {
                data: {
                  ...value,
                  id: "draft-id",
                  status: "draft",
                  created_at: "2026-10-27T15:00:00Z",
                },
                error: null,
              };
            },
          };
        },
      };
      return base;
    },
  },
}));

import {
  saveGeneratedDraft,
  restoreGenerationPreview,
  type GenerationDraft,
} from "../src/services/schedule-generation";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";

const source: ScheduleUpload = {
  id: "source-id",
  city: "recife",
  sector: "instalacao",
  schedule_month: "2026-11-01",
  source_file: "Sheets",
  source_sheet: "Recife - Instalação NOV 26",
  employee_count: 1,
  entry_count: 30,
  imported_by: "operator-id",
  imported_at: "2026-11-01",
  updated_at: "2026-11-01",
  payload: {
    dates: ["2026-11-01"],
    codes: ["M. 1"],
    people: [{ name: "TESTE", login: "Z123", jobTitle: "Técnico", assignments: {} }],
  },
};
const preview: ScheduleGeneratedPreview = {
  sourceMonth: "2026-11",
  targetMonth: "2026-12",
  rule: getScheduleGenerationRule("recife", "instalacao")!,
  eventCoverage: [{ date: "2026-12-06", planned: 1, assigned: 1 }],
  payload: {
    dates: ["2026-12-06"],
    codes: ["M. 1"],
    people: [
      { name: "TESTE", login: "Z123", jobTitle: "Técnico", assignments: { "2026-12-06": "M. 1" } },
    ],
  },
  calendarWeeks: [["2026-12-06"]],
  outsideAssignments: [{}],
  warnings: ["Revisar contrato"],
  blockingIssues: ["Revisar férias"],
};

beforeEach(() => {
  state.tables.length = 0;
  state.inserts.length = 0;
  state.eventFailure = false;
});

describe("persistência segura de rascunhos de escala", () => {
  it("salva revisão independente sem alterar schedule_uploads", async () => {
    const result = await saveGeneratedDraft({
      source,
      preview,
      userId: "user-id",
    });
    expect(result.draft.revision).toBe(1);
    expect(result.auditLogged).toBe(true);
    expect(state.tables).not.toContain("schedule_uploads");
    expect(state.inserts.map((x) => x.table)).toEqual([
      "schedule_generation_drafts",
      "schedule_generation_events",
    ]);
    expect(state.inserts[0]?.value).toMatchObject({
      city: "recife",
      sector: "instalacao",
      schedule_month: "2026-12-01",
      revision: 1,
      source_upload_id: "source-id",
      status: "draft",
      created_by: "user-id",
    });
    expect(state.inserts[1]?.value).toMatchObject({
      draft_id: "draft-id",
      action: "generated",
      actor_id: "user-id",
    });
    expect(state.inserts[0]?.value.warnings).toEqual([
      { level: "blocking", message: "Revisar férias" },
      { level: "warning", message: "Revisar contrato" },
    ]);
  });

  it("a competência seguinte usa fonte operacional sem referenciar ID errado em schedule_uploads", async () => {
    const liveSource = { ...source, id: "operational-id", operationalSourceId: "operational-id" };
    await saveGeneratedDraft({ source: liveSource, preview, userId: "user-id" });
    expect(state.inserts[0]?.value.source_upload_id).toBeNull();
    expect(state.inserts[0]?.value.policy_snapshot).toMatchObject({
      sourceOperationalId: "operational-id",
    });
    expect(state.inserts[1]?.value).toMatchObject({
      action: "generated",
      changes: { source_operational_id: "operational-id", source_upload_id: null },
    });
  });

  it("avisa se o evento de auditoria falhar, preservando rascunho", async () => {
    state.eventFailure = true;
    const result = await saveGeneratedDraft({ source, preview, userId: "user-id" });
    expect(result.draft.id).toBe("draft-id");
    expect(result.auditLogged).toBe(false);
  });
});

function vacationDraft(): GenerationDraft {
  return {
    id: "legacy-draft",
    revision: 2,
    schedule_month: "2026-12-01",
    source_month: "2026-11-01",
    status: "draft",
    payload: {
      dates: ["2026-12-06"],
      codes: ["Férias"],
      people: [
        {
          name: "TESTE",
          login: "Z123",
          jobTitle: "Técnico",
          assignments: { "2026-12-06": "Férias" },
        },
      ],
    },
    policy_snapshot: {
      rule: preview.rule,
      calendarWeeks: preview.calendarWeeks,
      outsideAssignments: [{}],
    },
    warnings: [
      {
        level: "blocking",
        message: "TESTE: confirmar datas de Férias antes de publicar a nova escala.",
      },
      {
        level: "blocking",
        message: "TESTE: confirmar datas de AT antes de publicar a nova escala.",
      },
      { level: "blocking", message: "Revisar férias" },
    ],
  } as unknown as GenerationDraft;
}

describe("continuidade de férias em versões antigas", () => {
  it("reabre, edita e salva uma nova versão sem alterar a versão histórica", async () => {
    const old = vacationDraft();
    const original = structuredClone(old);
    const restored = restoreGenerationPreview(old, preview.rule);
    expect(restored.blockingIssues).toEqual([
      "TESTE: confirmar datas de AT antes de publicar a nova escala.",
      "Revisar férias",
    ]);
    expect(restored.warnings).toContainEqual(
      expect.stringContaining("férias mantidas na proposta"),
    );
    expect(restored.payload).toEqual(old.payload);
    const result = await saveGeneratedDraft({ source, preview: restored, userId: "user-id" });
    expect(result.draft.status).toBe("draft");
    expect(state.inserts[0]!.value.warnings).toEqual([
      ...restored.blockingIssues.map((message) => ({ level: "blocking", message })),
      ...restored.warnings.map((message) => ({ level: "warning", message })),
    ]);
    expect(state.inserts[1]!.value.changes).toMatchObject({ pending_count: 2 });
    expect(old).toEqual(original);
  });

  it("não remove a confirmação de férias se não houver férias na competência", () => {
    const old = vacationDraft();
    const payload = old.payload as unknown as ScheduleGeneratedPreview["payload"];
    payload.people[0]!.assignments["2026-12-06"] = "M. 1";
    const restored = restoreGenerationPreview(old, preview.rule);
    expect(restored.blockingIssues).toHaveLength(3);
    expect(restored.warnings).toEqual([]);
  });

  it("não duplica o aviso ao reabrir e salvar uma revisão já atualizada", async () => {
    const restored = restoreGenerationPreview(vacationDraft(), preview.rule);
    const result = await saveGeneratedDraft({ source, preview: restored, userId: "user-id" });
    const reopened = restoreGenerationPreview(result.draft, preview.rule);
    expect(reopened.blockingIssues).toEqual(restored.blockingIssues);
    expect(reopened.warnings).toEqual(restored.warnings);
  });
});
