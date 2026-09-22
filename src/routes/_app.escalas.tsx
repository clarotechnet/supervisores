import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  FileSpreadsheet,
  Lightbulb,
  Loader2,
  Search,
  StickyNote,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ScheduleDateNoteDialog } from "@/components/ScheduleDateNoteDialog";
import { ScheduleSuggestionsDialog } from "@/components/ScheduleSuggestionsDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  SCHEDULE_CITY_OPTIONS,
  SCHEDULE_SECTOR_OPTIONS,
  type ScheduleDateNote,
  type SchedulePerson,
  type ScheduleUpload,
  type ScheduleUploadSummary,
} from "@/lib/types";
import {
  parseScheduleWorkbook,
  scheduleCodeKind,
  type ParsedScheduleSheet,
} from "@/lib/schedule-import";
import {
  deleteScheduleUpload,
  deleteScheduleDateNote,
  fetchScheduleDateNotes,
  fetchScheduleUpload,
  fetchScheduleUploadSummaries,
  saveScheduleDateNote,
  saveScheduleUpload,
} from "@/services/schedules";
import { cn } from "@/lib/utils";
import { todayKey } from "@/lib/date-utils";
import { canManageSchedulesForRole } from "@/lib/access";

export const Route = createFileRoute("/_app/escalas")({
  head: () => ({
    meta: [
      { title: "Escalas | Rotina de Supervisores" },
      {
        name: "description",
        content: "Consulta e importação de escalas por cidade, setor, mês e colaborador.",
      },
    ],
  }),
  component: SchedulesPage,
});

function dateFromIso(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function monthLabel(value: string): string {
  return dateFromIso(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function cityLabel(value: string): string {
  return SCHEDULE_CITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function sectorLabel(value: string): string {
  return SCHEDULE_SECTOR_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const KIND_STYLE = {
  work: "border-primary/30 bg-primary/10 text-primary",
  off: "border-border bg-secondary text-muted-foreground",
  vacation: "border-warning/40 bg-warning-soft text-warning-foreground",
  leave: "border-info/40 bg-info-soft text-info-foreground",
} as const;

function SchedulesPage() {
  const { profile, isAdmin, isController } = useAuth();
  const [summaries, setSummaries] = useState<ScheduleUploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleUpload | null>(null);
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [month, setMonth] = useState("");
  const [personName, setPersonName] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [dateNotes, setDateNotes] = useState<ScheduleDateNote[]>([]);
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const canManageSchedules = profile ? canManageSchedulesForRole(profile.role) : false;
  const canUseSuggestions = isAdmin || isController;

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchScheduleUploadSummaries();
      setSummaries(rows);
      if (rows.length > 0) {
        const first = rows[0]!;
        setCity((current) => current || first.city);
        setSector((current) => current || first.sector);
        setMonth((current) => current || first.schedule_month);
      }
    } catch {
      toast.error("Não foi possível carregar as escalas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  const selectedSummary = summaries.find(
    (item) => item.city === city && item.sector === sector && item.schedule_month === month,
  );
  const selectedSummaryId = selectedSummary?.id;

  useEffect(() => {
    let active = true;
    if (!selectedSummaryId) {
      setSchedule(null);
      setDateNotes([]);
      return;
    }
    setLoadingSchedule(true);
    void Promise.all([
      fetchScheduleUpload(selectedSummaryId),
      fetchScheduleDateNotes(selectedSummaryId),
    ])
      .then(([data, notes]) => {
        if (!active) return;
        setSchedule(data);
        setDateNotes(notes);
        setPersonName((current) => {
          const people = data?.payload.people ?? [];
          return people.some((person) => person.name === current)
            ? current
            : (people[0]?.name ?? "");
        });
      })
      .catch(() => toast.error("Não foi possível abrir esta escala."))
      .finally(() => {
        if (active) setLoadingSchedule(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSummaryId]);

  const availableMonths = useMemo(
    () =>
      [
        ...new Set(
          summaries
            .filter((item) => (!city || item.city === city) && (!sector || item.sector === sector))
            .map((item) => item.schedule_month),
        ),
      ].sort((a, b) => b.localeCompare(a)),
    [summaries, city, sector],
  );

  const people = useMemo(() => {
    const query = personSearch.trim().toLocaleLowerCase("pt-BR");
    return (schedule?.payload.people ?? []).filter(
      (person) =>
        !query ||
        person.name.toLocaleLowerCase("pt-BR").includes(query) ||
        person.jobTitle.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [schedule, personSearch]);

  const person = schedule?.payload.people.find((item) => item.name === personName) ?? null;

  function chooseCity(value: string) {
    setCity(value);
    const next = summaries.find((item) => item.city === value);
    setSector(next?.sector ?? "");
    setMonth(next?.schedule_month ?? "");
  }

  function chooseSector(value: string) {
    setSector(value);
    const next = summaries.find((item) => item.city === city && item.sector === value);
    setMonth(next?.schedule_month ?? "");
  }

  async function removeCurrentSchedule() {
    if (!selectedSummary || !canManageSchedules) return;
    const scope = `${cityLabel(selectedSummary.city)} · ${sectorLabel(selectedSummary.sector)} · ${monthLabel(selectedSummary.schedule_month)}`;
    if (!window.confirm(`Excluir a escala de ${scope}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteScheduleUpload(selectedSummary.id);
      toast.success("Escala excluída.");
      setSchedule(null);
      setCity("");
      setSector("");
      setMonth("");
      await loadSummaries();
    } catch {
      toast.error("Não foi possível excluir a escala.");
    }
  }

  function openDateNote(date: string) {
    const note = dateNotes.find((item) => item.note_date === date);
    if (!isAdmin && !note) return;
    setNoteDate(date);
    setNoteOpen(true);
  }

  async function saveDateNote(body: string) {
    if (!schedule || !noteDate || !profile?.id) return;
    setSavingNote(true);
    try {
      await saveScheduleDateNote({
        scheduleId: schedule.id,
        noteDate,
        body,
        authorId: profile.id,
      });
      setDateNotes(await fetchScheduleDateNotes(schedule.id));
      setNoteOpen(false);
      toast.success("Observação salva para os controladores.");
    } catch {
      toast.error("Não foi possível salvar a observação.");
    } finally {
      setSavingNote(false);
    }
  }

  async function removeDateNote() {
    const note = dateNotes.find((item) => item.note_date === noteDate);
    if (!schedule || !note) return;
    setSavingNote(true);
    try {
      await deleteScheduleDateNote(note.id);
      setDateNotes(await fetchScheduleDateNotes(schedule.id));
      setNoteOpen(false);
      toast.success("Observação excluída.");
    } catch {
      toast.error("Não foi possível excluir a observação.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <AppShell>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
            Controle operacional
          </p>
          <h1 className="mt-1 text-2xl font-black">Escalas</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManageSchedules
              ? "Consulte e importe a programação por cidade, setor e mês."
              : "Consulte a programação por cidade, setor e mês."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseSuggestions && (
            <Button variant="outline" onClick={() => setSuggestionsOpen(true)}>
              <Lightbulb className="size-4" /> Sugestões
            </Button>
          )}
          {canManageSchedules && (
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Importar planilha
            </Button>
          )}
        </div>
      </header>

      <section className="mb-5 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card md:grid-cols-3">
        <FilterSelect
          label="Cidade"
          value={city}
          placeholder="Selecione a cidade"
          options={SCHEDULE_CITY_OPTIONS}
          onChange={chooseCity}
        />
        <FilterSelect
          label="Setor"
          value={sector}
          placeholder="Selecione o setor"
          options={SCHEDULE_SECTOR_OPTIONS}
          onChange={chooseSector}
        />
        <FilterSelect
          label="Mês"
          value={month}
          placeholder="Selecione o mês"
          options={availableMonths.map((value) => ({ value, label: monthLabel(value) }))}
          onChange={setMonth}
        />
      </section>

      {loading ? (
        <LoadingCard label="Carregando escalas..." />
      ) : summaries.length === 0 ? (
        canManageSchedules ? (
          <EmptySchedule onImport={() => setImportOpen(true)} />
        ) : (
          <EmptySchedule />
        )
      ) : !selectedSummary ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground/50" />
          <h2 className="mt-3 text-sm font-bold">Nenhuma escala para este filtro</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManageSchedules
              ? "Importe a planilha desta cidade e setor ou escolha outra combinação."
              : "Escolha outra combinação de cidade, setor e mês."}
          </p>
        </section>
      ) : loadingSchedule || !schedule ? (
        <LoadingCard label="Abrindo a escala..." />
      ) : (
        <div className="grid gap-5">
          <section className="rounded-2xl bg-gradient-to-r from-navy to-[#8f2937] p-6 text-white shadow-hero">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/60">
                  {cityLabel(schedule.city)} · {sectorLabel(schedule.sector)}
                </span>
                <h2 className="mt-2 text-2xl font-black capitalize">
                  Escala de {monthLabel(schedule.schedule_month)}
                </h2>
                <p className="mt-1 text-xs text-white/65">
                  {schedule.employee_count} colaboradores · {schedule.entry_count} marcações · aba “
                  {schedule.source_sheet}”
                </p>
              </div>
              {canManageSchedules && (
                <Button
                  variant="outline"
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => void removeCurrentSchedule()}
                >
                  <Trash2 className="size-4" /> Excluir escala
                </Button>
              )}
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="min-w-0 border-b border-border pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
              <Label htmlFor="person-search">Colaborador</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="person-search"
                  value={personSearch}
                  onChange={(event) => setPersonSearch(event.target.value)}
                  placeholder="Buscar por nome ou função"
                  className="pl-9"
                />
              </div>
              <div className="mt-3 max-h-[540px] space-y-1 overflow-y-auto pr-1">
                {people.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setPersonName(item.name)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      personName === item.name
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-secondary/60",
                    )}
                  >
                    <b className="block truncate text-xs">{item.name}</b>
                    <small className="mt-0.5 block truncate text-[9px] text-muted-foreground">
                      {item.jobTitle || "Função não informada"}
                    </small>
                  </button>
                ))}
                {people.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Nenhum colaborador encontrado.
                  </p>
                )}
              </div>
            </aside>

            {person ? (
              <PersonSchedule
                person={person}
                month={schedule.schedule_month}
                notes={dateNotes}
                isAdmin={isAdmin}
                onOpenNote={openDateNote}
              />
            ) : (
              <div className="grid min-h-[360px] place-items-center text-center text-xs text-muted-foreground">
                Selecione um colaborador para consultar a escala.
              </div>
            )}
          </section>
        </div>
      )}

      {canManageSchedules && (
        <ImportScheduleDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          initialCity={city}
          initialSector={sector}
          existing={summaries}
          userId={profile?.id ?? ""}
          onSaved={async (savedCity, savedSector, savedMonth) => {
            await loadSummaries();
            setCity(savedCity);
            setSector(savedSector);
            setMonth(savedMonth);
          }}
        />
      )}
      {canUseSuggestions && (
        <ScheduleSuggestionsDialog
          open={suggestionsOpen}
          onOpenChange={setSuggestionsOpen}
          isAdmin={isAdmin}
          userId={profile?.id ?? ""}
          schedule={schedule}
        />
      )}
      <ScheduleDateNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        date={noteDate}
        note={dateNotes.find((item) => item.note_date === noteDate) ?? null}
        isAdmin={isAdmin}
        saving={savingNote}
        onSave={saveDateNote}
        onDelete={removeDateNote}
      />
    </AppShell>
  );
}

function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-card">
      <div className="text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function EmptySchedule({ onImport }: { onImport?: () => void }) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <FileSpreadsheet className="mx-auto size-10 text-primary/60" />
      <h2 className="mt-4 text-base font-black">Nenhuma escala importada</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        {onImport
          ? "Selecione a cidade, o setor e uma aba da planilha Excel. A prévia será exibida antes da gravação."
          : "Assim que um gestor ou supervisor importar uma escala, ela ficará disponível aqui para consulta."}
      </p>
      {onImport && (
        <Button className="mt-5" onClick={onImport}>
          <Upload className="size-4" /> Importar primeira escala
        </Button>
      )}
    </section>
  );
}

function PersonSchedule({
  person,
  month,
  notes,
  isAdmin,
  onOpenNote,
}: {
  person: SchedulePerson;
  month: string;
  notes: ScheduleDateNote[];
  isAdmin: boolean;
  onOpenNote: (date: string) => void;
}) {
  const firstDay = dateFromIso(month);
  const year = firstDay.getFullYear();
  const monthIndex = firstDay.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingDays = new Date(year, monthIndex, 1).getDay();
  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  const entries = dates
    .map((date) => ({ date, code: person.assignments[date] ?? "" }))
    .filter((entry) => entry.code);
  const workDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "work");
  const offDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "off");
  const nextWork = workDays.find((entry) => entry.date >= todayKey());

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{person.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {person.jobTitle || "Função não informada"}
          </p>
        </div>
        {nextWork && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary">
            Próximo turno: {dateFromIso(nextWork.date).toLocaleDateString("pt-BR")} ·{" "}
            {nextWork.code}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniKpi label="Dias com marcação" value={entries.length} />
        <MiniKpi label="Dias de trabalho" value={workDays.length} />
        <MiniKpi label="Folgas" value={offDays.length} />
        <MiniKpi label="Função" value={person.jobTitle || "—"} compact />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/5 px-3 py-2 text-[10px] text-foreground">
          <span className="flex items-center gap-1.5 font-bold">
            <StickyNote className="size-3.5" />
            {notes.length > 0
              ? `${notes.length} observação(ões) da gestão neste mês`
              : "Nenhuma observação da gestão neste mês"}
          </span>
          {isAdmin && <span>Clique em uma data para adicionar ou editar.</span>}
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-secondary/60 text-center text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
            <span key={day} className="p-2">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 bg-border/50 gap-px">
          {Array.from({ length: leadingDays }, (_, index) => (
            <span key={`blank-${index}`} className="min-h-20 bg-card" />
          ))}
          {dates.map((date) => {
            const code = person.assignments[date] ?? "";
            const kind = code ? scheduleCodeKind(code) : null;
            const note = notes.find((item) => item.note_date === date);
            const canOpen = isAdmin || Boolean(note);
            return (
              <button
                key={date}
                type="button"
                disabled={!canOpen}
                onClick={() => onOpenNote(date)}
                className={cn(
                  "min-h-24 bg-card p-2 text-left transition-colors",
                  canOpen &&
                    "cursor-pointer hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                )}
                aria-label={`${Number(date.slice(-2))} de ${monthLabel(month)}${note ? ", com observação" : ""}`}
              >
                <span className="flex items-center justify-between gap-1 text-[10px] font-bold text-muted-foreground">
                  {Number(date.slice(-2))}
                  {note && <StickyNote className="size-3.5 text-primary" aria-hidden="true" />}
                </span>
                {code && kind && (
                  <span
                    className={cn(
                      "mt-2 block rounded-lg border px-2 py-1.5 text-center text-[9px] font-black",
                      KIND_STYLE[kind],
                    )}
                  >
                    {code}
                  </span>
                )}
                {note && (
                  <span className="mt-1 block truncate rounded bg-primary/10 px-1.5 py-1 text-[8px] font-bold text-primary">
                    Observação
                  </span>
                )}
                {isAdmin && !note && (
                  <span className="mt-1 block text-[8px] font-semibold text-muted-foreground/70">
                    + observar
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <Legend color="bg-primary" label="Trabalho / turno" />
        <Legend color="bg-muted-foreground" label="Folga" />
        <Legend color="bg-warning" label="Férias" />
        <Legend color="bg-info" label="Licença / afastamento" />
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <b className={cn("mt-1 block", compact ? "truncate text-xs" : "text-xl")}>{value}</b>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={cn("size-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function ImportScheduleDialog({
  open,
  onOpenChange,
  initialCity,
  initialSector,
  existing,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCity: string;
  initialSector: string;
  existing: ScheduleUploadSummary[];
  userId: string;
  onSaved: (city: string, sector: string, month: string) => Promise<void>;
}) {
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedScheduleSheet[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCity(initialCity);
    setSector(initialSector);
  }, [open, initialCity, initialSector]);

  const selected = parsed.find((sheet) => sheet.sheetName === sheetName) ?? null;
  const willReplace = Boolean(
    selected &&
    existing.some(
      (item) =>
        item.city === city && item.sector === sector && item.schedule_month === selected.month,
    ),
  );

  function reset() {
    setFileName("");
    setParsed([]);
    setSheetName("");
    setParsing(false);
    setSaving(false);
  }

  async function readFile(file: File | undefined) {
    reset();
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const sheets = await parseScheduleWorkbook(file);
      setParsed(sheets);
      setSheetName(sheets[0]?.sheetName ?? "");
      toast.success(`${sheets.length} aba(s) compatível(is) encontrada(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!city || !sector || !selected || !userId) {
      toast.error("Selecione cidade, setor, arquivo e aba.");
      return;
    }
    if (
      willReplace &&
      !window.confirm("Já existe uma escala para esta cidade, setor e mês. Deseja substituí-la?")
    )
      return;

    setSaving(true);
    try {
      await saveScheduleUpload({
        city,
        sector,
        scheduleMonth: selected.month,
        sourceFile: fileName,
        sourceSheet: selected.sheetName,
        employeeCount: selected.employeeCount,
        entryCount: selected.entryCount,
        payload: selected.payload,
        importedBy: userId,
      });
      await onSaved(city, sector, selected.month);
      toast.success(
        willReplace ? "Escala substituída com sucesso." : "Escala importada com sucesso.",
      );
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível salvar a escala no Supabase.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar escala</DialogTitle>
          <DialogDescription>
            Cidade e setor fazem parte da identificação da escala. Uma nova importação no mesmo mês
            substitui a anterior.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <FilterSelect
            label="Cidade"
            value={city}
            placeholder="Selecione a cidade"
            options={SCHEDULE_CITY_OPTIONS}
            onChange={setCity}
          />
          <FilterSelect
            label="Setor"
            value={sector}
            placeholder="Selecione o setor"
            options={SCHEDULE_SECTOR_OPTIONS}
            onChange={setSector}
          />
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="schedule-file">Arquivo Excel</Label>
            <Input
              id="schedule-file"
              type="file"
              accept=".xlsx,.xlsm"
              disabled={parsing || saving}
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
          </div>
          {parsing && (
            <div className="flex items-center gap-2 rounded-xl bg-secondary p-4 text-xs text-muted-foreground md:col-span-2">
              <Loader2 className="size-4 animate-spin" /> Analisando abas, datas e colaboradores...
            </div>
          )}
          {parsed.length > 0 && (
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Aba da planilha</Label>
              <Select value={sheetName} onValueChange={setSheetName}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parsed.map((sheet) => (
                    <SelectItem key={sheet.sheetName} value={sheet.sheetName}>
                      {sheet.sheetName} · {monthLabel(sheet.month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {selected && (
          <section className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-success" />
              <div>
                <b className="block text-sm">Prévia pronta para importar</b>
                <small className="text-[10px] text-muted-foreground">{fileName}</small>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <PreviewStat icon={CalendarDays} label="Mês" value={monthLabel(selected.month)} />
              <PreviewStat icon={Users} label="Pessoas" value={selected.employeeCount} />
              <PreviewStat icon={FileSpreadsheet} label="Marcações" value={selected.entryCount} />
            </div>
            {selected.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-[10px] text-warning-foreground">
                <b>{selected.warnings.length} aviso(s):</b>{" "}
                {selected.warnings.slice(0, 3).join(" ")}
              </div>
            )}
            {willReplace && (
              <p className="mt-3 rounded-lg border border-primary/25 bg-primary/10 p-3 text-[10px] font-bold text-primary">
                Já existe uma escala nesta cidade, setor e mês. A confirmação substituirá os dados
                anteriores.
              </p>
            )}
          </section>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || parsing || !selected || !city || !sector}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {willReplace ? "Substituir escala" : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-card p-3 text-center shadow-sm">
      <Icon className="mx-auto size-4 text-primary" />
      <span className="mt-1 block text-[9px] uppercase text-muted-foreground">{label}</span>
      <b className="mt-0.5 block truncate text-xs capitalize">{value}</b>
    </div>
  );
}
