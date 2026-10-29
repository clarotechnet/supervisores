import { SchedulePdfButton } from "@/components/SchedulePdfButton";
import type { SchedulePerson, ScheduleDateNote } from "@/lib/types";
import { SCHEDULE_CITY_OPTIONS, SCHEDULE_SECTOR_OPTIONS } from "@/lib/types";
import { scheduleMonthDates, SCHEDULE_KIND_STYLE } from "@/lib/schedule-view";
import { scheduleCodeKind } from "@/lib/schedule-import";
import { schedulePersonStats, schedulePreviousDate } from "@/lib/schedule-dashboard";
import { isLunchExcludedM2 } from "@/lib/schedule-report";
import { todayKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { StickyNote } from "lucide-react";
const dateFromIso = (value: string) => new Date(value.slice(0, 10) + "T12:00:00");
const monthLabel = (value: string) =>
  dateFromIso(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const cityLabel = (value: string) =>
  SCHEDULE_CITY_OPTIONS.find((o) => o.value === value)?.label || value;
const sectorLabel = (value: string) =>
  SCHEDULE_SECTOR_OPTIONS.find((o) => o.value === value)?.label || value;
export function SchedulePersonDetails({
  person,
  month,
  sector,
  city,
  filterDescription,
  notes,
  isAdmin,
  onOpenNote,
  focusDate,
}: {
  person: SchedulePerson;
  month: string;
  sector: string;
  city: string;
  filterDescription: string;
  notes: ScheduleDateNote[];
  isAdmin: boolean;
  onOpenNote: (date: string) => void;
  focusDate?: string;
}) {
  const firstDay = dateFromIso(month);
  const year = firstDay.getFullYear();
  const monthIndex = firstDay.getMonth();
  const leadingDays = new Date(year, monthIndex, 1).getDay();
  const dates = scheduleMonthDates(month);
  const entries = dates
    .map((date) => ({ date, code: person.assignments[date] ?? "" }))
    .filter((entry) => entry.code);
  const activityDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "work");
  const m2ExcludedDays = activityDays.filter((entry) => isLunchExcludedM2(sector, entry.code));
  const workDays = activityDays.filter((entry) => !isLunchExcludedM2(sector, entry.code));
  const offDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "off");
  const absenceDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "absence");
  const certificateDays = entries.filter((entry) => scheduleCodeKind(entry.code) === "certificate");
  const nextWork = activityDays.find((entry) => entry.date >= todayKey());

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{person.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[person.login, person.jobTitle || "Função não informada"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nextWork && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary">
              Próximo turno: {dateFromIso(nextWork.date).toLocaleDateString("pt-BR")} ·{" "}
              {nextWork.code}
            </span>
          )}
          <SchedulePdfButton
            people={[person]}
            month={month}
            city={cityLabel(city)}
            sector={sectorLabel(sector)}
            notes={notes}
            filterDescription={filterDescription}
          />
        </div>
      </div>

      <div className="schedule-person-kpis">
        <MiniKpi label="Plantões marcados" value={schedulePersonStats(person, month).duty} />
        <MiniKpi label="Dias em atividade" value={activityDays.length} />
        <MiniKpi label="Folgas" value={offDays.length} />
        <MiniKpi label="Dias de férias" value={schedulePersonStats(person, month).vacation} />
      </div>
      {focusDate && person.assignments[focusDate] && (
        <div
          className={cn(
            "schedule-person-day-summary",
            SCHEDULE_KIND_STYLE[scheduleCodeKind(person.assignments[focusDate]!)],
          )}
        >
          <b>
            {dateFromIso(focusDate).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              weekday: "long",
            })}
          </b>
          <span>{person.assignments[focusDate]}</span>
        </div>
      )}
      {person.assignments[schedulePreviousDate(month)] && (
        <div className="schedule-person-previous">
          <b>
            {dateFromIso(schedulePreviousDate(month)).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}{" "}
            · Dia anterior ao mês
          </b>
          <span>{person.assignments[schedulePreviousDate(month)]}</span>
        </div>
      )}
      <div className="mt-4">
        <h4 className="text-xs font-bold">Plantões marcados no mês</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {schedulePersonStats(person, month).dutyDates.length ? (
            schedulePersonStats(person, month).dutyDates.map((date) => (
              <span
                key={date}
                className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
              >
                {dateFromIso(date).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  weekday: "short",
                })}
              </span>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum código P ou PLANTÃO informado.</p>
          )}
        </div>
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
        <div className="schedule-person-modal-calendar grid grid-cols-7 bg-border/50 gap-px">
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
                  "min-h-16 bg-card p-2 text-left transition-colors",
                  focusDate === date && "ring-2 ring-inset ring-primary",
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
                      SCHEDULE_KIND_STYLE[kind],
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

      <details className="mt-4 rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-xs font-bold">Detalhamento da atividade</summary>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniKpi label="Dias com marcação" value={entries.length} />
          <MiniKpi label="Trabalho (sem M.2)" value={workDays.length} />
          <MiniKpi label="M.2 até 12h" value={m2ExcludedDays.length} />
          <MiniKpi label="Faltas" value={absenceDays.length} />
          <MiniKpi label="Atestados" value={certificateDays.length} />
        </div>
      </details>
      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <Legend color="bg-primary" label="Trabalho / turno" />
        <Legend color="bg-slate-700 dark:bg-slate-200" label="Folga" />
        <Legend color="bg-warning" label="Férias" />
        <Legend color="bg-navy" label="Licença / afastamento" />
        <Legend color="bg-red-600" label="FALTA · Falta no dia" />
        <Legend color="bg-teal-600" label="AT · Atestado" />
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
