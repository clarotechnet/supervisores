import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ConversationPanel } from "@/components/ConversationPanel";
import { supabase } from "@/integrations/supabase/client";
import type { ConversationManagerSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fetchConversationManagers } from "@/services/conversations";

export function SupervisorConversationInbox({ supervisorId }: { supervisorId: string }) {
  const [managers, setManagers] = useState<ConversationManagerSummary[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadManagers = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const items = await fetchConversationManagers();
      setManagers(items);
      setSelectedManagerId((current) =>
        current && items.some((manager) => manager.manager_id === current)
          ? current
          : (items[0]?.manager_id ?? null),
      );
    } catch (error) {
      console.error("Não foi possível carregar as conversas do supervisor.", error);
      toast.error("Não foi possível carregar suas conversas.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManagers(true);

    const channel = supabase
      .channel(`supervisor-conversation-list-${supervisorId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `supervisor_id=eq.${supervisorId}`,
        },
        () => void loadManagers(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadManagers, supervisorId]);

  const selectedManager = useMemo(
    () => managers.find((manager) => manager.manager_id === selectedManagerId) ?? null,
    [managers, selectedManagerId],
  );
  const handleConversationChange = useCallback(() => {
    void loadManagers();
  }, [loadManagers]);

  if (loading) {
    return (
      <div className="grid min-h-48 place-items-center rounded-2xl border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (managers.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-7 text-center shadow-card">
        <MessageCircle className="mx-auto size-8 text-muted-foreground/60" />
        <h2 className="mt-3 text-sm font-black">Nenhuma conversa iniciada</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando um gestor enviar uma mensagem, a conversa aparecerá aqui separadamente.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-border bg-card p-3 shadow-card">
        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Gestores
        </p>
        <div className="grid gap-1.5">
          {managers.map((manager) => {
            const selected = manager.manager_id === selectedManagerId;
            return (
              <button
                key={manager.manager_id}
                type="button"
                onClick={() => setSelectedManagerId(manager.manager_id)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 hover:bg-secondary",
                )}
              >
                <span className="min-w-0 truncate text-xs font-bold">{manager.manager_name}</span>
                {manager.unread_count > 0 && (
                  <span
                    className={cn(
                      "grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[9px] font-black",
                      selected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {manager.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {selectedManager && (
        <ConversationPanel
          key={selectedManager.manager_id}
          supervisorId={supervisorId}
          managerId={selectedManager.manager_id}
          title={`Conversa com ${selectedManager.manager_name}`}
          onChange={handleConversationChange}
        />
      )}
    </div>
  );
}
