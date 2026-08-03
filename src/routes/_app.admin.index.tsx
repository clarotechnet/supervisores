import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfiles, fetchRecordsRange, fetchSectors } from "@/services/admin";
import { formatLongDate, todayKey } from "@/lib/date-utils";
import { splitRecords } from "@/components/TaskBoard";
import { STATUS_LABELS, type Profile, type Sector, type TaskRecord } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/admin/")({
  head: () => ({
    meta: [
      { title: "Visão geral | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real a execução da rotina de todos os setores e supervisores do dia.",
      },
      { property: "og:title", content: "Visão geral | Rotina de Supervisores" },
      { property: "og:description", content: "Execução da rotina por setor e supervisor." },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminOverview />
    </AdminGate>
  ),
});

function AdminOverview() {
  const { sector } = useAuth();
  const [dateKey, setDateKey] = useState(todayKey());
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supervisorFilter, setSupervisorFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, profs, secs] = await Promise.all([
        fetchRecordsRange(dateKey, dateKey),
        fetchProfiles(),
        fetchSectors(),
      ]);
      setRecords(recs);
      setProfiles(profs);
      setSectors(secs);
    } catch {
      toast.error("Não foi possível carregar a visão geral.");
    } finally {
      setLoading(false);
    }
  }, [dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_task_records" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredProfiles = useMemo(() => {
    const query = supervisorFilter.trim().toLocaleLowerCase("pt-BR");
    return profiles.filter(
      (profile) =>
        (sectorFilter === "all" || profile.sector_id === sectorFilter) &&
        (!query || profile.full_name.toLocaleLowerCase("pt-BR").includes(query)),
    );
  }, [profiles, sectorFilter, supervisorFilter]);

  const filteredRecords = useMemo(() => {
    const visibleIds = new Set(filteredProfiles.map((profile) => profile.id));
    return records.filter((record) => {
      if (sectorFilter !== "all" && record.sector_id !== sectorFilter) return false;
      if (supervisorFilter.trim() && (!record.user_id || !visibleIds.has(record.user_id))) {
        return false;
      }
      if (statusFilter === "completed") return record.status === "completed";
      if (statusFilter === "late") return splitRecords([record]).late.length === 1;
      if (statusFilter === "pending") return splitRecords([record]).pending.length === 1;
      return true;
    });
  }, [records, filteredProfiles, sectorFilter, statusFilter, supervisorFilter]);

  const totals = useMemo(() => splitRecords(filteredRecords), [filteredRecords]);

  const bySector = useMemo(() => {
    return sectors
      .filter((sec) => sectorFilter === "all" || sec.id === sectorFilter)
      .map((sec) => {
        const secRecords = filteredRecords.filter((r) => r.sector_id === sec.id);
        const cols = splitRecords(secRecords);
        const supervisors = filteredProfiles
          .filter((p) => p.sector_id === sec.id && p.status === "active")
          .map((p) => {
            const own = secRecords.filter((r) => r.user_id === p.id);
            const ownCols = splitRecords(own);
            return {
              profile: p,
              total: own.length,
              done: ownCols.done.length,
              late: ownCols.late.length,
            };
          });
        return {
          sector: sec,
          total: secRecords.length,
          done: cols.done.length,
          late: cols.late.length,
          supervisors,
        };
      });
  }, [sectors, filteredRecords, filteredProfiles, sectorFilter]);

  const sectorName = useMemo(() => {
    const map = new Map(sectors.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Sem setor") : "Sem setor");
  }, [sectors]);

  const everyone = useMemo(() => {
    return filteredProfiles
      .map((p) => {
        const own = filteredRecords.filter((r) => r.user_id === p.id);
        const cols = splitRecords(own);
        return {
          profile: p,
          total: own.length,
          done: cols.done.length,
          late: cols.late.length,
          pending: cols.pending.length,
          updatedAt:
            own
              .map((record) => record.updated_at)
              .sort()
              .at(-1) ?? null,
        };
      })
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
  }, [filteredProfiles, filteredRecords]);

  const pct = filteredRecords.length
    ? Math.round((totals.done.length / filteredRecords.length) * 100)
    : 0;
  const activeSupervisors = filteredProfiles.filter(
    (profile) => profile.role === "supervisor" && profile.status === "active",
  );
  const notStarted = activeSupervisors.filter(
    (profile) => !filteredRecords.some((record) => record.user_id === profile.id),
  ).length;
  const sectorsNotStarted = bySector.filter((item) => item.total === 0).length;

  return (
    <AppShell areaColor={sector?.color} progress={pct} progressLabel="Conclusão geral do dia">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Visão geral</h1>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{formatLongDate(dateKey)}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">Data</Label>
          <Input
            id="date"
            type="date"
            value={dateKey}
            max={todayKey()}
            onChange={(e) => e.target.value && setDateKey(e.target.value)}
            className="w-44"
          />
        </div>
      </header>

      <section className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Setor</Label>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {sectors.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="supervisor-filter">Supervisor</Label>
          <Input
            id="supervisor-filter"
            value={supervisorFilter}
            onChange={(event) => setSupervisorFilter(event.target.value)}
            placeholder="Buscar por nome"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Status da atividade</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="completed">Concluídas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="late">Atrasadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Supervisores ativos" value={activeSupervisors.length} />
        <Kpi label="Atividades previstas" value={filteredRecords.length} />
        <Kpi label="Concluídas" value={totals.done.length} />
        <Kpi label="Pendentes" value={totals.pending.length} />
        <Kpi label="Em atraso" value={totals.late.length} />
        <Kpi label="Percentual geral" value={pct} suffix="%" />
        <Kpi label="Setores sem início" value={sectorsNotStarted} />
        <Kpi label="Sem atualização hoje" value={notStarted} />
      </div>

      {loading ? (
        <div className="grid min-h-[220px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {bySector.map(({ sector: sec, total, done, late, supervisors }) => (
            <section
              key={sec.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-card"
              style={{ ["--area" as string]: sec.color }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                    {sec.code}
                  </span>
                  <h2 className="text-sm font-bold">{sec.name}</h2>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-black">
                  {total ? Math.round((done / total) * 100) : 0}%
                </span>
              </div>
              <div className="my-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                <i
                  className="block h-full rounded-full bg-area"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {done}/{total} concluídas · {late} em atraso
              </p>

              <ul className="mt-3 grid gap-1.5">
                {supervisors.length === 0 ? (
                  <li className="text-[10px] text-muted-foreground">
                    Nenhum supervisor ativo neste setor.
                  </li>
                ) : (
                  supervisors.map((s) => (
                    <li
                      key={s.profile.id}
                      className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-[10px]"
                    >
                      <Link
                        to="/admin/supervisor/$profileId"
                        params={{ profileId: s.profile.id }}
                        className="truncate font-semibold hover:text-primary"
                      >
                        {s.profile.full_name}
                      </Link>
                      <span className="text-muted-foreground">
                        {s.done}/{s.total}
                        {s.late > 0 && (
                          <b className="ml-2 text-late-foreground">{s.late} atrasadas</b>
                        )}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Todos os supervisores</h2>
            <p className="text-[10px] text-muted-foreground">
              Todos os cadastros do sistema, de todos os setores, com a execução do dia.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-black">
            {everyone.length} cadastros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2">Nome</th>
                <th className="py-2">Setor</th>
                <th className="py-2">Papel</th>
                <th className="py-2">Situação</th>
                <th className="py-2">Pendentes</th>
                <th className="py-2">Atualização</th>
                <th className="py-2 text-right">Dia</th>
              </tr>
            </thead>
            <tbody>
              {everyone.map(({ profile: p, total, done, late, pending, updatedAt }) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold">
                    <Link
                      to="/admin/supervisor/$profileId"
                      params={{ profileId: p.id }}
                      className="hover:text-primary"
                    >
                      {p.full_name || "Sem nome"}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{sectorName(p.sector_id)}</td>
                  <td className="py-2 pr-3">
                    {p.role === "admin" ? "Administrador" : "Supervisor"}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{STATUS_LABELS[p.status]}</td>
                  <td className="py-2 pr-3">{pending}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {updatedAt
                      ? new Date(updatedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Não iniciou"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {done}/{total}
                    {late > 0 && <b className="ml-2 text-late-foreground">{late} atrasadas</b>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Kpi({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl font-black">
        {value}
        {suffix}
      </strong>
    </div>
  );
}
