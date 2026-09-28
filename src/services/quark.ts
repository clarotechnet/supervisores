import { supabase } from "@/integrations/supabase/client";
import type {
  QuarkDay,
  QuarkDirectory,
  QuarkHome,
  QuarkPerson,
  QuarkPunch,
  QuarkSyncRun,
} from "@/lib/quark";

const PAGE_SIZE = 1000;

export async function fetchQuarkPeople(): Promise<QuarkPerson[]> {
  const { data, error } = await supabase
    .from("quark_people")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchQuarkDirectories(): Promise<QuarkDirectory[]> {
  const { data, error } = await supabase.from("quark_people_directory").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchQuarkHomes(): Promise<QuarkHome[]> {
  const { data, error } = await supabase.from("quark_home_locations").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchQuarkDays(startDate: string, endDate: string): Promise<QuarkDay[]> {
  const rows: QuarkDay[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("quark_daily_records")
      .select("*")
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .order("work_date", { ascending: false })
      .order("unit_id", { ascending: true })
      .order("collaborator_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchQuarkPunches(startDate: string, endDate: string): Promise<QuarkPunch[]> {
  const rows: QuarkPunch[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("quark_punches")
      .select("*")
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .order("work_date", { ascending: false })
      .order("punch_time", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchQuarkPunchesForPerson(
  unitId: number,
  collaboratorId: string,
  startDate: string,
  endDate: string,
): Promise<QuarkPunch[]> {
  const rows: QuarkPunch[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("quark_punches")
      .select("*")
      .eq("unit_id", unitId)
      .eq("collaborator_id", collaboratorId)
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .order("work_date", { ascending: false })
      .order("punch_time", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchLastQuarkSync(): Promise<QuarkSyncRun | null> {
  const { data, error } = await supabase
    .from("quark_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function throwFunctionError(error: unknown): Promise<never> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.json()) as { error?: string };
        if (body.error) throw new Error(body.error);
      } catch (contextError) {
        if (
          contextError instanceof Error &&
          contextError.message !== "Unexpected end of JSON input"
        ) {
          throw contextError;
        }
      }
    }
  }
  throw error;
}

export async function syncQuark(startDate: string, endDate: string): Promise<void> {
  const { error } = await supabase.functions.invoke("quark-sync", {
    body: { startDate, endDate },
  });
  if (error) await throwFunctionError(error);
}

export async function syncQuarkLocations(
  unitId: number,
  collaboratorId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke("quark-location-sync", {
    body: { unitId, collaboratorId, startDate, endDate },
  });
  if (error) await throwFunctionError(error);
}

export async function saveQuarkDirectory(
  row: Omit<QuarkDirectory, "created_at" | "updated_at">,
): Promise<void> {
  const { error } = await supabase
    .from("quark_people_directory")
    .upsert(row, { onConflict: "unit_id,collaborator_id" });
  if (error) throw error;
}

export async function saveQuarkDirectories(
  rows: Omit<QuarkDirectory, "created_at" | "updated_at">[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += 250) {
    const chunk = rows.slice(index, index + 250);
    const { error } = await supabase
      .from("quark_people_directory")
      .upsert(chunk, { onConflict: "unit_id,collaborator_id" });
    if (error) throw error;
  }
}

export async function deleteQuarkDirectory(unitId: number, collaboratorId: string): Promise<void> {
  const { error } = await supabase
    .from("quark_people_directory")
    .delete()
    .eq("unit_id", unitId)
    .eq("collaborator_id", collaboratorId);
  if (error) throw error;
}

export async function saveQuarkHome(
  row: Omit<QuarkHome, "created_at" | "updated_at">,
): Promise<void> {
  const { error } = await supabase
    .from("quark_home_locations")
    .upsert(row, { onConflict: "unit_id,collaborator_id" });
  if (error) throw error;
}

export async function deleteQuarkHome(unitId: number, collaboratorId: string): Promise<void> {
  const { error } = await supabase
    .from("quark_home_locations")
    .delete()
    .eq("unit_id", unitId)
    .eq("collaborator_id", collaboratorId);
  if (error) throw error;
}
