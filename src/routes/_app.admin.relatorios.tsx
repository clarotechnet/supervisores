import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/hooks/useAuth";
import { fetchProfiles, fetchRecordsRange, fetchSectors } from "@/services/admin";
import { splitRecords } from "@/components/TaskBoard";
import { addDays, todayKey } from "@/lib/date-utils";
import { buildCsv, downloadCsv } from "@/lib/csv";
import type { Profile, Sector, TaskRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/admin/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Gere relatórios de aderência da rotina por período, setor e supervisor, com exportação em CSV.",
      },
      { property: "og:title", content: "Relatórios | Rotina de Supervisores" },
      { property: "og:description", content: "Aderência por período, setor e supervisor." },
    ],
  }),
  component: () => (
    <AdminGate>
      <RelatoriosPage />
    </AdminGate>
  ),
});

function RelatoriosPage() {
  const { sector } = useAuth();
  const [from, setFrom] = useState(addDays(todayKey(), -29));
  const [to, setTo] = useState(todayKey());
  const [sectorId, setSectorId] = useState("all");
  const [supervisorId, setSupervisorId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, profs, secs] = await Promise.all([
        fetchRecordsRange(from, to),
        fetchProfiles(),
        fetchSectors(),
      ]);
      setRecords(recs);
      setProfiles(profs);
      setSectors(secs);
    } catch {
      toast.error("Não foi possível gerar o relatório.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (sectorId !== "all" && record.sector_id !== sectorId) return false;
      if (supervisorId !== "all" && record.user_id !== supervisorId) return false;
      if (statusFilter === "completed") return record.status === "completed";
      if (statusFilter === "late") return splitRecords([record]).late.length === 1;
      if (statusFilter === "pending") return splitRecords([record]).pending.length === 1;
      return true;
    });
  }, [records, sectorId, statusFilter, supervisorId]);

  const rows = useMemo(() => {
    const map = new Map<string, { total: number; done: number; late: number }>();
    for (const record of filtered) {
      const userKey = record.user_id ?? `removido:${record.supervisor_name}`;
      const entry = map.get(userKey) ?? { total: 0, done: 0, late: 0 };
      entry.total += 1;
      if (record.status === "completed") entry.done += 1;
      map.set(userKey, entry);
    }
    for (const [userId, entry] of map) {
      entry.late = splitRecords(
        filtered.filter(
          (record) => (record.user_id ?? `removido:${record.supervisor_name}`) === userId,
        ),
      ).late.length;
    }
    return [...map.entries()]
      .map(([userId, entry]) => {
        const profile = profiles.find((p) => p.id === userId);
        const snapshot = filtered.find(
          (record) => (record.user_id ?? `removido:${record.supervisor_name}`) === userId,
        );
        const sec = sectors.find((s) => s.id === (profile?.sector_id ?? snapshot?.sector_id));
        return {
          userId,
          name: profile?.full_name ?? snapshot?.supervisor_name ?? "Usuário removido",
          sectorName: sec?.name ?? "—",
          ...entry,
          pct: entry.total ? Math.round((entry.done / entry.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [filtered, profiles, sectors]);

  function exportCsv() {
    if (filtered.length === 0) {
      toast.error("Nenhum registro no período.");
      return;
    }
    const csv = buildCsv(
      filtered.map((record) => {
        const profile = profiles.find((p) => p.id === record.user_id);
        const sec = sectors.find((s) => s.id === record.sector_id);
        return {
          record,
          sectorName: sec?.name ?? "",
          supervisorName: profile?.full_name ?? record.supervisor_name ?? "Usuário removido",
        };
      }),
    );
    downloadCsv(`relatorio_${from}_a_${to}.csv`, csv);
  }

  const totals = splitRecords(filtered);

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5">
        <h1 className="text-2xl font-black">Relatórios</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Aderência da rotina por período, setor e supervisor.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex w-full flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(todayKey());
              setTo(todayKey());
            }}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(addDays(todayKey(), -6));
              setTo(todayKey());
            }}
          >
            7 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(addDays(todayKey(), -29));
              setTo(todayKey());
            }}
          >
            30 dias
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input
            id="from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Supervisor</Label>
          <Select value={supervisorId} onValueChange={setSupervisorId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os supervisores</SelectItem>
              {profiles
                .filter((profile) => sectorId === "all" || profile.sector_id === sectorId)
                .map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Concluídas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="late">Atrasadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={to}
            max={todayKey()}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Setor</Label>
          <Select value={sectorId} onValueChange={setSectorId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportCsv} className="ml-auto">
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi label="Atividades no período" value={filtered.length} />
        <Kpi label="Concluídas" value={totals.done.length} />
        <Kpi
          label="Aderência"
          value={filtered.length ? Math.round((totals.done.length / filtered.length) * 100) : 0}
          suffix="%"
        />
      </div>

      {loading ? (
        <div className="grid min-h-[200px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
          Nenhum registro encontrado para os filtros selecionados.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Atividades</th>
                <th className="px-4 py-3">Concluídas</th>
                <th className="px-4 py-3">Atrasadas</th>
                <th className="px-4 py-3">Aderência</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.sectorName}</td>
                  <td className="px-4 py-3">{row.total}</td>
                  <td className="px-4 py-3">{row.done}</td>
                  <td className="px-4 py-3 text-late-foreground">{row.late}</td>
                  <td className="px-4 py-3 font-black">{row.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Kpi({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl font-black">
        {value}
        {suffix ?? ""}
      </strong>
    </div>
  );
}
