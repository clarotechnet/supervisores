import { supabase } from "@/integrations/supabase/client";
import type {
  ScheduleDateNote,
  SchedulePayload,
  ScheduleSuggestion,
  ScheduleSuggestionCategory,
  ScheduleSuggestionStatus,
  ScheduleUpload,
  ScheduleUploadSummary,
} from "@/lib/types";

const SUMMARY_COLUMNS =
  "id,city,sector,schedule_month,source_file,source_sheet,employee_count,entry_count,imported_by,imported_at,updated_at";

export async function fetchScheduleUploadSummaries(): Promise<ScheduleUploadSummary[]> {
  const { data, error } = await supabase
    .from("schedule_uploads")
    .select(SUMMARY_COLUMNS)
    .order("schedule_month", { ascending: false })
    .order("city", { ascending: true })
    .order("sector", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleUploadSummary[];
}

export async function fetchScheduleUpload(id: string): Promise<ScheduleUpload | null> {
  const { data, error } = await supabase
    .from("schedule_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduleUpload | null;
}

export interface SaveScheduleUploadInput {
  city: string;
  sector: string;
  scheduleMonth: string;
  sourceFile: string;
  sourceSheet: string;
  employeeCount: number;
  entryCount: number;
  payload: SchedulePayload;
  importedBy: string;
}

export async function saveScheduleUpload(input: SaveScheduleUploadInput): Promise<string> {
  const { data, error } = await supabase
    .from("schedule_uploads")
    .upsert(
      {
        city: input.city,
        sector: input.sector,
        schedule_month: input.scheduleMonth,
        source_file: input.sourceFile,
        source_sheet: input.sourceSheet,
        employee_count: input.employeeCount,
        entry_count: input.entryCount,
        payload: input.payload as never,
        imported_by: input.importedBy,
        imported_at: new Date().toISOString(),
      },
      { onConflict: "city,sector,schedule_month" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteScheduleUpload(id: string): Promise<void> {
  const { error } = await supabase.from("schedule_uploads").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchScheduleDateNotes(scheduleId: string): Promise<ScheduleDateNote[]> {
  const { data, error } = await supabase
    .from("schedule_date_notes")
    .select("*")
    .eq("schedule_upload_id", scheduleId)
    .order("note_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleDateNote[];
}

export async function saveScheduleDateNote(input: {
  scheduleId: string;
  noteDate: string;
  body: string;
  authorId: string;
}): Promise<void> {
  const { error } = await supabase.from("schedule_date_notes").upsert(
    {
      schedule_upload_id: input.scheduleId,
      note_date: input.noteDate,
      body: input.body.trim(),
      author_id: input.authorId,
    },
    { onConflict: "schedule_upload_id,note_date" },
  );
  if (error) throw error;
}

export async function deleteScheduleDateNote(id: string): Promise<void> {
  const { error } = await supabase.from("schedule_date_notes").delete().eq("id", id);
  if (error) throw error;
}

type SuggestionRow = Omit<ScheduleSuggestion, "author_name"> & {
  author: { full_name: string } | null;
};

export async function fetchScheduleSuggestions(): Promise<ScheduleSuggestion[]> {
  const { data, error } = await supabase
    .from("schedule_suggestions")
    .select("*, author:profiles!schedule_suggestions_author_id_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SuggestionRow[]).map(({ author, ...suggestion }) => ({
    ...suggestion,
    author_name: author?.full_name || "Controlador",
  }));
}

export async function createScheduleSuggestion(input: {
  authorId: string;
  category: ScheduleSuggestionCategory;
  title: string;
  message: string;
  schedule?: ScheduleUpload | null;
}): Promise<void> {
  const { error } = await supabase.from("schedule_suggestions").insert({
    author_id: input.authorId,
    category: input.category,
    title: input.title.trim(),
    message: input.message.trim(),
    schedule_upload_id: input.schedule?.id ?? null,
    city: input.schedule?.city ?? null,
    sector: input.schedule?.sector ?? null,
    schedule_month: input.schedule?.schedule_month ?? null,
  });
  if (error) throw error;
}

export async function reviewScheduleSuggestion(input: {
  id: string;
  status: ScheduleSuggestionStatus;
  managerResponse: string;
  managerId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("schedule_suggestions")
    .update({
      status: input.status,
      manager_response: input.managerResponse.trim() || null,
      reviewed_by: input.managerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw error;
}
