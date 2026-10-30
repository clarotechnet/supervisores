import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ScheduleUpload } from "@/lib/types";
import type { ScheduleGeneratedPreview } from "@/lib/schedule-generator";
import type { ScheduleGenerationRule } from "@/lib/schedule-generator-rules";
import { applyVacationContinuationPolicy } from "../lib/schedule-preview-policy";

export type GenerationDraft = Database["public"]["Tables"]["schedule_generation_drafts"]["Row"];
export type GenerationPolicy = Database["public"]["Tables"]["schedule_generation_policies"]["Row"];

export async function fetchGenerationPolicy(
  city: string,
  sector: string,
): Promise<ScheduleGenerationRule | null> {
  const { data, error } = await supabase
    .from("schedule_generation_policies")
    .select("rules")
    .eq("city", city)
    .eq("sector", sector)
    .maybeSingle();
  if (error) throw error;
  return data?.rules ? (data.rules as unknown as ScheduleGenerationRule) : null;
}

export async function listGenerationDrafts(
  city: string,
  sector: string,
  month: string,
): Promise<GenerationDraft[]> {
  const { data, error } = await supabase
    .from("schedule_generation_drafts")
    .select("*")
    .eq("city", city)
    .eq("sector", sector)
    .eq("schedule_month", month.slice(0, 7) + "-01")
    .order("revision", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).filter((row) => !row.archived_at).slice(0, 30);
}

/** Retira a versão da lista sem destruir a auditoria, o registro de
 * planilha operacional ou a própria aba/arquivo do Google.
 * O vínculo por draft_id permanece íntegro mesmo após o arquivamento.
 */
export async function archiveGenerationDraft(
  draft: GenerationDraft,
  userId: string,
): Promise<void> {
  if (draft.archived_at) throw Error("Este rascunho já foi removido da lista.");
  if (!["draft", "rejected"].includes(draft.status))
    throw Error("Apenas rascunhos não aprovados podem ser removidos.");
  const { data, error } = await supabase
    .from("schedule_generation_drafts")
    .update({ archived_at: new Date().toISOString(), archived_by: userId })
    .eq("id", draft.id)
    .eq("status", draft.status)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Error("Rascunho não encontrado ou você não tem permissão para removê-lo.");
}

export interface SaveGeneratedDraftInput {
  source: ScheduleUpload & { operationalSourceId?: string };
  preview: ScheduleGeneratedPreview;
  userId: string;
}

/**
 * Uma versão nova por salvamento. Nunca grava em schedule_uploads.
 * Em caso de concorrência, recalcula a revisão. RLS valida o usuário.
 */
export async function saveGeneratedDraft({
  source,
  preview,
  userId,
}: SaveGeneratedDraftInput): Promise<{
  draft: GenerationDraft;
  auditLogged: boolean;
}> {
  preview = applyVacationContinuationPolicy(preview);
  const month = preview.targetMonth + "-01";
  for (let attempt = 0; attempt < 3; attempt++) {
    // Use all revisions, including archived ones, to avoid UNIQUE collisions.
    const { data: latest, error: revisionError } = await supabase
      .from("schedule_generation_drafts")
      .select("revision")
      .eq("city", source.city)
      .eq("sector", source.sector)
      .eq("schedule_month", month)
      .order("revision", { ascending: false })
      .limit(1);
    if (revisionError) throw revisionError;
    const revision = (latest?.[0]?.revision ?? 0) + 1;
    const snapshot = {
      rule: preview.rule,
      eventCoverage: preview.eventCoverage,
      calendarWeeks: preview.calendarWeeks,
      outsideAssignments: preview.outsideAssignments,
      sourceMonth: preview.sourceMonth,
      sourceOperationalId: source.operationalSourceId ?? null,
      referenceSeedId: preview.referenceSeedId ?? null,
      fixedRestPolicy: preview.fixedRestPolicy ?? null,
      fixedRestEvidence: preview.fixedRestEvidence ?? [],
      generationDecision: preview.generationDecision ?? null,
      sourceUpdatedAt: source.updated_at,
      sourceSheet: source.source_sheet,
      engine: preview.referenceSeedId ? "reference-initial-5x2-v1" : "history-assisted-5x2-v2",
      published: false,
    };
    const warnings = [
      ...preview.blockingIssues.map((message) => ({ level: "blocking", message })),
      ...preview.warnings.map((message) => ({ level: "warning", message })),
    ];
    const { data, error } = await supabase
      .from("schedule_generation_drafts")
      .insert({
        city: source.city,
        sector: source.sector,
        schedule_month: month,
        revision,
        source_upload_id: source.operationalSourceId ? null : source.id,
        source_month: source.schedule_month,
        payload: preview.payload as unknown as Json,
        policy_snapshot: snapshot as unknown as Json,
        warnings: warnings as unknown as Json,
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();
    if (error?.code === "23505") continue;
    if (error) throw error;
    if (!data) throw new Error("O banco não retornou o rascunho salvo.");

    const { error: eventError } = await supabase.from("schedule_generation_events").insert({
      draft_id: data.id,
      actor_id: userId,
      action: "generated",
      changes: {
        revision,
        source_upload_id: source.operationalSourceId ? null : source.id,
        source_operational_id: source.operationalSourceId ?? null,
        source_month: source.schedule_month,
        employee_count: preview.payload.people.length,
        event_count: preview.eventCoverage.length,
        pending_count: preview.blockingIssues.length,
        generation_decision: preview.generationDecision ?? null,
        fixed_rest_evidence: preview.fixedRestEvidence ?? [],
        source_updated_at: source.updated_at,
      },
    });
    return { draft: data, auditLogged: !eventError };
  }
  throw new Error(
    "Outros usuários salvaram versões simultaneamente. Atualize o histórico e tente novamente.",
  );
}

export function restoreGenerationPreview(
  draft: GenerationDraft,
  fallbackRule: ScheduleGenerationRule,
): ScheduleGeneratedPreview {
  const snap =
    draft.policy_snapshot &&
    typeof draft.policy_snapshot === "object" &&
    !Array.isArray(draft.policy_snapshot)
      ? (draft.policy_snapshot as Record<string, Json | undefined>)
      : {};
  const notices = Array.isArray(draft.warnings)
    ? draft.warnings.filter(
        (notice): notice is Record<string, Json | undefined> =>
          !!notice && typeof notice === "object" && !Array.isArray(notice),
      )
    : [];
  return applyVacationContinuationPolicy({
    payload: draft.payload as unknown as ScheduleGeneratedPreview["payload"],
    rule: (snap["rule"] as unknown as ScheduleGenerationRule) ?? fallbackRule,
    eventCoverage: Array.isArray(snap["eventCoverage"])
      ? (snap["eventCoverage"] as unknown as ScheduleGeneratedPreview["eventCoverage"])
      : [],
    warnings: notices
      .filter((x) => x["level"] === "warning" && typeof x["message"] === "string")
      .map((x) => String(x["message"])),
    blockingIssues: notices
      .filter((x) => x["level"] === "blocking" && typeof x["message"] === "string")
      .map((x) => String(x["message"])),
    calendarWeeks: Array.isArray(snap["calendarWeeks"])
      ? (snap["calendarWeeks"] as string[][])
      : [],
    outsideAssignments: Array.isArray(snap["outsideAssignments"])
      ? (snap["outsideAssignments"] as Record<string, string>[])
      : [],
    sourceMonth: String(snap["sourceMonth"] ?? draft.source_month ?? "").slice(0, 7),
    targetMonth: draft.schedule_month.slice(0, 7),
    ...(snap["fixedRestPolicy"] === "preserve-history" ||
    snap["fixedRestPolicy"] === "initial-distribution"
      ? { fixedRestPolicy: snap["fixedRestPolicy"] }
      : {}),
    ...(Array.isArray(snap["fixedRestEvidence"])
      ? {
          fixedRestEvidence: snap["fixedRestEvidence"] as unknown as NonNullable<
            ScheduleGeneratedPreview["fixedRestEvidence"]
          >,
        }
      : {}),
    ...(snap["generationDecision"] && typeof snap["generationDecision"] === "object"
      ? {
          generationDecision: snap["generationDecision"] as unknown as NonNullable<
            ScheduleGeneratedPreview["generationDecision"]
          >,
        }
      : {}),
    ...(typeof snap["referenceSeedId"] === "string"
      ? { referenceSeedId: snap["referenceSeedId"] }
      : {}),
  });
}
