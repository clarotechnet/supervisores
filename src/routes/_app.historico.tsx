import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TaskBoard } from "@/components/TaskBoard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchHistory } from "@/services/checklist";
import { addDays, formatShortDate, todayKey } from "@/lib/date-utils";
import { buildCsv, downloadCsv } from "@/lib/csv";
import type { DailyChecklist, TaskRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/historico")({
  head: () => ({
    meta: [
      { title: "Histórico da rotina | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Consulte dias anteriores da rotina, taxa de conclusão por data e exporte os registros em CSV.",
      },
      { property: "og:title", content: "Histórico da rotina | Rotina de Supervisores" },
      { property: "og:description", content: "Dias anteriores, conclusão e exportação em CSV." },
    ],
  }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const { user, profile, sector } = useAuth();
  const [from, setFrom] = useState(addDays(todayKey(), -13));
  const [to, setTo] = useState(todayKey());
  const [checklists, setChecklists] = useState<DailyChecklist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await fetchHistory(user.id, from, to);
      setChecklists([...list].reverse());
    } catch {
      toast.error("Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, [user, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDay = useCallback(async (checklist: DailyChecklist) => {
    setSelected(checklist.id);
    const { data } = await supabase
      .from("daily_task_records")
      .select("*")
      .eq("checklist_id", checklist.id)
      .order("scheduled_time", { ascending: true });
    setRecords((data ?? []) as TaskRecord[]);
  }, []);

  async function exportCsv() {
    if (!user) return;
    const { data } = await supabase
      .from("daily_task_records")
      .select("*")
      .eq("user_id", user.id)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date", { ascending: true });

    const rows = ((data ?? []) as TaskRecord[]).map((record) => ({
      record,
      sectorName: sector?.name ?? "",
      supervisorName: profile?.full_name ?? "",
    }));
    if (rows.length === 0) {
      toast.error("Nenhum registro no período selecionado.");
      return;
    }
    downloadCsv(`rotina_${from}_a_${to}.csv`, buildCsv(rows));
  }

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5">
        <h1 className="text-2xl font-black">Histórico</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Consulte a rotina de dias anteriores e exporte os registros.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
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
        <Button variant="outline" onClick={exportCsv} className="ml-auto">
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      {loading ? (
        <div className="grid min-h-[200px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : checklists.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
          Nenhum dia registrado neste período.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="grid max-h-[560px] gap-2 overflow-auto">
            {checklists.map((checklist) => {
              const pct = checklist.total_tasks
                ? Math.round((checklist.completed_tasks / checklist.total_tasks) * 100)
                : 0;
              return (
                <li key={checklist.id}>
                  <button
                    type="button"
                    onClick={() => void openDay(checklist)}
                    className={cn(
                      "w-full rounded-xl border border-border bg-card p-3 text-left shadow-card transition-colors hover:border-area",
                      selected === checklist.id && "border-area ring-1 ring-area/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <b className="text-xs">{formatShortDate(checklist.checklist_date)}</b>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {checklist.completed_tasks}/{checklist.total_tasks}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <i
                        className="block h-full rounded-full bg-area"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <small className="mt-1 block text-[10px] text-muted-foreground">
                      {pct}% concluído
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>

          <div>
            {selected ? (
              <TaskBoard records={records} view="list" readOnly />
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
                Selecione um dia para ver as atividades.
              </p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
