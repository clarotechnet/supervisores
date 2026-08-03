import { formatShortDate, hhmm } from "./date-utils";
import type { AppNotification, TaskRecord } from "./types";

export type OverdueTask = Pick<
  TaskRecord,
  "id" | "scheduled_time" | "supervisor_name" | "title" | "user_id"
>;

export interface OverdueTaskGroup {
  key: string;
  supervisorId: string | null;
  supervisorName: string;
  tasks: OverdueTask[];
}

export function formatAssignmentNotification(notification: AppNotification): string {
  const date = notification.metadata.scheduled_date;
  const time = notification.metadata.due_time;
  if (!date || !time) return notification.message;
  return `${notification.message} · ${formatShortDate(date)} às ${hhmm(time)}`;
}

export function formatOverdueTask(task: OverdueTask): string {
  return `${hhmm(task.scheduled_time)} · ${task.title}`;
}

export function applyCurrentSupervisorNames(
  tasks: OverdueTask[],
  currentNames: ReadonlyMap<string, string>,
): OverdueTask[] {
  return tasks.flatMap((task) => {
    if (!task.user_id) return [];
    const currentName = currentNames.get(task.user_id);
    return currentName ? [{ ...task, supervisor_name: currentName }] : [];
  });
}

export function groupOverdueTasks(tasks: OverdueTask[]): OverdueTaskGroup[] {
  const groups = new Map<string, OverdueTaskGroup>();

  for (const task of tasks) {
    const key = task.user_id ?? `removed:${task.supervisor_name}`;
    const group = groups.get(key);
    if (group) {
      group.tasks.push(task);
      continue;
    }
    groups.set(key, {
      key,
      supervisorId: task.user_id,
      supervisorName: task.supervisor_name || "Supervisor",
      tasks: [task],
    });
  }

  return [...groups.values()];
}
