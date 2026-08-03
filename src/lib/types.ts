export type UserRole = "supervisor" | "admin";
export type UserStatus = "pending" | "active" | "rejected" | "inactive";
export type TaskStatus = "pending" | "completed" | "reopened";

export interface Sector {
  id: string;
  name: string;
  slug: string;
  code: string;
  subtitle: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  sector_id: string | null;
  role: UserRole;
  status: UserStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignedTask {
  id: string;
  assigned_to: string;
  assigned_by: string | null;
  sector_id: string;
  title: string;
  group_name: string;
  scheduled_date: string;
  due_time: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationMetadata {
  due_time?: string;
  group_name?: string;
  scheduled_date?: string;
  sector_id?: string;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  type: "task_assigned";
  title: string;
  message: string;
  entity_id: string | null;
  metadata: NotificationMetadata;
  read_at: string | null;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  code: string | null;
  sector_id: string;
  title: string;
  group_name: string;
  due_time: string;
  weekdays: number[];
  sort_order: number;
  is_active: boolean;
}

export interface DailyChecklist {
  id: string;
  user_id: string | null;
  supervisor_name: string;
  sector_id: string;
  checklist_date: string;
  total_tasks: number;
  completed_tasks: number;
  status: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  checklist_id: string;
  task_template_id: string | null;
  assigned_task_id: string | null;
  user_id: string | null;
  supervisor_name: string;
  sector_id: string;
  title: string;
  group_name: string;
  scheduled_date: string;
  scheduled_time: string;
  status: TaskStatus;
  completed_at: string | null;
  note: string | null;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export const SECTOR_OPTIONS = [
  { slug: "natal", label: "COP Natal" },
  { slug: "desc", label: "COP DESC" },
  { slug: "fortaleza", label: "COP Fortaleza" },
  { slug: "recife", label: "COP Recife" },
  // { slug: "mdu", label: "MDU" },
  { slug: "manutencao", label: "Manutenção RN/CE" },
  { slug: "gestor", label: "Gestor" },
];

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pendente",
  active: "Ativo",
  rejected: "Rejeitado",
  inactive: "Inativo",
};
