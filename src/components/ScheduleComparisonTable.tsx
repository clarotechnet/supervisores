import { useEffect, useRef, useState } from "react";
import { Download, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SchedulePdfButton } from "@/components/SchedulePdfButton";
import type { ScheduleDateNote, SchedulePerson } from "@/lib/types";
import { scheduleCodeKind } from "@/lib/schedule-import";
import {
  compactScheduleCode,
  scheduleMonthDates,
  SCHEDULE_KIND_STYLE,
  SCHEDULE_T2_STYLE,
} from "@/lib/schedule-view";
import { isMarkedScheduleDuty } from "@/lib/schedule-dashboard";
import { todayKey } from "@/lib/date-utils";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function ScheduleComparisonTable({
  people,
  month,
  city,
  sector,
  notes,
  isAdmin,
  onOpenNote,
  onShowPerson,
  filterDescription,
  compact = false,
  showToolbar = true,
  dates: providedDates,
  onOpenDay,
  onOpenCell,
}: {
  people: SchedulePerson[];
  month: string;
  city: string;
  sector: string;
  notes: ScheduleDateNote[];
  isAdmin: boolean;
  onOpenNote: (date: string) => void;
  onShowPerson: (name: string) => void;
  filterDescription?: string | undefined;
  compact?: boolean;
  showToolbar?: boolean;
  dates?: string[] | undefined;
  onOpenDay?: ((date: string) => void) | undefined;
  onOpenCell?: ((name: string, date: string) => void) | undefined;
}) {
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compact || !scrollRef.current) return;
    const element = scrollRef.current;
    const resize = () => {
      const table = element.querySelector("table");
      if (!table) return;
      const reserved =
        (table.tHead?.getBoundingClientRect().height || 0) +
        (table.tFoot?.getBoundingClientRect().height || 0) +
        people.length +
        6;
      const row = Math.max(
        13,
        Math.min(27, Math.floor((element.clientHeight - reserved) / Math.max(1, people.length))),
      );
      element.style.setProperty("--schedule-row-height", row + "px");
      element.style.setProperty(
        "--schedule-row-font",
        Math.max(8, Math.min(11, row * 0.62)) + "px",
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [compact, people.length, month]);
  const { theme } = useTheme(),
    dates = providedDates || scheduleMonthDates(month),
    today = todayKey();
  const notesByDate = new Map(notes.map((note) => [note.note_date, note]));
  const formattedMonth = new Date(month.slice(0, 7) + "-01T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  async function saveImage() {
    setExporting(true);
    try {
      const { downloadScheduleImage } = await import("@/lib/schedule-image");
      await downloadScheduleImage({ people, month, city, sector, notes, theme });
      toast.success("Download da imagem iniciado.");
    } catch {
      toast.error("Não foi possível salvar a imagem.");
    } finally {
      setExporting(false);
    }
  }
  const totals = dates.map((date) => {
    const codes = people.map((p) => p.assignments[date] || "");
    const count = (kind: string) =>
      codes.filter((code) => code.trim() && scheduleCodeKind(code) === kind).length;
    return {
      date,
      work: count("work"),
      off: count("off"),
      vacation: count("vacation"),
      duty: codes.filter(isMarkedScheduleDuty).length,
    };
  });
  return (
    <div className={cn("schedule-map w-full min-w-0 max-w-full", compact && "is-compact")}>
      {showToolbar && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="schedule-comparison-heading" className="text-lg font-bold">
              Mapa da escala
            </h3>
            <p className="text-xs text-muted-foreground">
              {people.length} colaboradores · {formattedMonth}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void saveImage()} disabled={exporting}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Salvar imagem
            </Button>
            <SchedulePdfButton
              people={people}
              month={month}
              city={city}
              sector={sector}
              notes={notes}
              filterDescription={filterDescription}
            />
          </div>
        </div>
      )}
      <div
        role="region"
        aria-label={"Mapa da escala de " + formattedMonth}
        tabIndex={0}
        ref={scrollRef}
        className="schedule-map-scroll focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <table className="schedule-map-table">
          <caption className="sr-only">
            Escala de {formattedMonth}. Clique no nome ou no código para ver os detalhes; no
            cabeçalho, a equipe do dia.
          </caption>
          <colgroup>
            <col className="schedule-name-column" />
            {dates.map((date) => (
              <col key={date} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="schedule-person-cell" scope="col">
                Colaborador / função
              </th>
              {dates.map((date) => {
                const previous = !date.startsWith(month.slice(0, 7)),
                  hasNote = notesByDate.has(date);
                return (
                  <th
                    key={date}
                    scope="col"
                    aria-current={date === today ? "date" : undefined}
                    className={cn(
                      "schedule-date-cell",
                      new Date(date + "T12:00:00").getDay() === 0 && "text-primary",
                      previous && "text-muted-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDay ? onOpenDay(date) : (isAdmin || hasNote) && onOpenNote(date)
                      }
                      aria-label={"Equipe em " + date.slice(8) + "/" + date.slice(5, 7)}
                      title={previous ? "Último dia do mês anterior" : "Ver equipe deste dia"}
                    >
                      <span>{WEEKDAYS[new Date(date + "T12:00:00").getDay()]}</span>
                      <b>
                        {previous ? date.slice(8) + "/" + date.slice(5, 7) : date.slice(8)}
                        {hasNote && <StickyNote className="size-2.5" />}
                      </b>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((person, index) => (
              <tr key={person.name + "-" + index}>
                <th scope="row" className="schedule-person-cell">
                  <button
                    type="button"
                    onClick={() => onShowPerson(person.name)}
                    aria-label={"Ver escala de " + person.name}
                    title={person.name}
                  >
                    <span className="schedule-row-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <b className="block truncate">{person.name}</b>
                      <small className="schedule-person-role block truncate">
                        {[person.login, person.jobTitle].filter(Boolean).join(" · ") ||
                          "Função não informada"}
                      </small>
                    </span>
                  </button>
                </th>
                {dates.map((date) => {
                  const code = person.assignments[date]?.trim() || "",
                    kind = code ? scheduleCodeKind(code) : null;
                  const short = compactScheduleCode(code).replace(
                    /^([tm])\.\s*(\d+)$/i,
                    (_, shift: string, n: string) => shift.toUpperCase() + n,
                  );
                  return (
                    <td key={date}>
                      <button
                        type="button"
                        className={cn(
                          "schedule-code",
                          kind
                            ? SCHEDULE_KIND_STYLE[kind]
                            : "border-transparent bg-secondary/40 text-muted-foreground",
                          short === "T2" && SCHEDULE_T2_STYLE,
                          isMarkedScheduleDuty(code) && "schedule-marked-duty",
                        )}
                        onClick={() =>
                          onOpenCell ? onOpenCell(person.name, date) : onShowPerson(person.name)
                        }
                        title={person.name + " · " + date + ": " + (code || "Sem marcação")}
                        aria-label={
                          person.name +
                          ", " +
                          date.slice(8) +
                          "/" +
                          date.slice(5, 7) +
                          ": " +
                          (code || "Sem marcação")
                        }
                      >
                        <span className="truncate">{isMarkedScheduleDuty(code) ? "P" : short}</span>
                        {isMarkedScheduleDuty(code) && (
                          <span className="schedule-duty-dot" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(
              [
                ["work", "Em escala"],
                ["off", "De folga"],
                ["vacation", "Em férias"],
                ["duty", "Plantões marcados"],
              ] as const
            ).map(([key, label]) => (
              <tr key={key}>
                <th scope="row" className="schedule-person-cell">
                  {label}
                </th>
                {totals.map((total) => (
                  <td key={total.date}>{total[key]}</td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <div className="schedule-map-legend">
        <span>
          <i className="bg-primary" />
          Trabalho / turno
        </span>
        <span>
          <i className="bg-slate-700 dark:bg-slate-200" />
          Folga
        </span>
        <span>
          <i className="bg-warning" />
          Férias
        </span>
        <span>
          <i className="bg-teal-600" />
          Atestado
        </span>
        <span>
          <i className="bg-red-600" />
          Falta
        </span>
        <span>
          <i className="bg-navy dark:bg-sky-400" />
          Afastamento
        </span>
        <small>
          Clique no nome ou código para abrir a escala individual. Totais das pessoas exibidas.
        </small>
      </div>
    </div>
  );
}
