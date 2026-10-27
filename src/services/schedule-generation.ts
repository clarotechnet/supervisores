import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ScheduleUpload } from "@/lib/types";
import type { ScheduleGeneratedPreview } from "@/lib/schedule-generator";
import type { ScheduleGenerationRule } from "@/lib/schedule-generator-rules";

export type GenerationDraft = Database["public"]["Tables"]["schedule_generation_drafts"]["Row"];
export type GenerationPolicy = Database["public"]["Tables"]["schedule_generation_policies"]["Row"];

export async function fetchGenerationPolicy(
  city: string, sector: string,
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
  city: string, sector: string, month: string,
): Promise<GenerationDraft[]> {
  const { data, error } = await supabase
    .from("schedule_generation_drafts")
    .select("*")
    .eq("city", city)
    .eq("sector", sector)
    .eq("schedule_month", month.slice(0, 7) + "-01")
    .order("revision", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

export interface SaveGeneratedDraftInput {
  source: ScheduleUpload;
  preview: ScheduleGeneratedPreview;
  userId: string;
}

/**
 * Uma versão nova por salvamento. Nunca grava em schedule_uploads.
 * Em caso de concorrência, recalcula a revisão. RLS valida o usuário.
 */
export async function saveGeneratedDraft({
  source, preview, userId,
}: SaveGeneratedDraftInput): Promise<{
  draft: GenerationDraft;
  auditLogged: boolean;
}> {
  const month = preview.targetMonth + "-01";
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await listGenerationDrafts(source.city, source.sector, month);
    const revision = (latest[0]?.revision ?? 0) + 1;
    const snapshot = {
      rule: preview.rule,
      eventCoverage: preview.eventCoverage,
      calendarWeeks: preview.calendarWeeks,
      outsideAssignments: preview.outsideAssignments,
      sourceMonth: preview.sourceMonth,
      engine: "deterministic-5x2-v1",
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
        source_upload_id: source.id,
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

    const { error: eventError } = await supabase
      .from("schedule_generation_events")
      .insert({
        draft_id: data.id,
        actor_id: userId,
        action: "generated",
        changes: {
          revision,
          source_upload_id: source.id,
          source_month: source.schedule_month,
          employee_count: preview.payload.people.length,
          event_count: preview.eventCoverage.length,
          pending_count: preview.blockingIssues.length,
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
    draft.policy_snapshot && typeof draft.policy_snapshot === "object" &&
    !Array.isArray(draft.policy_snapshot)
      ? (draft.policy_snapshot as Record<string, Json | undefined>)
      : {};
  const notices = Array.isArray(draft.warnings)
    ? draft.warnings.filter((notice): notice is Record<string, Json | undefined> =>
      !!notice && typeof notice === "object" && !Array.isArray(notice))
    : [];
  return {
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
      ? (snap["calendarWeeks"] as string[][]) : [],
    outsideAssignments: Array.isArray(snap["outsideAssignments"])
      ? (snap["outsideAssignments"] as Record<string, string>[]) : [],
    sourceMonth: String(snap["sourceMonth"] ?? draft.source_month ?? "").slice(0, 7),
    targetMonth: draft.schedule_month.slice(0, 7),
  };
}
