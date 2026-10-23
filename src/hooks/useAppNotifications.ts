import { createContext, useContext } from "react";
import type { NotificationItem } from "@/lib/notification-center";

interface NotificationCenterValue {
  items: NotificationItem[];
  busyKey: string | null;
  error: string;
  openItem: (item: NotificationItem) => Promise<boolean>;
  dismissItem: (item: NotificationItem) => Promise<boolean>;
}
export const AppNotificationsContext = createContext<NotificationCenterValue | null>(null);

export function useAppNotifications() {
  const context = useContext(AppNotificationsContext);
  if (!context) throw Error("Notificações precisam estar dentro de AppNotifications.");
  return context;
}
