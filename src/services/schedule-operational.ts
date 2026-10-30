import { supabase } from "@/integrations/supabase/client";
import type { Json, Database } from "@/integrations/supabase/types";
import type { SchedulePayload } from "@/lib/types";
import type { GenerationDraft } from "./schedule-generation";
import { scheduleCodeKind } from "../lib/schedule-import";
export type OperationalSheet = Database["public"]["Tables"]["schedule_operational_sheets"]["Row"];
export type OperationalChange = Database["public"]["Tables"]["schedule_operational_changes"]["Row"];

export async function listOperationalSheets(city: string, sector: string, month: string) {
  const { data, error } = await supabase
    .from("schedule_operational_sheets")
    .select("*")
    .eq("city", city)
    .eq("sector", sector)
    .eq("schedule_month", month.slice(0, 7) + "-01")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).filter((row) => !row.deleted_at);
}
export async function latestOperationalSource(
  city: string,
  sector: string,
  month: string,
  options: { allowDeletionPending?: boolean } = {},
) {
  // Após a publicação, uma versão em revisão criada depois não pode
  // substituir silenciosamente a escala oficial do mês.
  const { data: official, error } = await supabase
    .from("schedule_uploads")
    .select("id,source_file,source_sheet")
    .eq("city", city)
    .eq("sector", sector)
    .eq("schedule_month", month.slice(0, 7) + "-01")
    .maybeSingle();
  if (error) throw error;
  if (official?.source_file === "Google Sheets - Escala operacional oficial") {
    const { data: draft, error: draftError } = await supabase
      .from("schedule_generation_drafts")
      .select("id,policy_snapshot")
      .eq("city", city)
      .eq("sector", sector)
      .eq("schedule_month", month.slice(0, 7) + "-01")
      .eq("status", "approved")
      .is("archived_at", null)
      .contains("policy_snapshot", { published: true, officialScheduleId: official.id })
      .maybeSingle();
    if (draftError) throw draftError;
    if (!draft) throw Error("A versão da escala oficial não está vinculada no Supabase.");
    // Busca direta: a oficial pode ser mais antiga que as últimas 30 revisões.
    const { data: approved, error: sheetError } = await supabase
      .from("schedule_operational_sheets")
      .select("*")
      .eq("draft_id", draft.id)
      .eq("city", city)
      .eq("sector", sector)
      .eq("schedule_month", month.slice(0, 7) + "-01")
      .eq("sheet_tab", official.source_sheet)
      .maybeSingle();
    if (sheetError) throw sheetError;
    if (!approved) throw Error("A aba da escala oficial não está vinculada no Supabase.");
    if (approved.deleted_at || (approved.deletion_requested_at && !options.allowDeletionPending))
      throw Error("A escala-base está em exclusão ou já foi excluída.");
    const snapshot = draft.policy_snapshot as { rule?: Record<string, unknown> } | null;
    return { ...approved, generationRule: snapshot?.rule || null };
  }
  // Uma revisão não aprovada nunca se torna a fonte por ser a mais recente.
  return null;
}
export async function fetchOperationalChanges(sheetId: string): Promise<OperationalChange[]> {
  const { data, error } = await supabase
    .from("schedule_operational_changes")
    .select("*")
    .eq("sheet_id", sheetId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function invoke(
  action: "create" | "sync" | "publish" | "delete" | "inspect_delete" | "read",
  props: {
    draftId?: string;
    sheetId?: string;
    scheduleId?: string;
    confirmation?: string;
    confirmedGridId?: number;
    expectedUpdatedAt?: string;
  },
) {
  const { data, error } = await supabase.functions.invoke("schedule-operational", {
    body: { action, ...props },
  });
  if (error) {
    if (error && typeof error === "object" && "context" in error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const body = (await context
          .clone()
          .json()
          .catch(() => null)) as { error?: string } | null;
        if (body?.error) throw Error(body.error);
      }
    }
    throw error;
  }
  if (data?.error) throw Error(String(data.error));
  return data as {
    ok: boolean;
    existing?: boolean;
    published?: boolean;
    deleted?: boolean;
    officialId?: string;
    sheetId: string;
    url?: string;
    tab?: string;
    changes?: number;
    addedPeople?: number;
    auditedLogged?: boolean;
    auditLogged?: boolean;
    syncedAt?: string;
    warning?: string;
    payload?: SchedulePayload;
    readAt?: string;
    gridId?: number;
    confirmation?: string;
    expectedUpdatedAt?: string;
    linkChanged?: boolean;
  };
}
export const createOperationalSheet = (draftId: string) => invoke("create", { draftId });
export const syncOperationalSheet = (sheetId: string) => invoke("sync", { sheetId });
export async function readOperationalSheet(sheetId: string) {
  const result = await invoke("read", { sheetId });
  if (!result.payload?.people?.length || !result.payload.dates?.length)
    throw Error(
      "O servidor não confirmou a leitura atual da escala anterior. Nenhuma base antiga será usada.",
    );
  return result.payload;
}
export const inspectOperationalSheetDeletion = (sheetId: string) =>
  invoke("inspect_delete", { sheetId });
export const deleteOperationalSheet = (
  sheetId: string,
  scheduleId: string,
  confirmation: string,
  target?: { gridId?: number; expectedUpdatedAt?: string },
) =>
  invoke("delete", {
    sheetId,
    scheduleId,
    confirmation,
    ...(target?.gridId !== undefined ? { confirmedGridId: target.gridId } : {}),
    ...(target?.expectedUpdatedAt !== undefined
      ? { expectedUpdatedAt: target.expectedUpdatedAt }
      : {}),
  });
/** A revisão escolhida é vinculada e publicada atomicamente, sem copiar a aba. */
export const publishOperationalSheet = (sheetId: string, draftId?: string) =>
  invoke("publish", { sheetId, ...(draftId ? { draftId } : {}) });

export function publicationSheetForDraft(
  draft: Pick<GenerationDraft, "id" | "city" | "sector" | "schedule_month">,
  sheets: OperationalSheet[],
): OperationalSheet | null {
  const active = sheets.filter(
    (sheet) =>
      !sheet.deleted_at &&
      !sheet.deletion_requested_at &&
      sheet.sheet_tab &&
      sheet.sheet_tab !== "ATUALIZADA" &&
      sheet.city === draft.city &&
      sheet.sector === draft.sector &&
      sheet.schedule_month === draft.schedule_month,
  );
  const exact = active.find((sheet) => sheet.draft_id === draft.id);
  return exact ?? (active.length === 1 ? active[0]! : null);
}

export function draftHasPublicationBlockers(draft: GenerationDraft): boolean {
  return (
    Array.isArray(draft.warnings) &&
    draft.warnings.some(
      (notice) =>
        notice &&
        typeof notice === "object" &&
        !Array.isArray(notice) &&
        notice["level"] === "blocking",
    )
  );
}

export function livePayload(row: OperationalSheet): SchedulePayload {
  return row.current_payload as unknown as SchedulePayload;
}
export function plannedPayload(row: OperationalSheet): SchedulePayload {
  return row.planned_payload as unknown as SchedulePayload;
}
export function operationalDifferenceCount(row: OperationalSheet): number {
  const planned = plannedPayload(row),
    current = livePayload(row);
  const byName = new Map(current.people.map((p) => [p.name.toUpperCase(), p]));
  return planned.people.reduce(
    (sum, p) =>
      sum +
      planned.dates.filter(
        (date) =>
          (byName.get(p.name.toUpperCase())?.assignments[date] ?? "") !==
          (p.assignments[date] ?? ""),
      ).length,
    0,
  );
}
export interface CurrentDifference {
  name: string;
  date: string;
  planned: string;
  current: string;
}
export function operationalDifferences(sheet: OperationalSheet): CurrentDifference[] {
  const planned = plannedPayload(sheet),
    updated = livePayload(sheet);
  const map = new Map(updated.people.map((p) => [p.name.toUpperCase(), p]));
  return planned.people.flatMap((p) => {
    const actual = map.get(p.name.toUpperCase());
    return planned.dates.flatMap((date) => {
      const a = p.assignments[date] ?? "",
        b = actual?.assignments[date] ?? "";
      return a === b ? [] : [{ name: p.name, date, planned: a, current: b }];
    });
  });
}
export interface WeeklyRestAlert {
  employee: string;
  start: string;
  end: string;
  restDays: number;
  workDays: number;
}
export function operationalWeeklyRestAlerts(sheet: OperationalSheet): WeeklyRestAlert[] {
  const current = livePayload(sheet);
  const alerts: WeeklyRestAlert[] = [];
  for (const person of current.people) {
    for (let i = 0; i + 6 < current.dates.length; i += 7) {
      const week = current.dates.slice(i, i + 7);
      const kinds = week.map((d) => scheduleCodeKind(person.assignments[d] || ""));
      const restDays = kinds.filter((kind) => kind === "off").length;
      const workDays = kinds.filter((kind) => kind === "work").length;
      if (restDays < 2 || workDays > 5)
        alerts.push({
          employee: person.name,
          start: week[0]!,
          end: week[6]!,
          restDays,
          workDays,
        });
    }
  }
  return alerts;
}
export interface CoverageGap {
  date: string;
  expected: number;
  current: number;
}
export function operationalCoverageGaps(sheet: OperationalSheet): CoverageGap[] {
  const planned = plannedPayload(sheet),
    current = livePayload(sheet);
  const work = (code: string | undefined) => !!code && scheduleCodeKind(code) === "work";
  const plannedWork = (date: string) =>
    planned.people.filter((p) => work(p.assignments[date])).length;
  const currentWork = (date: string) =>
    current.people.filter((p) => work(p.assignments[date])).length;
  const holidays = new Set([
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
  ]);
  return planned.dates
    .filter((date) => {
      const day = new Date(date + "T12:00:00Z").getUTCDay();
      return (day === 0 || holidays.has(date.slice(5, 10))) && plannedWork(date) > 0;
    })
    .flatMap((date) => {
      const expected = plannedWork(date),
        actual = currentWork(date);
      return actual < expected ? [{ date, expected, current: actual }] : [];
    });
}
export function jsonPayload(value: SchedulePayload): Json {
  return value as unknown as Json;
}
