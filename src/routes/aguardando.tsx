import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/aguardando")({
  head: () => ({
    meta: [
      { title: "Acesso em análise | Rotina de Supervisores" },
      {
        name: "description",
        content: "Sua solicitação de acesso à rotina de supervisão está aguardando aprovação.",
      },
      { property: "og:title", content: "Acesso em análise | Rotina de Supervisores" },
      { property: "og:description", content: "Aguardando aprovação de um administrador." },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const { profile, isAdmin, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (profile?.status === "active") {
      void navigate({ to: isAdmin ? "/admin" : "/painel", replace: true });
    }
  }, [loading, profile, isAdmin, navigate]);

  const rejected = profile?.status === "rejected" || profile?.status === "inactive";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning-foreground">
          <Clock3 className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold">
          {rejected ? "Acesso não liberado" : "Cadastro em análise"}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {rejected
            ? "Seu acesso está bloqueado no momento. Fale com o administrador da operação."
            : "Um administrador precisa aprovar seu acesso antes de você visualizar a rotina do setor."}
        </p>

        {profile && (
          <dl className="mt-6 grid gap-2 rounded-xl bg-secondary p-4 text-left text-[11px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-semibold">{profile.full_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="font-semibold">{STATUS_LABELS[profile.status]}</dd>
            </div>
          </dl>
        )}

        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="size-4" /> Verificar novamente
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              void navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
