import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SupervisorConversationInbox } from "@/components/SupervisorConversationInbox";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/mensagens")({
  head: () => ({
    meta: [
      { title: "Mensagens | Rotina de Supervisores" },
      { name: "description", content: "Conversa entre o supervisor e a gestão." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { profile, isAdmin } = useAuth();

  if (isAdmin) {
    return (
      <AppShell>
        <section className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-7 text-center shadow-card">
          <MessageCircle className="mx-auto size-9 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-black">Conversas dos supervisores</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Abra um supervisor na visão geral para acessar o histórico e responder mensagens.
          </p>
          <Link
            to="/admin"
            className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Ir para visão geral
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!profile) return null;

  return (
    <AppShell>
      <header className="mb-5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Comunicação
        </span>
        <h1 className="text-2xl font-black">Mensagens</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Converse com a gestão e consulte todo o histórico.
        </p>
      </header>
      <SupervisorConversationInbox supervisorId={profile.id} />
    </AppShell>
  );
}
