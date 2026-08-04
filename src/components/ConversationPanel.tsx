import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { localTime } from "@/lib/date-utils";
import type { ConversationMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  fetchConversation,
  markConversationRead,
  sendConversationMessage,
} from "@/services/conversations";

export function ConversationPanel({
  supervisorId,
  title,
}: {
  supervisorId: string;
  title: string;
}) {
  const { profile } = useAuth();
  const currentUserId = profile?.id;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const appendOrUpdate = useCallback((message: ConversationMessage) => {
    setMessages((current) => {
      const exists = current.some((item) => item.id === message.id);
      const next = exists
        ? current.map((item) => (item.id === message.id ? message : item))
        : [...current, message];
      return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    setLoading(true);

    void fetchConversation(supervisorId)
      .then((items) => {
        if (!active) return;
        setMessages(items);
        return markConversationRead(supervisorId, currentUserId);
      })
      .catch(() => toast.error("Não foi possível carregar a conversa."))
      .finally(() => active && setLoading(false));

    const channel = supabase
      .channel(`conversation-${supervisorId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
          filter: `supervisor_id=eq.${supervisorId}`,
        },
        (payload) => {
          const message = payload.new as unknown as ConversationMessage;
          if (!message.id) return;
          appendOrUpdate(message);
          if (message.sender_id !== currentUserId && !message.read_at) {
            void markConversationRead(supervisorId, currentUserId);
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [appendOrUpdate, currentUserId, supervisorId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function sendMessage() {
    const text = body.trim();
    if (!text || !profile) return;
    setSending(true);
    try {
      const message = await sendConversationMessage({
        supervisorId,
        senderId: profile.id,
        senderRole: profile.role,
        body: text,
      });
      appendOrUpdate(message);
      setBody("");
    } catch {
      toast.error("Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-black">{title}</h2>
          <p className="text-[10px] text-muted-foreground">
            Histórico salvo e atualizado em tempo real
          </p>
        </div>
      </header>

      <div className="grid max-h-[360px] min-h-48 content-start gap-2 overflow-y-auto bg-secondary/35 p-4">
        {loading ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid min-h-40 place-content-center text-center">
            <MessageCircle className="mx-auto size-7 text-muted-foreground/50" />
            <p className="mt-2 text-xs font-bold">Nenhuma mensagem ainda</p>
            <p className="text-[10px] text-muted-foreground">Envie a primeira mensagem.</p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <article
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm",
                  mine
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "mr-auto rounded-bl-md border border-border bg-card text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {message.body}
                </p>
                <div
                  className={cn(
                    "mt-1 flex items-center justify-end gap-1 text-[8px]",
                    mine ? "text-primary-foreground/65" : "text-muted-foreground",
                  )}
                >
                  <time>{localTime(message.created_at)}</time>
                  {mine && <span>{message.read_at ? "· Lida" : "· Enviada"}</span>}
                </div>
              </article>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-4">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          maxLength={2000}
          placeholder="Digite uma mensagem..."
          className="min-h-20 resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[9px] text-muted-foreground">
            Enter envia · Shift + Enter quebra linha
          </span>
          <Button onClick={sendMessage} disabled={sending || !body.trim()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar
          </Button>
        </div>
      </div>
    </section>
  );
}
