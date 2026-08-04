import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  applyCurrentSupervisorNames,
  formatAssignmentNotification,
  formatOverdueTask,
  groupOverdueTasks,
  type OverdueTask,
} from "@/lib/assignment-notification";
import { nowTime, todayKey } from "@/lib/date-utils";
import type { AppNotification, ConversationMessage } from "@/lib/types";

const OVERDUE_CHECK_INTERVAL = 60_000;

async function markNotificationRead(notificationId: string) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
}

async function markMessageRead(messageId: string) {
  await supabase
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId);
}

export function AppNotifications() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const deliveredNotificationIds = useRef(new Set<string>());
  const deliveredMessageIds = useRef(new Set<string>());
  const notifiedOverdueIds = useRef(new Set<string>());
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const profileStatus = profile?.status;

  useEffect(() => {
    if (!profileId || profileRole !== "supervisor" || profileStatus !== "active") return;

    let active = true;

    const deliver = (notification: AppNotification) => {
      if (
        !active ||
        notification.type !== "task_assigned" ||
        deliveredNotificationIds.current.has(notification.id)
      ) {
        return;
      }

      deliveredNotificationIds.current.add(notification.id);
      const toastId = `assignment-${notification.id}`;
      const markRead = () => void markNotificationRead(notification.id);

      toast.info(notification.title, {
        id: toastId,
        description: formatAssignmentNotification(notification),
        duration: Infinity,
        closeButton: true,
        onDismiss: markRead,
        action: {
          label: "Ver tarefas",
          onClick: () => {
            markRead();
            toast.dismiss(toastId);
            void navigate({ to: "/tarefas" });
          },
        },
      });
    };

    const channel = supabase
      .channel(`user-notifications-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${profileId}`,
        },
        (payload) => deliver(payload.new as unknown as AppNotification),
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
        if (error) {
          console.error("Não foi possível carregar as notificações.", error);
          return;
        }
        for (const notification of data ?? []) {
          deliver(notification as unknown as AppNotification);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [navigate, profileId, profileRole, profileStatus]);

  useEffect(() => {
    if (!profileId || !profileRole || profileStatus !== "active") return;

    let active = true;
    const deliver = (message: ConversationMessage) => {
      const isIncoming =
        message.sender_id !== profileId &&
        ((profileRole === "supervisor" && message.sender_role === "admin") ||
          (profileRole === "admin" && message.sender_role === "supervisor"));
      if (!active || !isIncoming || deliveredMessageIds.current.has(message.id)) return;

      deliveredMessageIds.current.add(message.id);
      const toastId = `conversation-message-${message.id}`;
      const markRead = () => void markMessageRead(message.id);
      toast.info(
        profileRole === "supervisor" ? "Nova mensagem da gestão" : "Nova resposta de supervisor",
        {
          id: toastId,
          description:
            message.body.length > 160 ? `${message.body.slice(0, 157)}...` : message.body,
          duration: Infinity,
          closeButton: true,
          onDismiss: markRead,
          action: {
            label: "Abrir conversa",
            onClick: () => {
              markRead();
              toast.dismiss(toastId);
              if (profileRole === "supervisor") {
                void navigate({ to: "/mensagens" });
              } else {
                void navigate({
                  to: "/admin/supervisor/$profileId",
                  params: { profileId: message.supervisor_id },
                });
              }
            },
          },
        },
      );
    };

    const channel = supabase
      .channel(`conversation-notifications-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          ...(profileRole === "supervisor" ? { filter: `supervisor_id=eq.${profileId}` } : {}),
        },
        (payload) => deliver(payload.new as unknown as ConversationMessage),
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
      if (error) {
        console.error("Não foi possível carregar mensagens não lidas.", error);
        return;
      }
      for (const message of data ?? []) deliver(message as ConversationMessage);
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [navigate, profileId, profileRole, profileStatus]);

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

        const { data, error } = await supabase
          .from("daily_task_records")
          .select("id,user_id,supervisor_name,title,scheduled_time")
          .eq("scheduled_date", todayKey())
          .neq("status", "completed")
          .lt("scheduled_time", nowTime())
          .order("scheduled_time", { ascending: true });
        if (error) throw error;
        if (!active) return;

        const overdueTasks = applyCurrentSupervisorNames(
          (data ?? []) as OverdueTask[],
          supervisorNames,
        );
        const currentIds = new Set(overdueTasks.map((task) => task.id));
        for (const notifiedId of notifiedOverdueIds.current) {
          if (!currentIds.has(notifiedId)) notifiedOverdueIds.current.delete(notifiedId);
        }

        for (const group of groupOverdueTasks(overdueTasks)) {
          const hasNewOverdueTask = group.tasks.some(
            (task) => !notifiedOverdueIds.current.has(task.id),
          );
          if (!hasNewOverdueTask) continue;

          for (const task of group.tasks) notifiedOverdueIds.current.add(task.id);
          const count = group.tasks.length;
          const title = `${group.supervisorName} está com ${count} ${count === 1 ? "atividade atrasada" : "atividades atrasadas"}`;
          const description = (
            <div className="grid gap-1">
              {group.tasks.slice(0, 5).map((task) => (
                <span key={task.id} className="block">
                  {formatOverdueTask(task)}
                </span>
              ))}
              {count > 5 && <span className="font-bold">+ {count - 5} outras atividades</span>}
            </div>
          );

          toast.error(title, {
            id: `overdue-${group.key}`,
            description,
            duration: Infinity,
            closeButton: true,
            ...(group.supervisorId
              ? {
                  action: {
                    label: "Ver supervisor",
                    onClick: () =>
                      void navigate({
                        to: "/admin/supervisor/$profileId",
                        params: { profileId: group.supervisorId! },
                      }),
                  },
                }
              : {}),
          });
        }
      } catch (error) {
        console.error("Não foi possível verificar as atividades atrasadas.", error);
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
        notifiedOverdueIds.current.clear();
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
  }, [navigate, profileId, profileRole, profileStatus]);

  return null;
}
