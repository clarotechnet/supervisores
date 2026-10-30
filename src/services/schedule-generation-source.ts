import { supabase } from "@/integrations/supabase/client";
import type { ScheduleUpload } from "@/lib/types";
import type { ScheduleGenerationRule } from "@/lib/schedule-generator-rules";
import { latestOperationalSource, readOperationalSheet } from "./schedule-operational";
export type ScheduleGenerationSource = ScheduleUpload & {
  operationalSourceId?: string;
  inheritedRule?: Partial<ScheduleGenerationRule>;
};
/** Lê novamente a fonte oficial da competência anterior; nunca consulta o workbook de referência. */
export async function loadScheduleGenerationSource(
  city: string,
  sector: string,
  month: string,
): Promise<ScheduleGenerationSource | null> {
  const live = await latestOperationalSource(city, sector, month);
  if (live) {
    // Read Google now. current_payload is only the last persisted sync, not freshness evidence.
    const payload = await readOperationalSheet(live.id);
    return {
      id: live.id,
      operationalSourceId: live.id,
      city,
      sector,
      schedule_month: month + "-01",
      source_file: "Escala operacional sincronizada",
      source_sheet: live.sheet_tab,
      imported_by: live.created_by,
      imported_at: live.last_synced_at || live.created_at,
      updated_at: live.updated_at,
      employee_count: payload.people.length,
      entry_count: payload.people.length * payload.dates.length,
      payload,
      inheritedRule: (live.generationRule || {}) as Partial<ScheduleGenerationRule>,
    };
  }
  const { data, error } = await supabase
    .from("schedule_uploads")
    .select("*")
    .eq("city", city)
    .eq("sector", sector)
    .eq("schedule_month", month + "-01")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Uma oficial sem vínculo não pode cair silenciosamente em uma base antiga.
  if (data.source_file === "Google Sheets - Escala operacional oficial")
    throw Error("O vínculo da escala oficial precisa ser conferido antes de gerar.");
  return data as unknown as ScheduleGenerationSource;
}
