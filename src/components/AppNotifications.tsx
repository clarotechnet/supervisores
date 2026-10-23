import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { AppNotificationsContext } from "@/hooks/useAppNotifications";
import { supabase } from "@/integrations/supabase/client";
import {
  applyCurrentSupervisorNames,
  notificationTaskTitle,
  type OverdueTask,
} from "@/lib/assignment-notification";
import { nowTime, todayKey } from "@/lib/date-utils";
import type { AppNotification, ConversationMessage } from "@/lib/types";
import {
  isIncomingMessage,
  notificationCenterItems,
  updateUnreadItem,
  type NotificationItem,
} from "@/lib/notification-center";

const OVERDUE_CHECK_INTERVAL = 60_000;

async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

async function markMessageRead(messageId: string) {
  const { error } = await supabase
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

export function AppNotifications({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  // Discard private alerts and dismissed IDs immediately when the account changes.
  return (
    <NotificationSession key={`${profile?.id}:${profile?.role}:${profile?.status}`}>
      {children}
    </NotificationSession>
  );
}

function NotificationSession({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [openedMention, setOpenedMention] = useState<AppNotification | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([]);
  const [dismissedOverdueIds, setDismissedOverdueIds] = useState(new Set<string>());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadErrors, setLoadErrors] = useState({ notifications: "", messages: "", overdue: "" });
  const handledNotificationIds = useRef(new Set<string>());
  const handledMessageIds = useRef(new Set<string>());
  const busy = useRef(false);
  const mounted = useRef(true);
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const profileStatus = profile?.status;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const items = useMemo(
    () =>
      notificationCenterItems(
        notifications,
        messages,
        overdueTasks,
        dismissedOverdueIds,
        profileRole ?? "supervisor",
      ),
    [notifications, messages, overdueTasks, dismissedOverdueIds, profileRole],
  );

  async function handleItem(item: NotificationItem, open = false): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setBusyKey(item.key);
    setError("");
    try {
      if (item.kind === "task" || item.kind === "mention") {
        await markNotificationRead(item.notification.id);
        if (!mounted.current) return false;
        handledNotificationIds.current.add(item.notification.id);
        setNotifications((current) => current.filter((row) => row.id !== item.notification.id));
      } else if (item.kind === "message") {
        await markMessageRead(item.message.id);
        if (!mounted.current) return false;
        handledMessageIds.current.add(item.message.id);
        setMessages((current) => current.filter((row) => row.id !== item.message.id));
      } else {
        setDismissedOverdueIds(
          (current) => new Set([...current, ...item.group.tasks.map((task) => task.id)]),
        );
      }
      if (open) {
        if (item.kind === "mention") setOpenedMention(item.notification);
        else if (item.kind === "task") void navigate({ to: "/tarefas" });
        else if (item.kind === "message") {
          if (profileRole === "supervisor") void navigate({ to: "/mensagens" });
          else
            void navigate({
              to: "/admin/supervisor/$profileId",
              params: { profileId: item.message.supervisor_id },
            });
        } else if (item.group.supervisorId) {
          void navigate({
            to: "/admin/supervisor/$profileId",
            params: { profileId: item.group.supervisorId },
          });
        }
      }
      return true;
    } catch {
      if (mounted.current) setError("Não foi possível marcar o aviso como lido. Tente novamente.");
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setBusyKey(null);
    }
  }

  useEffect(() => {
    if (!profileId || profileRole !== "supervisor" || profileStatus !== "active") return;

    let active = true;

    const deliver = (notification: AppNotification) => {
      if (
        !active ||
        notification.recipient_id !== profileId ||
        !["task_assigned", "task_note_mention"].includes(notification.type)
      ) {
        return;
      }

      if (notification.read_at) {
        handledNotificationIds.current.add(notification.id);
        setNotifications((current) => current.filter((row) => row.id !== notification.id));
        return;
      }
      if (!handledNotificationIds.current.has(notification.id))
        setNotifications((current) => updateUnreadItem(current, notification));
    };

    const channel = supabase
      .channel(`user-notifications-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${profileId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old["id"];
            if (active && typeof id === "string") {
              handledNotificationIds.current.add(id);
              setNotifications((current) => current.filter((row) => row.id !== id));
            }
          } else deliver(payload.new as unknown as AppNotification);
        },
      )
      .subscribe();

    void supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", profileId)
      .is("read_at", null)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Não foi possível carregar as notificações.", error);
          setLoadErrors((current) => ({
            ...current,
            notifications:
              "Não foi possível carregar todos os avisos. Atualize a página para tentar novamente.",
          }));
          return;
        }
        setLoadErrors((current) => ({ ...current, notifications: "" }));
        for (const notification of data ?? []) {
          deliver(notification as unknown as AppNotification);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [profileId, profileRole, profileStatus]);

  useEffect(() => {
    if (!profileId || !profileRole || profileRole === "controller" || profileStatus !== "active")
      return;

    let active = true;
    const deliver = (message: ConversationMessage) => {
      if (!active || !isIncomingMessage(message, profileId, profileRole)) return;
      if (message.read_at) {
        handledMessageIds.current.add(message.id);
        setMessages((current) => current.filter((row) => row.id !== message.id));
        return;
      }
      if (!handledMessageIds.current.has(message.id))
        setMessages((current) => updateUnreadItem(current, message));
    };

    const channel = supabase
      .channel(`conversation-notifications-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
          ...(profileRole === "supervisor" ? { filter: `supervisor_id=eq.${profileId}` } : {}),
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old["id"];
            if (active && typeof id === "string") {
              handledMessageIds.current.add(id);
              setMessages((current) => current.filter((row) => row.id !== id));
            }
          } else deliver(payload.new as unknown as ConversationMessage);
        },
      )
      .subscribe();

    let unreadQuery = supabase
      .from("conversation_messages")
      .select("*")
      .is("read_at", null)
      .neq("sender_id", profileId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (profileRole === "supervisor") unreadQuery = unreadQuery.eq("supervisor_id", profileId);
    else unreadQuery = unreadQuery.eq("sender_role", "supervisor");

    void unreadQuery.then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Não foi possível carregar mensagens não lidas.", error);
        setLoadErrors((current) => ({
          ...current,
          messages:
            "Não foi possível carregar todas as mensagens. Atualize a página para tentar novamente.",
        }));
        return;
      }
      setLoadErrors((current) => ({ ...current, messages: "" }));
      for (const message of data ?? []) deliver(message as ConversationMessage);
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [profileId, profileRole, profileStatus]);

  useEffect(() => {
    if (!profileId || profileRole !== "admin" || profileStatus !== "active") return;

    let active = true;
    let checking = false;
    let checkAgain = false;
    let supervisorNames = new Map<string, string>();
    let supervisorNamesLoadedAt = 0;

    const checkOverdueTasks = async () => {
      if (!active) return;
      if (checking) {
        checkAgain = true;
        return;
      }
      checking = true;

      try {
        if (Date.now() - supervisorNamesLoadedAt > 5 * 60_000) {
          const { data: supervisors, error: supervisorsError } = await supabase
            .from("profiles")
            .select("id,full_name")
            .eq("role", "supervisor")
            .eq("status", "active");
          if (supervisorsError) throw supervisorsError;
          supervisorNames = new Map(
            (supervisors ?? []).map((item) => [item.id, item.full_name] as const),
          );
          supervisorNamesLoadedAt = Date.now();
        }
        if (!active) return;

        const { data, error } = await supabase
          .from("daily_task_records")
          .select("id,user_id,supervisor_name,title,scheduled_time")
          .eq("scheduled_date", todayKey())
          .neq("status", "completed")
          .lt("scheduled_time", nowTime())
          .order("scheduled_time", { ascending: true });
        if (error) throw error;
        if (!active) return;
        setLoadErrors((current) => ({ ...current, overdue: "" }));

        const currentOverdueTasks = applyCurrentSupervisorNames(
          (data ?? []) as OverdueTask[],
          supervisorNames,
        );
        setOverdueTasks(currentOverdueTasks);
        const currentIds = new Set(currentOverdueTasks.map((task) => task.id));
        setDismissedOverdueIds(
          (current) => new Set([...current].filter((id) => currentIds.has(id))),
        );
      } catch (error) {
        console.error("Não foi possível verificar as atividades atrasadas.", error);
        if (active)
          setLoadErrors((current) => ({
            ...current,
            overdue:
              "Não foi possível conferir as atividades atrasadas. Uma nova tentativa será feita automaticamente.",
          }));
      } finally {
        checking = false;
        if (active && checkAgain) {
          checkAgain = false;
          void checkOverdueTasks();
        }
      }
    };

    const channel = supabase
      .channel(`manager-overdue-notifications-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_task_records" },
        () => void checkOverdueTasks(),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        supervisorNamesLoadedAt = 0;
        void checkOverdueTasks();
      })
      .subscribe();
    const intervalId = window.setInterval(() => void checkOverdueTasks(), OVERDUE_CHECK_INTERVAL);
    const handleVisibilityChange = () => {
      if (!document.hidden) void checkOverdueTasks();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void checkOverdueTasks();

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [profileId, profileRole, profileStatus]);

  return (
    <AppNotificationsContext.Provider
      value={{
        items,
        busyKey,
        error: [error, ...Object.values(loadErrors)].filter(Boolean).join(" "),
        openItem: (item) => handleItem(item, true),
        dismissItem: (item) => handleItem(item),
      }}
    >
      {children}
      <Dialog
        open={openedMention !== null}
        onOpenChange={(open) => !open && setOpenedMention(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observação marcada para você</DialogTitle>
            <DialogDescription>
              O gestor marcou você em uma observação da rotina dele.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1 rounded-xl border border-border bg-secondary/50 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Atividade
              </span>
              <p className="font-semibold text-foreground">
                {openedMention ? notificationTaskTitle(openedMention) : ""}
              </p>
            </div>

            <div className="grid gap-1 rounded-xl border border-border p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Observação
              </span>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {openedMention?.message}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpenedMention(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppNotificationsContext.Provider>
  );
}
