import { useMemo, useState } from "react";
import {
  CalendarDays,
  Users,
  Table2,
  Search,
  SlidersHorizontal,
  Download,
  Maximize,
  Minimize,
  FileText,
  Image,
  Info,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ScheduleComparisonTable } from "@/components/ScheduleComparisonTable";
import { SchedulePeoplePicker } from "@/components/SchedulePeoplePicker";
import { SchedulePdfButton } from "@/components/SchedulePdfButton";
import type { SchedulePerson, ScheduleUpload, ScheduleDateNote } from "@/lib/types";
import { scheduleMonthDates, SCHEDULE_KIND_STYLE } from "@/lib/schedule-view";
import {
  filterScheduleTeam,
  scheduleRoleDetails,
  schedulePersonStats,
  scheduleVisibleDates,
  scheduleTeamCsv,
} from "@/lib/schedule-dashboard";
import { scheduleCodeKind } from "@/lib/schedule-import";
import { todayKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const kindLabels = {
  work: "Em atividade",
  off: "De folga",
  vacation: "Em férias",
  certificate: "Atestados",
  absence: "Faltas",
  leave: "Afastamentos",
  unknown: "Sem marcação",
};
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  });
export function ScheduleTeamWorkspace({
  schedule,
  city,
  sector,
  people,
  selectedNames,
  onSelectionChange,
  search,
  onSearchChange,
  notes,
  isAdmin,
  onOpenNote,
  onShowPerson,
  filterDescription,
  periodControls,
}: {
  schedule: ScheduleUpload;
  city: string;
  sector: string;
  people: SchedulePerson[];
  selectedNames: string[];
  onSelectionChange: (names: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  notes: ScheduleDateNote[];
  isAdmin: boolean;
  onOpenNote: (date: string) => void;
  onShowPerson: (name: string, date: string | undefined, queue: SchedulePerson[]) => void;
  filterDescription: string;
  periodControls: React.ReactNode;
}) {
  const [view, setView] = useState<"map" | "calendar" | "people">("map"),
    [compact, setCompact] = useState(true);
  const [kind, setKind] = useState(""),
    [area, setArea] = useState(""),
    [base, setBase] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false),
    [dayOpen, setDayOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [exporting, setExporting] = useState(false);
  const dates = scheduleMonthDates(schedule.schedule_month),
    displayDates = scheduleVisibleDates(schedule.schedule_month, schedule.payload.dates);
  const [activeDate, setActiveDate] = useState(() =>
    dates.includes(todayKey()) ? todayKey() : dates[0]!,
  );
  const { theme } = useTheme();
  const monthLabel = new Date(schedule.schedule_month + "T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const selected = new Set(selectedNames);
  const matching = useMemo(
    () => filterScheduleTeam(people, search, kind, area, base),
    [people, search, kind, area, base],
  );
  const visible = matching.filter((p) => selected.has(p.name));
  const details = people.map((p) => scheduleRoleDetails(p.jobTitle));
  const options = [
    {
      value: kind,
      set: setKind,
      label: "Todas as funções",
      values: [...new Set(details.map((d) => d.kind))],
    },
    {
      value: area,
      set: setArea,
      label: "Todas as áreas",
      values: [...new Set(details.map((d) => d.area))],
    },
    {
      value: base,
      set: setBase,
      label: "Todas as bases",
      values: [...new Set(details.flatMap((d) => d.bases))],
    },
  ];
  const stats = visible.map((p) => schedulePersonStats(p, schedule.schedule_month));
  const total = (field: "duty" | "work" | "off" | "vacation") =>
    stats.reduce((sum, s) => sum + s[field], 0);
  function reset() {
    setKind("");
    setArea("");
    setBase("");
    onSearchChange("");
  }
  function openDay(date: string) {
    setActiveDate(date);
    setDayOpen(true);
  }
  function showPerson(name: string, date?: string) {
    setDayOpen(false);
    onShowPerson(name, date, visible);
  }
  async function imageExport() {
    setExporting(true);
    try {
      const { downloadScheduleImage } = await import("@/lib/schedule-image");
      const count = await downloadScheduleImage({
        people: visible,
        month: schedule.schedule_month,
        city,
        sector,
        notes,
        theme,
      });
      toast.success(
        count > 1 ? "Imagens reunidas em um arquivo ZIP." : "Download da imagem iniciado.",
      );
    } catch {
      toast.error("Não foi possível exportar a imagem.");
    } finally {
      setExporting(false);
    }
  }
  function csvExport() {
    const url = URL.createObjectURL(
      new Blob([scheduleTeamCsv(visible, schedule.schedule_month)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Escala-" + schedule.schedule_month.slice(0, 7) + ".csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector(".schedule-layout")?.requestFullscreen();
    } catch {
      toast.error("Use F11 para ampliar o painel.");
    }
  }
  const grouped = Object.entries(kindLabels)
    .map(([key, label]) => ({
      key,
      label,
      people: visible.filter((p) => {
        const code = p.assignments[activeDate] || "";
        return (code ? scheduleCodeKind(code) : "unknown") === key;
      }),
    }))
    .filter((g) => g.people.length);
  const note = notes.find((n) => n.note_date === activeDate);
  const dayDetails = (
    <>
      <div className="schedule-day-heading">
        <div>
          <small>Equipe do dia</small>
          <h3>{dateLabel(activeDate)}</h3>
          <p>
            {
              visible.filter(
                (p) =>
                  p.assignments[activeDate] &&
                  scheduleCodeKind(p.assignments[activeDate]!) === "work",
              ).length
            }{" "}
            em atividade · {visible.length} na seleção
          </p>
        </div>
        <div className="flex gap-1">
          {([-1, 1] as const).map((step) => (
            <Button
              key={step}
              variant="ghost"
              size="icon"
              aria-label={step < 0 ? "Dia anterior" : "Próximo dia"}
              disabled={!dates.includes(dates[dates.indexOf(activeDate) + step] || "")}
              onClick={() => setActiveDate(dates[dates.indexOf(activeDate) + step]!)}
            >
              {step < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          ))}
        </div>
      </div>
      {(isAdmin || note) && (
        <Button
          variant="outline"
          size="sm"
          className="m-3"
          onClick={() => {
            setDayOpen(false);
            onOpenNote(activeDate);
          }}
        >
          <StickyNote className="size-3.5" />
          {note ? "Ver observação" : "Adicionar observação"}
        </Button>
      )}
      {note && (
        <p className="mx-4 mb-3 whitespace-pre-wrap rounded-lg bg-primary/5 p-3 text-xs">
          {note.body}
        </p>
      )}
      <div className="schedule-day-list">
        {grouped.map((group) => (
          <section key={group.key}>
            <h4>
              {group.label}
              <span>{group.people.length}</span>
            </h4>
            {group.people.map((p) => (
              <button key={p.name} type="button" onClick={() => showPerson(p.name, activeDate)}>
                <span className="schedule-avatar">
                  {p.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <span className="min-w-0">
                  <b>{p.name}</b>
                  <small>{p.jobTitle || "Função não informada"}</small>
                </span>
                <span className="ml-auto shrink-0 text-[10px] font-bold">
                  {p.assignments[activeDate] || "—"}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
  return (
    <div className={cn("schedule-team-workspace", compact && view === "map" && "is-compact")}>
      <div className="schedule-filterbar">
        <div className="schedule-period-switch">{periodControls}</div>
        <div className="schedule-team-filters">
          <div className="relative min-w-0">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar colaborador"
              placeholder="Buscar colaborador, login..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {options.map((option) => (
            <select
              key={option.label}
              aria-label={option.label}
              value={option.value}
              onChange={(e) => option.set(e.target.value)}
            >
              <option value="">{option.label}</option>
              {option.values
                .sort((a, b) => a.localeCompare(b, "pt-BR"))
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          ))}
          <button type="button" className="schedule-reset" onClick={reset}>
            Limpar filtros
          </button>
        </div>
      </div>
      {(!compact || view !== "map") && (
        <div className="schedule-metrics">
          {[
            [visible.length, "Colaboradores"],
            [total("work"), "Dias em atividade"],
            [total("off"), "Folgas"],
            [total("vacation"), "Dias de férias"],
          ].map(([value, label]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
      )}
      <section className="schedule-board">
        <div className="schedule-board-toolbar">
          <div className="min-w-0">
            <h2>
              {view === "map"
                ? "Mapa da escala"
                : view === "calendar"
                  ? "Calendário da equipe"
                  : "Escala por colaborador"}
            </h2>
            <p>
              {visible.length} de {schedule.employee_count} colaboradores ·{" "}
              <span className="capitalize">{monthLabel}</span>
            </p>
          </div>
          <div className="schedule-board-actions">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <SlidersHorizontal className="size-3.5" />
              <span className="hidden sm:inline">Colaboradores</span>
              <span>{selectedNames.length}</span>
            </Button>
            <div className="schedule-view-switch" role="group" aria-label="Forma de visualização">
              {(
                [
                  { id: "map", label: "Mapa", Icon: Table2 },
                  { id: "calendar", label: "Calendário", Icon: CalendarDays },
                  { id: "people", label: "Pessoas", Icon: Users },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  aria-label={label}
                  onClick={() => setView(id)}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {view === "map" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCompact(!compact)}
                aria-pressed={compact}
              >
                {compact ? <Maximize className="size-3.5" /> : <Minimize className="size-3.5" />}
                <span className="hidden lg:inline">
                  {compact ? "Visão detalhada" : "Visão compacta"}
                </span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!visible.length || exporting}>
                  {exporting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void imageExport()}>
                  <Image className="size-4" />
                  Salvar imagem / ZIP
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={csvExport}>
                  <FileText className="size-4" />
                  CSV da seleção
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Abrir em tela cheia"
              onClick={() => void fullscreen()}
            >
              <Maximize className="size-3.5" />
            </Button>
          </div>
        </div>
        {!visible.length ? (
          <div className="schedule-empty">
            <Search className="size-8" />
            <h3>Nenhum colaborador nesta seleção</h3>
            <p>Revise os filtros e a seleção de colaboradores.</p>
            <Button variant="outline" onClick={reset}>
              Limpar filtros
            </Button>
            <Button variant="ghost" onClick={() => onSelectionChange(people.map((p) => p.name))}>
              Selecionar equipe
            </Button>
          </div>
        ) : view === "map" ? (
          <ScheduleComparisonTable
            people={visible}
            month={schedule.schedule_month}
            city={city}
            sector={sector}
            notes={notes}
            isAdmin={isAdmin}
            onOpenNote={onOpenNote}
            onShowPerson={showPerson}
            onOpenDay={openDay}
            onOpenCell={showPerson}
            compact={compact}
            showToolbar={false}
            dates={displayDates}
            filterDescription={filterDescription}
          />
        ) : view === "people" ? (
          <div className="schedule-person-cards">
            {visible.map((p) => {
              const stats = schedulePersonStats(p, schedule.schedule_month);
              return (
                <button type="button" key={p.name} onClick={() => showPerson(p.name)}>
                  <div className="flex items-center gap-3">
                    <span className="schedule-avatar">
                      {p.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <div className="min-w-0 text-left">
                      <h3>{p.name}</h3>
                      <p>{[p.login, p.jobTitle].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="schedule-person-card-stats">
                    <span>
                      <b>{stats.work}</b>atividade
                    </span>
                    <span>
                      <b>{stats.off}</b>folgas
                    </span>
                    <span>
                      <b>{stats.vacation}</b>férias
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    Ver escala individual →
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="schedule-calendar-workspace">
            <div className="schedule-team-calendar">
              <div className="schedule-weekdays">
                {weekdays.map((day) => (
                  <b key={day}>{day}</b>
                ))}
              </div>
              <div className="schedule-calendar-days">
                {Array.from({ length: new Date(dates[0]! + "T12:00:00").getDay() }, (_, i) => (
                  <span className="schedule-calendar-blank" key={"blank" + i} />
                ))}
                {dates.map((date) => {
                  const work = visible.filter(
                      (p) =>
                        p.assignments[date] && scheduleCodeKind(p.assignments[date]!) === "work",
                    ).length,
                    off = visible.filter(
                      (p) =>
                        p.assignments[date] && scheduleCodeKind(p.assignments[date]!) === "off",
                    ).length;
                  return (
                    <button
                      type="button"
                      key={date}
                      aria-pressed={activeDate === date}
                      onClick={() => setActiveDate(date)}
                    >
                      <b>
                        {Number(date.slice(8))}
                        {notes.some((n) => n.note_date === date) && (
                          <StickyNote className="size-3" />
                        )}
                      </b>
                      <strong>
                        {work}
                        <small> em atividade</small>
                      </strong>
                      <span>{off} de folga</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <aside className="schedule-day-aside" aria-label="Equipe da data selecionada">
              {dayDetails}
            </aside>
          </div>
        )}
      </section>
      <footer className="schedule-board-footer">
        <button type="button" onClick={() => setInfoOpen(true)}>
          <Info className="size-3.5" />
          Fonte e critérios
        </button>
        <span>Atualizado em {new Date(schedule.imported_at).toLocaleString("pt-BR")}</span>
        <SchedulePdfButton
          people={visible}
          month={schedule.schedule_month}
          city={city}
          sector={sector}
          notes={notes}
          filterDescription={filterDescription}
        />
      </footer>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar colaboradores</DialogTitle>
            <DialogDescription>
              A seleção limita a consulta e as exportações. Nenhuma escala é alterada.
            </DialogDescription>
          </DialogHeader>
          <SchedulePeoplePicker
            people={matching}
            selectedNames={selectedNames}
            search={search}
            onSearchChange={onSearchChange}
            onSelectionChange={onSelectionChange}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent
          overlayClassName="bg-black/60 backdrop-blur-sm"
          className="schedule-day-dialog max-h-[88vh] max-w-xl overflow-y-auto"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Equipe em {dateLabel(activeDate)}</DialogTitle>
            <DialogDescription>Escalas dos colaboradores selecionados na data.</DialogDescription>
          </DialogHeader>
          {dayDetails}
        </DialogContent>
      </Dialog>
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fonte e critérios da escala</DialogTitle>
            <DialogDescription>
              {city} · {sector} · {monthLabel}
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Origem</dt>
              <dd>{schedule.source_file}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Aba</dt>
              <dd>{schedule.source_sheet}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Registros</dt>
              <dd>
                {schedule.employee_count} colaboradores · {schedule.entry_count} marcações
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            A tela usa a escala sincronizada no sistema. As cores representam os códigos originais.
            Plantões marcados contam somente códigos P ou PLANTÃO, sem presumir plantão por ser fim
            de semana. Filtros e visualizações não modificam o planejamento.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
