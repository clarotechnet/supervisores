import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil | Rotina de Supervisores" },
      {
        name: "description",
        content: "Atualize seu nome de exibição e a senha de acesso à rotina de supervisão.",
      },
      { property: "og:title", content: "Meu perfil | Rotina de Supervisores" },
      { property: "og:description", content: "Dados da conta e alteração de senha." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { profile, sector, user, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar o nome.");
      return;
    }
    await refresh();
    toast.success("Perfil atualizado.");
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível alterar a senha.");
      return;
    }
    setPassword("");
    toast.success("Senha alterada.");
  }

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5">
        <h1 className="text-2xl font-black">Meu perfil</h1>
        <p className="mt-1 text-xs text-muted-foreground">Dados da conta e segurança.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-bold">Dados</h2>
          <dl className="mt-4 grid gap-2 text-[11px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="font-semibold">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Setor</dt>
              <dd className="font-semibold">{sector?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Perfil</dt>
              <dd className="font-semibold">
                {profile?.role === "admin" ? "Administrador" : "Supervisor"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="font-semibold">{profile ? STATUS_LABELS[profile.status] : "—"}</dd>
            </div>
          </dl>

          <form onSubmit={saveName} className="mt-6 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nome de exibição</Label>
              <Input
                id="name"
                value={fullName}
                maxLength={120}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="justify-self-start">
              Salvar nome
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-bold">Alterar senha</h2>
          <form onSubmit={savePassword} className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
            <Button type="submit" disabled={busy} className="justify-self-start">
              Alterar senha
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
