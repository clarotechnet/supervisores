import { ScheduleMonthDeleteDialog } from "@/components/ScheduleMonthDeleteDialog";
import {
  SchedulePersonDialog,
  type SchedulePersonDialogHandle,
} from "@/components/SchedulePersonDialog";
import "@/components/schedule-layout.css";
import { ScheduleTeamWorkspace } from "@/components/ScheduleTeamWorkspace";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScheduleOfficialEditDialog } from "@/components/ScheduleOfficialEditDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  MoreHorizontal,
  Pencil,
  FileSpreadsheet,
  Lightbulb,
  Sparkles,
  History,
  Loader2,
  RefreshCw,
  StickyNote,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ScheduleDateNoteDialog } from "@/components/ScheduleDateNoteDialog";
import { ScheduleSuggestionsDialog } from "@/components/ScheduleSuggestionsDialog";
import { ScheduleGeneratorDialog } from "@/components/ScheduleGeneratorDialog";
import { ScheduleOperationalDialog } from "@/components/ScheduleOperationalDialog";
import { ScheduleOperationalPreview } from "@/components/ScheduleOperationalPreview";
import { latestOperationalSource, syncOperationalSheet } from "@/services/schedule-operational";
import { SchedulePdfButton } from "@/components/SchedulePdfButton";
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
import { useControlScheduleAccess } from "@/hooks/useControlScheduleAccess";
import { ScheduleControlAccessGate } from "@/components/ScheduleControlAccessGate";
import { ScheduleControlAccessDialog } from "@/components/ScheduleControlAccessDialog";
import {
  ScheduleControlAccessRequestDialog,
  ScheduleControlAccessShortcut,
} from "@/components/ScheduleControlAccessRequestDialog";
import {
  SCHEDULE_CITY_OPTIONS,
  SCHEDULE_SECTOR_OPTIONS,
  scheduleFrontOptionsForCity,
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
  syncScheduleFromSheets,
} from "@/services/schedules";
import { cn } from "@/lib/utils";
import { todayKey } from "@/lib/date-utils";
import { canManageSchedulesForRole } from "@/lib/access";
import {
  scheduleMonthDates,
  scheduleDutyDate,
  schedulePeopleOnDuty,
  schedulePeopleOnDutyInMonth,
  SCHEDULE_KIND_STYLE,
} from "@/lib/schedule-view";
import { downloadScheduleReport } from "@/lib/schedule-report";

export const Route = createFileRoute("/_app/escalas")({
  head: () => ({
    meta: [
      { title: "Escalas | Rotina de Supervisores" },
      {
        name: "description",
        content: "Consulta e atualização de escalas por cidade, frente, mês e colaborador.",
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

function currentScheduleMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function cityLabel(value: string): string {
  return SCHEDULE_CITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function sectorLabel(value: string): string {
  return SCHEDULE_SECTOR_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function SchedulesPage() {
  const { profile, isAdmin, isController } = useAuth();
  const [summaries, setSummaries] = useState<ScheduleUploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleUpload | null>(null);
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [month, setMonth] = useState("");
  const [selectedPersonNames, setSelectedPersonNames] = useState<string[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const personDialog = useRef<SchedulePersonDialogHandle>(null);
  const showPerson = useCallback(
    (name: string, date: string | undefined, queue: SchedulePerson[]) => {
      personDialog.current?.open(name, date, queue);
    },
    [],
  );
  const loadedScheduleId = useRef<string | null>(null);
  const [dutyScope, setDutyScope] = useState<"day" | "month" | null>(null);
  const onDutyOnly = dutyScope !== null;
  const [dutyDateChoice, setDutyDateChoice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [operationalOpen, setOperationalOpen] = useState(false);
  const [officialEditOpen, setOfficialEditOpen] = useState(false);
  const [deleteMonthOpen, setDeleteMonthOpen] = useState(false);
  const [dateNotes, setDateNotes] = useState<ScheduleDateNote[]>([]);
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [operationalRefreshKey, setOperationalRefreshKey] = useState(0);
  const [exportingReport, setExportingReport] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessRequestOpen, setAccessRequestOpen] = useState(false);
  const scopeAccess = useControlScheduleAccess(profile?.id, isAdmin, city, sector);
  const canManageSchedules = profile ? canManageSchedulesForRole(profile.role, sector) : false;
  const canUseSuggestions = (isAdmin || isController) && scopeAccess.allowed;

  useEffect(() => {
    if (scopeAccess.allowed) return;
    setNoteOpen(false);
    setSuggestionsOpen(false);
    setGeneratorOpen(false);
    setOperationalOpen(false);
    setOfficialEditOpen(false);
    setDeleteMonthOpen(false);
    setImportOpen(false);
    setSelectedPersonNames([]);
    setDateNotes([]);
  }, [scopeAccess.allowed]);

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
      } else {
        setCity((current) => current || "natal");
        setSector((current) => current || "adesao-servico");
        setMonth((current) => current || currentScheduleMonth());
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

  useEffect(() => {
    if (scopeAccess.restricted && scopeAccess.allowed && !isAdmin) void loadSummaries();
  }, [scopeAccess.restricted, scopeAccess.allowed, city, isAdmin, loadSummaries]);

  const selectedSummary = summaries.find(
    (item) => item.city === city && item.sector === sector && item.schedule_month === month,
  );
  // O mês selecionado é o destino da geração; a base vem do mês anterior.
  const previousMonth = (() => {
    if (!month) return "";
    const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
    const previous = new Date(Date.UTC(year!, monthNumber! - 2, 1));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();
  const generatorSourceSummary =
    summaries.find(
      (item) =>
        item.city === city && item.sector === sector && item.schedule_month === previousMonth,
    ) ?? null;
  const selectedSummaryId = scopeAccess.allowed ? selectedSummary?.id : undefined;
  // Updating via Sheets/Excel upserts the same row, so its ID stays unchanged.
  // Reload the payload when that row's imported/updated version changes too.
  const selectedSummaryVersion = selectedSummary
    ? `${selectedSummary.imported_at}|${selectedSummary.updated_at}`
    : undefined;

  useEffect(() => {
    let active = true;
    if (!selectedSummaryId) {
      setSchedule(null);
      setDateNotes([]);
      setLoadingSchedule(false);
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
        const changed = loadedScheduleId.current !== data?.id;
        loadedScheduleId.current = data?.id || null;
        setSelectedPersonNames((current) =>
          changed
            ? data?.payload.people.map((person) => person.name) || []
            : current.filter((name) => data?.payload.people.some((person) => person.name === name)),
        );
      })
      .catch(() => toast.error("Não foi possível abrir esta escala."))
      .finally(() => {
        if (active) setLoadingSchedule(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSummaryId, selectedSummaryVersion]);

  const frontOptions = useMemo(() => {
    const options = [...scheduleFrontOptionsForCity(city)];
    const known = new Set(options.map((option) => option.value));
    for (const item of summaries) {
      if (item.city !== city || known.has(item.sector)) continue;
      options.push({ value: item.sector, label: sectorLabel(item.sector) });
      known.add(item.sector);
    }
    return options;
  }, [city, summaries]);

  const dutyDate = scheduleDutyDate(month, dutyDateChoice, todayKey());
  const monthDates = useMemo(() => scheduleMonthDates(month), [month]);
  const eligiblePeople = useMemo(() => {
    const all = schedule?.payload.people ?? [];
    if (dutyScope === "month") return schedulePeopleOnDutyInMonth(all, month);
    return dutyScope === "day" ? schedulePeopleOnDuty(all, dutyDate) : all;
  }, [schedule, dutyScope, dutyDate, month]);
  const eligibleNames = useMemo(
    () => new Set(eligiblePeople.map((person) => person.name)),
    [eligiblePeople],
  );
  const visibleSelectedNames = useMemo(
    () => selectedPersonNames.filter((name) => eligibleNames.has(name)),
    [selectedPersonNames, eligibleNames],
  );

  const dutyFilterDescription =
    dutyScope === "day"
      ? `Plantão em ${dateFromIso(dutyDate).toLocaleDateString("pt-BR")} - calendário completo do mês dos colaboradores selecionados`
      : dutyScope === "month"
        ? "Plantão no mês - colaboradores selecionados com ao menos um dia de trabalho/turno"
        : "Colaboradores selecionados - calendário completo do mês";

  function choosePeople(names: string[]) {
    // Filtering a view must not silently discard prior selections. Hidden
    // selections return when the duty filter is disabled; they never enter
    // the visible comparison or its exported image while it is active.
    setSelectedPersonNames((current) =>
      onDutyOnly
        ? [...new Set([...current.filter((name) => !eligibleNames.has(name)), ...names])]
        : names,
    );
  }

  function chooseCity(value: string) {
    setCity(value);
    const next = summaries.find((item) => item.city === value);
    const firstFront = scheduleFrontOptionsForCity(value)[0]?.value ?? "";
    setSector(next?.sector ?? firstFront);
    setMonth(next?.schedule_month ?? currentScheduleMonth());
  }

  function chooseSector(value: string) {
    setSector(value);
    const next = summaries.find((item) => item.city === city && item.sector === value);
    setMonth(next?.schedule_month ?? currentScheduleMonth());
  }

  async function updateFromSheets() {
    if (!city || !sector || !month) {
      toast.error("Selecione cidade, frente e mês.");
      return;
    }
    setSyncingSheets(true);
    try {
      // First prefer the specific operational spreadsheet linked to this period.
      // Legacy schedule-sync still serves the old fixed-ID Google Sheets.
      const operational = await latestOperationalSource(city, sector, month);
      if (operational) {
        const result = await syncOperationalSheet(operational.id);
        setOperationalRefreshKey((x) => x + 1);
        await loadSummaries();
        toast.success(
          result.changes
            ? result.changes + " alteração(ões) recebida(s) do Google Sheets editável."
            : "Escala editável já está atualizada. Nenhuma mudança nova.",
        );
        return;
      }
      const result = await syncScheduleFromSheets(city, sector, month);
      await loadSummaries();
      setCity(result.city);
      setSector(result.front);
      setMonth(result.scheduleMonth);
      toast.success(
        `Google Sheets atualizado: ${result.employeeCount} colaboradores e ${result.entryCount} marcações.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a escala pelo Google Sheets.",
      );
    } finally {
      setSyncingSheets(false);
    }
  }

  async function exportExcelReport() {
    if (!schedule) {
      toast.error("Selecione uma escala para gerar o relatório.");
      return;
    }
    setExportingReport(true);
    try {
      await downloadScheduleReport(schedule);
      toast.success("Relatório Excel gerado com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar o relatório Excel.",
      );
    } finally {
      setExportingReport(false);
    }
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

  const periodControls = (
    <>
      <Button
        size="sm"
        variant={!dutyScope ? "default" : "ghost"}
        aria-pressed={!dutyScope}
        disabled={!month}
        onClick={() => setDutyScope(null)}
      >
        <CalendarDays className="size-3.5" />
        Mês completo
      </Button>
      <Button
        size="sm"
        variant={dutyScope === "day" ? "default" : "ghost"}
        aria-pressed={dutyScope === "day"}
        disabled={!month}
        onClick={() => setDutyScope(dutyScope === "day" ? null : "day")}
      >
        <UserCheck className="size-3.5" />
        Atividade no dia
      </Button>
      <Button
        size="sm"
        variant={dutyScope === "month" ? "default" : "ghost"}
        aria-pressed={dutyScope === "month"}
        disabled={!month}
        onClick={() => setDutyScope(dutyScope === "month" ? null : "month")}
      >
        Atividade no mês
      </Button>
      {dutyScope === "day" && (
        <Input
          aria-label="Data do plantão / atividade"
          type="date"
          value={dutyDate}
          min={monthDates[0]}
          max={monthDates.at(-1)}
          onChange={(e) => setDutyDateChoice(e.target.value)}
          className="h-8 w-auto text-xs"
        />
      )}
    </>
  );
  return (
    <AppShell fullWidth>
      <div className="schedule-layout">
        <header className="schedule-page-header">
          <div className="schedule-page-brand">
            <span className="schedule-brand-icon">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <h1>Escala da equipe</h1>
              <p>
                {cityLabel(city)} · {sectorLabel(sector)}
                {month && (
                  <>
                    {" "}
                    · <span className="capitalize">{monthLabel(month)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="schedule-page-actions">
            <ScheduleControlAccessShortcut
              role={profile?.role}
              onRequest={() => setAccessRequestOpen(true)}
              onReview={() => setAccessDialogOpen(true)}
            />
            {canManageSchedules && (
              <>
                <Button
                  size="sm"
                  onClick={() => void updateFromSheets()}
                  disabled={syncingSheets || loading || !city || !sector || !month}
                >
                  {syncingSheets ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  <span>{syncingSheets ? "Atualizando..." : "Atualizar via API"}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGeneratorOpen(true)}
                  disabled={loading || syncingSheets || !city || !sector || !month}
                >
                  <Sparkles className="size-3.5" />
                  <span>Gerar prévia 5x2</span>
                </Button>
              </>
            )}
            {scopeAccess.allowed &&
              schedule &&
              schedule.id === selectedSummaryId &&
              !loadingSchedule && (
                <SchedulePdfButton
                  people={schedule.payload.people}
                  month={schedule.schedule_month}
                  city={cityLabel(city)}
                  sector={sectorLabel(sector)}
                  notes={dateNotes}
                  filterDescription="Escala completa da equipe"
                />
              )}
            {(isAdmin || canUseSuggestions || canManageSchedules) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="Mais ações da escala">
                    <MoreHorizontal className="size-4" />
                    <span>Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  {canManageSchedules && (
                    <>
                      {schedule?.source_file.startsWith("Google Sheets") && (
                        <DropdownMenuItem
                          disabled={syncingSheets || loadingSchedule}
                          onSelect={() => setOfficialEditOpen(true)}
                        >
                          <Pencil className="size-4" />
                          Editar escala oficial
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={!city || !sector || !month}
                        onSelect={() => setOperationalOpen(true)}
                      >
                        <History className="size-4" />
                        Escala editável e histórico
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={exportingReport || !schedule}
                        onSelect={() => void exportExcelReport()}
                      >
                        <FileSpreadsheet className="size-4" />
                        {exportingReport ? "Gerando relatório..." : "Relatório Excel"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={syncingSheets || exportingReport}
                        onSelect={() => setImportOpen(true)}
                      >
                        <Upload className="size-4" />
                        Importar Excel
                      </DropdownMenuItem>
                    </>
                  )}
                  {canUseSuggestions && (
                    <DropdownMenuItem onSelect={() => setSuggestionsOpen(true)}>
                      <Lightbulb className="size-4" />
                      Sugestões
                    </DropdownMenuItem>
                  )}
                  {isAdmin &&
                    schedule?.source_file === "Google Sheets - Escala operacional oficial" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setDeleteMonthOpen(true)}
                        >
                          <Trash2 className="size-4" /> Excluir escala e aba no Sheets
                        </DropdownMenuItem>
                      </>
                    )}
                  {canManageSchedules &&
                    schedule &&
                    schedule.source_file !== "Google Sheets - Escala operacional oficial" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => void removeCurrentSchedule()}
                        >
                          <Trash2 className="size-4" />
                          Excluir escala importada
                        </DropdownMenuItem>
                      </>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        <section className="schedule-scope-filters" aria-label="Cidade, frente e competência">
          <FilterSelect
            label="Cidade"
            value={city}
            placeholder="Selecione a cidade"
            options={SCHEDULE_CITY_OPTIONS}
            onChange={chooseCity}
          />
          <FilterSelect
            label="Frente"
            value={sector}
            placeholder="Selecione a frente"
            options={frontOptions}
            onChange={chooseSector}
          />
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="schedule-month">Mês da escala / geração</Label>
            <Input
              id="schedule-month"
              type="month"
              value={month.slice(0, 7)}
              onChange={(e) => setMonth(e.target.value ? e.target.value + "-01" : "")}
            />
          </div>
        </section>
        {scopeAccess.allowed &&
          city &&
          sector &&
          month &&
          (isAdmin ||
            sector !== "controle-operacional" ||
            selectedSummary?.source_file === "Google Sheets - Escala operacional oficial") && (
            <div className="schedule-source-wrapper">
              <ScheduleOperationalPreview
                city={city}
                sector={sector}
                month={month}
                refreshKey={operationalRefreshKey}
                official={
                  selectedSummary?.source_file === "Google Sheets - Escala operacional oficial"
                }
                canOpenSheet={isAdmin}
              />
            </div>
          )}
        <div className="schedule-page-content">
          {!scopeAccess.allowed ? (
            <ScheduleControlAccessGate
              key={city}
              city={city}
              cityLabel={cityLabel(city)}
              loading={scopeAccess.loading}
              error={scopeAccess.error}
              request={scopeAccess.request}
              onRefresh={() => void scopeAccess.refetch()}
            />
          ) : loading ? (
            <LoadingCard label="Carregando escalas..." />
          ) : summaries.length === 0 ? (
            <EmptySchedule
              {...(canManageSchedules ? { onImport: () => setImportOpen(true) } : {})}
            />
          ) : !selectedSummary ? (
            <section className="schedule-empty">
              <CalendarDays className="size-8" />
              <h2>Nenhuma escala oficial publicada neste filtro</h2>
              <p>
                {canManageSchedules
                  ? generatorSourceSummary
                    ? `Ainda não existe escala publicada para ${monthLabel(month)}. Use Gerar prévia 5x2 com base em ${monthLabel(previousMonth)}.`
                    : `Importe ou sincronize ${monthLabel(previousMonth)} para gerar a nova escala.`
                  : "Escolha outra cidade, frente ou mês."}
              </p>
              {canManageSchedules && (
                <Button variant="outline" onClick={() => setGeneratorOpen(true)}>
                  <Sparkles className="size-4" />
                  Gerar prévia 5x2
                </Button>
              )}
            </section>
          ) : loadingSchedule || !schedule ? (
            <LoadingCard label="Abrindo a escala..." />
          ) : (
            <ScheduleTeamWorkspace
              key={schedule.id}
              schedule={schedule}
              city={cityLabel(city)}
              sector={sectorLabel(sector)}
              people={eligiblePeople}
              selectedNames={visibleSelectedNames}
              onSelectionChange={choosePeople}
              search={personSearch}
              onSearchChange={setPersonSearch}
              notes={dateNotes}
              isAdmin={isAdmin}
              onOpenNote={openDateNote}
              onShowPerson={showPerson}
              filterDescription={dutyFilterDescription}
              periodControls={periodControls}
            />
          )}
        </div>
      </div>
      {scopeAccess.allowed && schedule && schedule.id === selectedSummaryId && (
        <SchedulePersonDialog
          key={schedule.id + schedule.updated_at}
          ref={personDialog}
          schedule={schedule}
          notes={dateNotes}
          isAdmin={isAdmin}
          filterDescription={dutyFilterDescription}
          onOpenNote={openDateNote}
        />
      )}

      {isAdmin && (
        <ScheduleMonthDeleteDialog
          open={deleteMonthOpen}
          onOpenChange={setDeleteMonthOpen}
          schedule={schedule}
          onDeleted={async () => {
            setSchedule(null);
            setOperationalRefreshKey((value) => value + 1);
            await loadSummaries();
          }}
        />
      )}
      {!isAdmin && profile && (
        <ScheduleControlAccessRequestDialog
          open={accessRequestOpen}
          onOpenChange={setAccessRequestOpen}
          userId={profile.id}
          initialCity={city}
          onViewSchedule={(targetCity) => {
            setCity(targetCity);
            setSector("controle-operacional");
            const published = summaries.find(
              (item) => item.city === targetCity && item.sector === "controle-operacional",
            );
            setMonth(published?.schedule_month || month || currentScheduleMonth());
          }}
        />
      )}
      {isAdmin && (
        <ScheduleControlAccessDialog
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
          userId={profile?.id ?? ""}
        />
      )}
      {canManageSchedules && scopeAccess.allowed && (
        <ScheduleOfficialEditDialog
          open={officialEditOpen}
          onOpenChange={setOfficialEditOpen}
          schedule={schedule}
          onSaved={async () => {
            await loadSummaries();
            setOperationalRefreshKey((x) => x + 1);
          }}
        />
      )}
      {canManageSchedules && (
        <ScheduleGeneratorDialog
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          sourceSummary={generatorSourceSummary}
          city={city}
          sector={sector}
          targetMonth={month}
          userId={profile?.id ?? ""}
          isAdmin={isAdmin}
          onPublished={async () => {
            await loadSummaries();
            setOperationalRefreshKey((x) => x + 1);
          }}
        />
      )}
      {canManageSchedules && (
        <ScheduleOperationalDialog
          open={operationalOpen}
          onOpenChange={setOperationalOpen}
          city={city}
          sector={sector}
          month={month}
          canOpenSheet={isAdmin}
          onSynced={async () => {
            await loadSummaries();
            setOperationalRefreshKey((x) => x + 1);
          }}
        />
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
    <div className="grid min-w-0 gap-1.5">
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
          ? "Atualize pelo Google Sheets ou selecione cidade, frente e uma aba do Excel para importação manual."
          : "Assim que um gestor ou supervisor atualizar uma escala, ela ficará disponível aqui para consulta."}
      </p>
      {onImport && (
        <Button className="mt-5" onClick={onImport}>
          <Upload className="size-4" /> Importar primeira escala
        </Button>
      )}
    </section>
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
  const frontOptions = useMemo(() => scheduleFrontOptionsForCity(city), [city]);

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
      toast.error("Selecione cidade, frente, arquivo e aba.");
      return;
    }
    if (
      willReplace &&
      !window.confirm("Já existe uma escala para esta cidade, frente e mês. Deseja substituí-la?")
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
            Cidade e frente fazem parte da identificação da escala. Uma nova importação no mesmo mês
            substitui a anterior.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <FilterSelect
            label="Cidade"
            value={city}
            placeholder="Selecione a cidade"
            options={SCHEDULE_CITY_OPTIONS}
            onChange={(value) => {
              setCity(value);
              const options = scheduleFrontOptionsForCity(value);
              if (!options.some((option) => option.value === sector)) {
                setSector(options[0]?.value ?? "");
              }
            }}
          />
          <FilterSelect
            label="Frente"
            value={sector}
            placeholder="Selecione a frente"
            options={frontOptions}
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
                Já existe uma escala nesta cidade, frente e mês. A confirmação substituirá os dados
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
