import {
  formatNotificationDescription,
  groupOverdueTasks,
  type OverdueTask,
  type OverdueTaskGroup,
} from "./assignment-notification";
import type { AppNotification, ConversationMessage, UserRole } from "./types";

interface NotificationLabel {
  key: string;
  title: string;
  description: string;
}
export type NotificationItem = NotificationLabel &
  (
    | { kind: "task"; notification: AppNotification }
    | { kind: "mention"; notification: AppNotification }
    | { kind: "message"; message: ConversationMessage }
    | { kind: "overdue"; group: OverdueTaskGroup }
  );

export function updateUnreadItem<T extends { id: string; read_at: string | null }>(
  current: T[],
  incoming: T,
): T[] {
  const remaining = current.filter((item) => item.id !== incoming.id);
  return incoming.read_at ? remaining : [...remaining, incoming];
}

export function isIncomingMessage(message: ConversationMessage, userId: string, role: UserRole) {
  return (
    message.sender_id !== userId &&
    ((role === "supervisor" &&
      message.sender_role === "admin" &&
      message.supervisor_id === userId) ||
      (role === "admin" && message.sender_role === "supervisor"))
  );
}

export function notificationCenterItems(
  notifications: AppNotification[],
  messages: ConversationMessage[],
  overdueTasks: OverdueTask[],
  dismissedOverdueIds: ReadonlySet<string>,
  role: UserRole,
): NotificationItem[] {
  const persistent: Array<NotificationItem & { createdAt: string }> = [
    ...notifications
      .filter((item) => !item.read_at)
      .map((notification) => ({
        key: `notification-${notification.id}`,
        kind: notification.type === "task_note_mention" ? ("mention" as const) : ("task" as const),
        title: notification.title,
        description: formatNotificationDescription(notification),
        notification,
        createdAt: notification.created_at,
      })),
    ...messages
      .filter((item) => !item.read_at)
      .map((message) => ({
        key: `message-${message.id}`,
        kind: "message" as const,
        title: role === "supervisor" ? "Nova mensagem da gestão" : "Nova resposta de supervisor",
        description: message.body,
        message,
        createdAt: message.created_at,
      })),
  ];
  persistent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [
    ...groupOverdueTasks(overdueTasks)
      .filter((group) => group.tasks.some((task) => !dismissedOverdueIds.has(task.id)))
      .map((group): NotificationItem => ({
        key: `overdue-${group.key}`,
        kind: "overdue",
        title: `${group.supervisorName} está com ${group.tasks.length} ${group.tasks.length === 1 ? "atividade atrasada" : "atividades atrasadas"}`,
        description: "",
        group,
      })),
    ...persistent,
  ];
}
