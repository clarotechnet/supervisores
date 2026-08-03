import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchProfiles,
  fetchSectors,
  deleteUserAccount,
  updateProfileRole,
  updateProfileSector,
  updateProfileStatus,
} from "@/services/admin";
import {
  STATUS_LABELS,
  type Profile,
  type Sector,
  type UserRole,
  type UserStatus,
} from "@/lib/types";
import { formatShortDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Supervisores | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Aprove, bloqueie e organize os supervisores por setor, controlando quem acessa a rotina diária.",
      },
      { property: "og:title", content: "Supervisores | Rotina de Supervisores" },
      { property: "og:description", content: "Gestão de acessos e setores dos supervisores." },
    ],
  }),
  component: () => (
    <AdminGate>
      <UsuariosPage />
    </AdminGate>
  ),
});

const STATUS_STYLE: Record<UserStatus, string> = {
  pending: "bg-warning-soft text-warning-foreground",
  active: "bg-success-soft text-success-foreground",
  rejected: "bg-late-soft text-late-foreground",
  inactive: "bg-secondary text-muted-foreground",
};

function UsuariosPage() {
  const { profile: me, sector } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UserStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profs, secs] = await Promise.all([fetchProfiles(), fetchSectors()]);
      setProfiles(profs);
      setSectors(secs);
    } catch {
      toast.error("Não foi possível carregar os supervisores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(target: Profile, status: UserStatus) {
    if (!me) return;
    try {
      await updateProfileStatus(target.id, status, me.id);
      toast.success(`Acesso de ${target.full_name} atualizado.`);
      await load();
    } catch {
      toast.error("Não foi possível atualizar o acesso.");
    }
  }

  async function changeSector(target: Profile, sectorId: string) {
    if (!me) return;
    try {
      await updateProfileSector(target.id, sectorId, me.id);
      toast.success("Setor atualizado.");
      await load();
    } catch {
      toast.error("Não foi possível atualizar o setor.");
    }
  }

  async function changeRole(target: Profile, role: UserRole) {
    if (!me) return;
    if (target.id === me.id) {
      toast.error("Você não pode alterar o seu próprio papel.");
      return;
    }
    try {
      await updateProfileRole(target.id, role, me.id);
      toast.success(role === "admin" ? "Agora é administrador." : "Agora é supervisor.");
      await load();
    } catch {
      toast.error("Não foi possível atualizar o papel.");
    }
  }

  async function removeUser(target: Profile) {
    if (target.id === me?.id) {
      toast.error("Você não pode excluir a própria conta.");
      return;
    }
    if (!window.confirm(`Excluir definitivamente o usuário ${target.full_name}?`)) return;
    try {
      await deleteUserAccount(target.id);
      toast.success("Usuário excluído.");
      await load();
    } catch {
      toast.error("Não foi possível excluir o usuário. Verifique a Edge Function.");
    }
  }

  const visible = profiles.filter((p) => filter === "all" || p.status === filter);

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5">
        <h1 className="text-2xl font-black">Supervisores</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Aprove solicitações, ajuste setores e controle o acesso ao sistema.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "pending", "active", "rejected", "inactive"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold transition-colors",
              filter === key ? "bg-navy text-white" : "bg-card text-muted-foreground",
            )}
          >
            {key === "all" ? "Todos" : STATUS_LABELS[key]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid min-h-[200px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
          Nenhum usuário nesta situação.
        </p>
      ) : (
        <div className="grid gap-2">
          {visible.map((p) => (
            <article
              key={p.id}
              className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-card md:grid-cols-[minmax(0,1fr)_180px_150px_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-sm">{p.full_name}</b>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-black uppercase",
                      STATUS_STYLE[p.status],
                    )}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                  {p.role === "admin" && (
                    <span className="rounded-full bg-navy px-2 py-0.5 text-[9px] font-black uppercase text-white">
                      Admin
                    </span>
                  )}
                </div>
                <small className="mt-1 block text-[10px] text-muted-foreground">
                  {p.email ?? "E-mail não informado"} · Cadastrado em{" "}
                  {formatShortDate(p.created_at.slice(0, 10))}
                </small>
              </div>

              <Select
                value={p.sector_id ?? ""}
                onValueChange={(value) => void changeSector(p, value)}
              >
                <SelectTrigger className="h-9 text-[11px]">
                  <SelectValue placeholder="Sem setor" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={p.role}
                disabled={p.id === me?.id}
                onValueChange={(value) => void changeRole(p, value as UserRole)}
              >
                <SelectTrigger className="h-9 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex flex-wrap gap-2">
                {p.status !== "active" && (
                  <Button size="sm" onClick={() => void changeStatus(p, "active")}>
                    <Check className="size-3.5" /> Aprovar
                  </Button>
                )}
                {p.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void changeStatus(p, "rejected")}
                  >
                    <X className="size-3.5" /> Recusar
                  </Button>
                )}
                {p.status === "active" && p.id !== me?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void changeStatus(p, "inactive")}
                  >
                    Bloquear
                  </Button>
                )}
                {p.id !== me?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void removeUser(p)}
                  >
                    <Trash2 className="size-3.5" /> Excluir
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
