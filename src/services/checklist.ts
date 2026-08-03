import { supabase } from "@/integrations/supabase/client";
import { cacheChecklistRecords } from "@/lib/checklist-cache";
import { weekdayOf } from "@/lib/date-utils";
import type { AssignedTask, DailyChecklist, TaskRecord, TaskTemplate } from "@/lib/types";

/**
 * Garante que o checklist do dia e os registros das atividades existam.
 * A fonte oficial dos dados é sempre o banco — nada é gravado em localStorage.
 */
export async function ensureChecklist(params: {
  userId: string;
  sectorId: string;
  dateKey: string;
}): Promise<{ checklist: DailyChecklist; records: TaskRecord[] }> {
  const { userId, sectorId, dateKey } = params;

  let { data: checklist } = await supabase
    .from("daily_checklists")
    .select("*")
    .eq("user_id", userId)
    .eq("checklist_date", dateKey)
    .maybeSingle();

  if (!checklist) {
    const { data, error } = await supabase
      .from("daily_checklists")
      .insert({ user_id: userId, sector_id: sectorId, checklist_date: dateKey })
      .select("*")
      .single();
    if (error) throw error;
    checklist = data;
  }

  const dow = weekdayOf(dateKey);
  const [templatesResult, assignmentsResult, existingResult] = await Promise.all([
    supabase
      .from("task_templates")
      .select("id, title, group_name, due_time, weekdays")
      .eq("sector_id", sectorId)
      .eq("is_active", true)
      .contains("weekdays", [dow])
      .order("sort_order", { ascending: true }),
    supabase
      .from("assigned_tasks")
      .select("id, sector_id, title, group_name, scheduled_date, due_time, note")
      .eq("assigned_to", userId)
      .eq("scheduled_date", dateKey)
      .order("due_time", { ascending: true }),
    supabase
      .from("daily_task_records")
      .select("*")
      .eq("checklist_id", (checklist as DailyChecklist).id),
  ]);

  const { data: templates, error: tErr } = templatesResult;
  if (tErr) throw tErr;
  const todays = (templates ?? []) as Pick<
    TaskTemplate,
    "id" | "title" | "group_name" | "due_time" | "weekdays"
  >[];

  const { data: assignments, error: aErr } = assignmentsResult;
  if (aErr) throw aErr;

  const { data: existing, error: rErr } = existingResult;
  if (rErr) throw rErr;

  const have = new Set(((existing ?? []) as TaskRecord[]).map((r) => r.task_template_id));
  const missing = todays.filter((t) => !have.has(t.id));
  const haveAssignments = new Set(
    ((existing ?? []) as TaskRecord[]).map((r) => r.assigned_task_id).filter(Boolean),
  );
  const missingAssignments = ((assignments ?? []) as AssignedTask[]).filter(
    (task) => !haveAssignments.has(task.id),
  );

  const rowsToInsert = [
    ...missing.map((t) => ({
      checklist_id: (checklist as DailyChecklist).id,
      task_template_id: t.id,
      user_id: userId,
      sector_id: sectorId,
      title: t.title,
      group_name: t.group_name,
      scheduled_date: dateKey,
      scheduled_time: t.due_time,
    })),
    ...missingAssignments.map((task) => ({
      checklist_id: (checklist as DailyChecklist).id,
      task_template_id: null,
      assigned_task_id: task.id,
      user_id: userId,
      sector_id: task.sector_id,
      title: task.title,
      group_name: task.group_name,
      scheduled_date: task.scheduled_date,
      scheduled_time: task.due_time,
      note: task.note,
    })),
  ];

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from("daily_task_records").insert(rowsToInsert);
    if (error && error.code !== "23505") throw error;
  }

  let list: TaskRecord[];
  if (rowsToInsert.length === 0) {
    list = [...((existing ?? []) as TaskRecord[])].sort((a, b) =>
      a.scheduled_time.localeCompare(b.scheduled_time),
    );
  } else {
    const { data: records, error: finalErr } = await supabase
      .from("daily_task_records")
      .select("*")
      .eq("checklist_id", (checklist as DailyChecklist).id)
      .order("scheduled_time", { ascending: true });
    if (finalErr) throw finalErr;
    list = (records ?? []) as TaskRecord[];
  }

  cacheChecklistRecords(params, list);

  return { checklist: checklist as DailyChecklist, records: list };
}

export async function completeTask(record: TaskRecord) {
  const patch = { status: "completed" as const, completed_at: new Date().toISOString() };
  const { error } = await supabase.from("daily_task_records").update(patch).eq("id", record.id);
  if (error) throw error;
}

export async function reopenTask(record: TaskRecord) {
  const patch = { status: "reopened" as const, completed_at: null };
  const { error } = await supabase.from("daily_task_records").update(patch).eq("id", record.id);
  if (error) throw error;
}

export async function saveNote(record: TaskRecord, note: string) {
  const { error } = await supabase
    .from("daily_task_records")
    .update({ note: note.trim() || null })
    .eq("id", record.id);
  if (error) throw error;
}

export async function fetchHistory(userId: string, fromDate: string, toDate: string) {
  const { data, error } = await supabase
    .from("daily_checklists")
    .select("*")
    .eq("user_id", userId)
    .gte("checklist_date", fromDate)
    .lte("checklist_date", toDate)
    .order("checklist_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailyChecklist[];
}

export async function fetchAuditForUser(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
