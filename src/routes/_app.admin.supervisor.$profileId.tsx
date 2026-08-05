import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { AppShell } from "@/components/AppShell";
import { ConversationPanel } from "@/components/ConversationPanel";
import { TaskBoard, splitRecords } from "@/components/TaskBoard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatLongDate, localTime, todayKey } from "@/lib/date-utils";
import type { AuditLog, Profile, Sector, TaskRecord } from "@/lib/types";

export const Route = createFileRoute("/_app/admin/supervisor/$profileId")({
  component: () => (
    <AdminGate>
      <SupervisorDetail />
    </AdminGate>
  ),
});

function SupervisorDetail() {
  const { profileId } = Route.useParams();
  const { profile: currentUserProfile } = useAuth();
  const [dateKey, setDateKey] = useState(todayKey());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sector, setSector] = useState<Sector | null>(null);
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, recordsResult, auditResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", profileId).single(),
        supabase
          .from("daily_task_records")
          .select("*")
          .eq("user_id", profileId)
          .eq("scheduled_date", dateKey)
          .order("display_order", { ascending: true })
          .order("scheduled_time", { ascending: true }),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (recordsResult.error) throw recordsResult.error;
      if (auditResult.error) throw auditResult.error;
      const loadedProfile = profileResult.data as Profile;
      setProfile(loadedProfile);
      setRecords((recordsResult.data ?? []) as TaskRecord[]);
      setAudit((auditResult.data ?? []) as AuditLog[]);
      if (loadedProfile.sector_id) {
        const { data } = await supabase
          .from("sectors")
          .select("*")
          .eq("id", loadedProfile.sector_id)
          .maybeSingle();
        setSector((data as Sector | null) ?? null);
      }
    } catch {
      toast.error("Não foi possível carregar o detalhamento.");
    } finally {
      setLoading(false);
    }
  }, [dateKey, profileId]);

  useEffect(() => void load(), [load]);

  const columns = useMemo(() => splitRecords(records), [records]);
  const progress = records.length ? Math.round((columns.done.length / records.length) * 100) : 0;

  return (
    <AppShell
      areaColor={sector?.color}
      progress={progress}
      progressLabel={`${columns.done.length} de ${records.length} concluídas`}
    >
      <Link
        to="/admin"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar à visão geral
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {sector?.name ?? "Sem setor"}
          </span>
          <h1 className="text-2xl font-black">{profile?.full_name ?? "Supervisor"}</h1>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{formatLongDate(dateKey)}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="detail-date">Data</Label>
          <Input
            id="detail-date"
            type="date"
            max={todayKey()}
            value={dateKey}
            onChange={(event) => event.target.value && setDateKey(event.target.value)}
          />
        </div>
      </header>

      {profile && profile.role === "supervisor" && currentUserProfile && (
        <div className="mb-5">
          <ConversationPanel
            supervisorId={profile.id}
            managerId={currentUserProfile.id}
            title={`Conversa com ${profile.full_name}`}
          />
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Total" value={records.length} />
        <Stat label="Concluídas" value={columns.done.length} />
        <Stat label="Pendentes" value={columns.pending.length} />
        <Stat label="Atrasadas" value={columns.late.length} />
      </div>

      {loading ? (
        <div className="grid min-h-52 place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <TaskBoard records={records} view="list" readOnly />
      )}

      <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-sm font-bold">Histórico de alterações</h2>
        <div className="mt-3 grid gap-2">
          {audit.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            audit.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-[10px]"
              >
                <span>{actionLabel(entry.action)}</span>
                <time className="text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString("pt-BR")} às{" "}
                  {localTime(entry.created_at)}
                </time>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl font-black">{value}</strong>
    </div>
  );
}

function actionLabel(action: string) {
  if (action === "complete_task") return "Atividade concluída";
  if (action === "reopen_task") return "Atividade reaberta";
  if (action === "note_task") return "Observação atualizada";
  return action.replaceAll("_", " ");
}
