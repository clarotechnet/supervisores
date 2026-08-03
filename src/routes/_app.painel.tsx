import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TaskBoard, splitRecords } from "@/components/TaskBoard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cacheChecklistRecords, getCachedChecklistRecords } from "@/lib/checklist-cache";
import { completeTask, ensureChecklist, reopenTask, saveNote } from "@/services/checklist";
import { addDays, formatLongDate, todayKey } from "@/lib/date-utils";
import type { Sector, TaskRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({
    meta: [
      { title: "Minha rotina do dia | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Checklist diário do supervisor com atividades por horário, atrasos destacados e observações.",
      },
      { property: "og:title", content: "Minha rotina do dia | Rotina de Supervisores" },
      { property: "og:description", content: "Acompanhe e conclua as atividades do turno." },
    ],
  }),
  component: PainelPage,
});

const PICK_KEY = "rotina:painel-setor";

function PainelPage() {
  const { user, profile, sector } = useAuth();
  const userId = user?.id;
  const [dateKey, setDateKey] = useState(todayKey());
  const [view, setView] = useState<"board" | "list">("board");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [pickedSectorId, setPickedSectorId] = useState<string | null>(null);

  const activeSectorId = profile?.sector_id ?? pickedSectorId;
  const activeSector = sector ?? sectors.find((s) => s.id === activeSectorId) ?? null;
  const currentRecordsKey =
    userId && activeSectorId ? `${userId}:${activeSectorId}:${dateKey}` : null;
  const initialRecords =
    userId && activeSectorId
      ? getCachedChecklistRecords({ userId, sectorId: activeSectorId, dateKey })
      : null;
  const [records, setRecords] = useState<TaskRecord[]>(() => initialRecords ?? []);
  const [recordsKey, setRecordsKey] = useState<string | null>(() => currentRecordsKey);
  const [loading, setLoading] = useState(() => initialRecords === null);
  const [cacheable, setCacheable] = useState(() => initialRecords !== null);
  const loadRequestId = useRef(0);

  // Admin sem setor fixo escolhe de qual setor é a rotina pessoal dele.
  useEffect(() => {
    setPickedSectorId(localStorage.getItem(PICK_KEY));
  }, []);

  useEffect(() => {
    if (profile?.sector_id) return;
    void supabase
      .from("sectors")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setSectors((data ?? []) as Sector[]));
  }, [profile?.sector_id]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!userId || !activeSectorId) {
      setLoading(false);
      return;
    }
    const params = { userId, sectorId: activeSectorId, dateKey };
    const key = `${userId}:${activeSectorId}:${dateKey}`;
    const cached = getCachedChecklistRecords(params);
    if (cached) {
      setRecords(cached);
      setRecordsKey(key);
      setCacheable(true);
      setLoading(false);
    } else {
      setRecords([]);
      setRecordsKey(key);
      setCacheable(false);
      setLoading(true);
    }
    try {
      const { records: list } = await ensureChecklist({
        userId,
        sectorId: activeSectorId,
        dateKey,
      });
      if (requestId !== loadRequestId.current) return;
      setRecords(list);
      setRecordsKey(key);
      setCacheable(true);
    } catch {
      if (requestId !== loadRequestId.current) return;
      toast.error("Não foi possível carregar a rotina do dia.");
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [userId, activeSectorId, dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tempo real: reflete alterações feitas em outra aba/dispositivo.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`records-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_task_records",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as TaskRecord | null;
          if (!row || row.scheduled_date !== dateKey) return;
          setRecords((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "assigned_tasks",
          filter: `assigned_to=eq.${userId}`,
        },
        (payload) => {
          const assigned = payload.new as { scheduled_date?: string };
          if (assigned.scheduled_date === dateKey) void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, dateKey, load]);

  useEffect(() => {
    if (loading || !cacheable || !userId || !activeSectorId || recordsKey !== currentRecordsKey)
      return;
    cacheChecklistRecords({ userId, sectorId: activeSectorId, dateKey }, records);
  }, [loading, cacheable, userId, activeSectorId, dateKey, records, recordsKey, currentRecordsKey]);

  const visibleRecords = useMemo(
    () => (recordsKey === currentRecordsKey ? records : []),
    [recordsKey, currentRecordsKey, records],
  );
  const pageLoading = loading || recordsKey !== currentRecordsKey;
  const columns = useMemo(() => splitRecords(visibleRecords), [visibleRecords]);
  const total = visibleRecords.length;
  const done = columns.done.length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const isToday = dateKey === todayKey();

  async function handleToggle(record: TaskRecord) {
    const optimistic: TaskRecord =
      record.status === "completed"
        ? { ...record, status: "reopened", completed_at: null }
        : { ...record, status: "completed", completed_at: new Date().toISOString() };
    setRecords((prev) => prev.map((r) => (r.id === record.id ? optimistic : r)));
    try {
      if (record.status === "completed") await reopenTask(record);
      else await completeTask(record);
    } catch {
      setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
      toast.error("Não foi possível atualizar a atividade.");
    }
  }

  async function handleNote(record: TaskRecord, note: string) {
    try {
      await saveNote(record, note);
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, note: note.trim() || null } : r)),
      );
      toast.success("Observação salva.");
    } catch {
      toast.error("Não foi possível salvar a observação.");
    }
  }

  if (!activeSectorId) {
    return (
      <AppShell>
        <section className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-xl font-black">Escolha o setor da sua rotina</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Seu acesso é de gestor e não está fixado em um setor. Selecione de qual setor será o seu
            checklist pessoal — você pode trocar quando quiser.
          </p>
          <div className="mt-4 grid gap-2">
            {sectors.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  localStorage.setItem(PICK_KEY, s.id);
                  setPickedSectorId(s.id);
                }}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white"
                  style={{ background: s.color }}
                >
                  {s.code}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-sm">{s.name}</b>
                  <small className="block truncate text-[11px] text-muted-foreground">
                    {s.subtitle}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      areaColor={activeSector?.color}
      progress={progress}
      progressLabel={`${done} de ${total} atividades concluídas`}
    >
      <section className="hero-surface mb-5 rounded-2xl p-6 shadow-hero md:p-8">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">
          {activeSector?.code ?? "Setor"} · {activeSector?.subtitle ?? ""}
        </span>
        <h1 className="mt-2 text-2xl font-black md:text-3xl">
          {activeSector?.name ?? "Minha rotina"}
        </h1>
        <p className="mt-1 text-xs capitalize opacity-80">{formatLongDate(dateKey)}</p>
        {!profile?.sector_id && (
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(PICK_KEY);
              setPickedSectorId(null);
              setRecords([]);
            }}
            className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-bold hover:bg-white/20"
          >
            Trocar setor
          </button>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => setDateKey((d) => addDays(d, -1))}
            className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold">
            <CalendarDays className="size-3.5" />
            <input
              type="date"
              value={dateKey}
              max={todayKey()}
              onChange={(e) => e.target.value && setDateKey(e.target.value)}
              className="bg-transparent text-[11px] font-bold outline-none [color-scheme:dark]"
            />
          </span>
          <button
            type="button"
            aria-label="Próximo dia"
            disabled={isToday}
            onClick={() => setDateKey((d) => addDays(d, 1))}
            className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDateKey(todayKey())}
              className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold hover:bg-white/20"
            >
              Hoje
            </button>
          )}

          <div className="ml-auto flex rounded-lg bg-white/10 p-1">
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold",
                view === "board" && "bg-white/20",
              )}
            >
              <LayoutGrid className="size-3.5" /> Quadro
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold",
                view === "list" && "bg-white/20",
              )}
            >
              <List className="size-3.5" /> Lista
            </button>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Atividades do dia" value={total} />
        <StatCard label="Pendentes" value={columns.pending.length} />
        <StatCard label="Em atraso" value={columns.late.length} tone="late" />
        <StatCard label="Concluídas" value={done} tone="done" />
      </div>

      {pageLoading && visibleRecords.length === 0 ? (
        <div className="grid min-h-[240px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TaskBoard
          records={visibleRecords}
          view={view}
          onToggle={handleToggle}
          onSaveNote={handleNote}
        />
      )}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "late" | "done" | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "mt-1 block text-2xl font-black",
          tone === "late" && "text-late-foreground",
          tone === "done" && "text-success-foreground",
        )}
      >
        {value}
      </strong>
    </div>
  );
}
