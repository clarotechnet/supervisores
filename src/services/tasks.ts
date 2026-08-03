import { supabase } from "@/integrations/supabase/client";
import type { AssignedTask } from "@/lib/types";

export interface AssignedTaskInput {
  assigned_to: string;
  assigned_by: string;
  sector_id: string;
  title: string;
  group_name: string;
  scheduled_date: string;
  due_time: string;
  note: string | null;
}

export async function createAssignedTask(input: AssignedTaskInput): Promise<AssignedTask> {
  const { data, error } = await supabase.from("assigned_tasks").insert(input).select("*").single();
  if (error) throw error;
  return data as AssignedTask;
}

export async function fetchAssignedTasks(fromDate: string, toDate: string) {
  const { data, error } = await supabase
    .from("assigned_tasks")
    .select("*")
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_date", { ascending: true })
    .order("due_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssignedTask[];
}

export async function deleteAssignedTask(taskId: string) {
  const { error } = await supabase.from("assigned_tasks").delete().eq("id", taskId);
  if (error) throw error;
}
