export type UserRole = "supervisor" | "controller" | "admin";
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
  manager_id?: string;
  record_id?: string;
  scheduled_date?: string;
  sector_id?: string;
  task_title?: string;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  type: "task_assigned" | "task_note_mention";
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
  owner_id: string | null;
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
  display_order: number;
  note: string | null;
  mentioned_supervisor_id: string | null;
  mentioned_by: string | null;
  mentioned_at: string | null;
  updated_at: string;
}

export interface MentionableSupervisor {
  id: string;
  full_name: string;
}

export interface ConversationMessage {
  id: string;
  supervisor_id: string;
  manager_id: string;
  sender_id: string | null;
  sender_role: UserRole;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface ConversationManagerSummary {
  manager_id: string;
  manager_name: string;
  last_message_at: string;
  unread_count: number;
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

export interface SchedulePerson {
  name: string;
  jobTitle: string;
  assignments: Record<string, string>;
}

export interface SchedulePayload {
  dates: string[];
  people: SchedulePerson[];
  codes: string[];
}

export interface ScheduleUpload {
  id: string;
  city: string;
  sector: string;
  schedule_month: string;
  source_file: string;
  source_sheet: string;
  employee_count: number;
  entry_count: number;
  payload: SchedulePayload;
  imported_by: string | null;
  imported_at: string;
  updated_at: string;
}

export type ScheduleUploadSummary = Omit<ScheduleUpload, "payload">;

export type ScheduleSuggestionCategory = "improvement" | "addition" | "correction" | "other";
export type ScheduleSuggestionStatus = "open" | "reviewing" | "completed";

export interface ScheduleSuggestion {
  id: string;
  author_id: string;
  author_name: string;
  schedule_upload_id: string | null;
  city: string | null;
  sector: string | null;
  schedule_month: string | null;
  category: ScheduleSuggestionCategory;
  title: string;
  message: string;
  status: ScheduleSuggestionStatus;
  manager_response: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDateNote {
  id: string;
  schedule_upload_id: string;
  note_date: string;
  body: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export const SCHEDULE_SUGGESTION_CATEGORIES: ReadonlyArray<{
  value: ScheduleSuggestionCategory;
  label: string;
}> = [
  { value: "improvement", label: "Melhoria" },
  { value: "addition", label: "Adicionar algo" },
  { value: "correction", label: "Correção" },
  { value: "other", label: "Outro" },
];

export const SCHEDULE_SUGGESTION_STATUS_LABELS: Record<ScheduleSuggestionStatus, string> = {
  open: "Aberta",
  reviewing: "Em análise",
  completed: "Concluída",
};

export const SCHEDULE_CITY_OPTIONS = [
  { value: "natal", label: "Natal" },
  { value: "mossoro", label: "Mossoró" },
  { value: "fortaleza", label: "Fortaleza" },
  { value: "recife", label: "Recife" },
] as const;

export const SCHEDULE_SECTOR_OPTIONS = [
  { value: "adesao", label: "Adesão" },
  { value: "servico", label: "Serviço" },
  { value: "desconexao", label: "Desconexão" },
  { value: "mdu", label: "MDU" },
  { value: "vt", label: "VT" },
  { value: "construcao", label: "Construção" },
  { value: "manutencao", label: "Manutenção" },
  { value: "controle-operacional", label: "Controle operacional" },
] as const;

export const SECTOR_OPTIONS = [
  { slug: "natal", label: "COP Natal" },
  { slug: "desc", label: "COP DESC" },
  { slug: "fortaleza", label: "COP Fortaleza" },
  { slug: "recife", label: "COP Recife" },
  { slug: "mdu", label: "Supervisor MDU" },
  { slug: "manutencao", label: "Manutenção RN/CE" },
  { slug: "gestor", label: "Gestor" },
];

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pendente",
  active: "Ativo",
  rejected: "Rejeitado",
  inactive: "Inativo",
};
