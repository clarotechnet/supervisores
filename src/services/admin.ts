import { supabase } from "@/integrations/supabase/client";
import type { Profile, Sector, TaskRecord, UserRole, UserStatus } from "@/lib/types";

export interface AdminRecordRow extends TaskRecord {
  profiles?: { full_name: string } | null;
}

export async function fetchSectors(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Sector[];
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchRecordsRange(fromDate: string, toDate: string) {
  const { data, error } = await supabase
    .from("daily_task_records")
    .select("*")
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskRecord[];
}

export async function fetchChecklistsRange(fromDate: string, toDate: string) {
  const { data, error } = await supabase
    .from("daily_checklists")
    .select("*")
    .gte("checklist_date", fromDate)
    .lte("checklist_date", toDate);
  if (error) throw error;
  return data ?? [];
}

export async function updateProfileStatus(profileId: string, status: UserStatus, adminId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({
      status,
      approved_at: status === "active" ? new Date().toISOString() : null,
      approved_by: status === "active" ? adminId : null,
    })
    .eq("id", profileId);
  if (error) throw error;
  await supabase.from("audit_logs").insert({
    user_id: adminId,
    action: `profile_${status}`,
    entity: "profiles",
    entity_id: profileId,
    new_data: { status } as never,
  });
}

export async function updateProfileSector(profileId: string, sectorId: string, adminId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ sector_id: sectorId })
    .eq("id", profileId);
  if (error) throw error;
  await supabase.from("audit_logs").insert({
    user_id: adminId,
    action: "profile_sector_change",
    entity: "profiles",
    entity_id: profileId,
    new_data: { sector_id: sectorId } as never,
  });
}

export async function updateProfileRole(profileId: string, role: UserRole, adminId: string) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) throw error;
  await supabase.from("audit_logs").insert({
    user_id: adminId,
    action: "profile_role_change",
    entity: "profiles",
    entity_id: profileId,
    new_data: { role } as never,
  });
}

export async function deleteUserAccount(profileId: string) {
  const { data, error } = await supabase.functions.invoke("admin-delete-user", {
    body: { userId: profileId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
}

export async function fetchTemplates(sectorId?: string) {
  let query = supabase.from("task_templates").select("*").order("sort_order", { ascending: true });
  if (sectorId) query = query.eq("sector_id", sectorId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface TemplateInput {
  sector_id: string;
  title: string;
  group_name: string;
  due_time: string;
  weekdays: number[];
  sort_order: number;
  is_active: boolean;
}

export async function createTemplate(input: TemplateInput) {
  const { error } = await supabase.from("task_templates").insert(input);
  if (error) throw error;
}

export async function updateTemplate(id: string, input: Partial<TemplateInput>) {
  const { error } = await supabase.from("task_templates").update(input).eq("id", id);
  if (error) throw error;
}

export async function fetchAuditLogs(entityId?: string, limit = 100) {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
