import { useState } from "react";
import { CalendarDays, Download, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ScheduleDateNote, SchedulePerson } from "@/lib/types";
import { todayKey } from "@/lib/date-utils";
import { scheduleCodeKind } from "@/lib/schedule-import";
import {
  compactScheduleCode,
  scheduleDayTotals,
  scheduleMonthDates,
  SCHEDULE_KIND_STYLE,
} from "@/lib/schedule-view";
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
}: {
  people: SchedulePerson[];
  month: string;
  city: string;
  sector: string;
  notes: ScheduleDateNote[];
  isAdmin: boolean;
  onOpenNote: (date: string) => void;
  onShowPerson: (name: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const dates = scheduleMonthDates(month);
  const today = todayKey();
  const totals = scheduleDayTotals(people, dates);
  const notesByDate = new Map(notes.map((note) => [note.note_date, note]));
  const formattedMonth = new Date(`${month.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  async function saveImage() {
    if (exporting) return;
    setExporting(true);
    try {
      const { downloadScheduleImage } = await import("@/lib/schedule-image");
      const pageCount = await downloadScheduleImage({ people, month, city, sector, notes });
      toast.success(
        pageCount === 1
          ? "Download da imagem iniciado."
          : `Download iniciado: ${pageCount} imagens reunidas em um arquivo ZIP.`,
      );
    } catch {
      toast.error("Não foi possível salvar a imagem. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="schedule-comparison-heading" className="text-lg font-black">
            Escala comparativa
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {people.length} colaboradores · <span className="capitalize">{formattedMonth}</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button variant="outline" onClick={() => void saveImage()} disabled={exporting}>
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {exporting ? "Gerando imagem..." : "Salvar imagem"}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            PNG · 1920 × 1080 · todos os dias do mês
          </span>
        </div>
      </div>
      {(isAdmin || notes.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-[11px]">
          <StickyNote className="size-4 text-primary" />
          {isAdmin
            ? "Clique no dia, no cabeçalho da tabela, para adicionar ou editar uma observação."
            : "Os dias com o ícone de observação têm um recado da gestão. Clique no dia para ler."}
        </div>
      )}
      <div
        role="region"
        aria-labelledby="schedule-comparison-heading"
        tabIndex={0}
        className="isolate max-h-[65vh] overflow-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <table className="w-full border-separate border-spacing-0 text-center text-[10px]">
          <caption className="sr-only">
            Escala de {formattedMonth} dos colaboradores selecionados
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 min-w-44 border-b border-r border-border bg-card px-3 py-3 text-left text-xs"
              >
                Colaborador / função
              </th>
              {dates.map((date) => {
                const weekday = new Date(`${date}T12:00:00`).getDay();
                const hasNote = notesByDate.has(date);
                const label = `${date.slice(8, 10)}/${date.slice(5, 7)}${hasNote ? ": ver observação" : ": adicionar observação"}`;
                const content = (
                  <>
                    <span className="block text-[9px] font-medium">{WEEKDAYS[weekday]}</span>
                    <span className="mt-0.5 flex items-center justify-center gap-0.5 font-extrabold">
                      {Number(date.slice(-2))}
                      {hasNote && <StickyNote className="size-2.5 text-primary" />}
                    </span>
                  </>
                );
                return (
                  <th
                    key={date}
                    scope="col"
                    aria-current={date === today ? "date" : undefined}
                    className={cn(
                      "sticky top-0 z-20 min-w-9 border-b border-l border-border bg-card p-1 text-muted-foreground",
                      weekday === 0 && "bg-secondary text-primary",
                      date === today && "bg-secondary ring-1 ring-inset ring-primary",
                    )}
                  >
                    {isAdmin || hasNote ? (
                      <button
                        type="button"
                        className="w-full rounded px-1 py-2 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => onOpenNote(date)}
                        aria-label={label}
                        title={label}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="px-1 py-2">{content}</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.name} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-52 border-b border-r border-border bg-card px-3 py-2 text-left group-hover:bg-secondary"
                >
                  <button
                    type="button"
                    className="block w-full rounded text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => onShowPerson(person.name)}
                    aria-label={`Ver calendário de ${person.name}`}
                    title={person.name}
                  >
                    <span className="block truncate text-[11px] font-bold">{person.name}</span>
                    <span
                      className="mt-0.5 block truncate text-[9px] font-normal text-muted-foreground"
                      title={person.jobTitle}
                    >
                      {person.jobTitle || "Função não informada"}
                    </span>
                  </button>
                </th>
                {dates.map((date) => {
                  const code = person.assignments[date]?.trim() ?? "";
                  const label = compactScheduleCode(code);
                  const kind = code ? scheduleCodeKind(code) : null;
                  return (
                    <td
                      key={date}
                      className="border-b border-l border-border p-0.5 group-hover:bg-secondary/50"
                      title={`${person.name} · ${date.slice(8, 10)}/${date.slice(5, 7)}: ${code || "Sem marcação"}`}
                    >
                      <span
                        className={cn(
                          "flex min-h-9 min-w-8 items-center justify-center rounded-md border px-1 font-bold",
                          kind
                            ? SCHEDULE_KIND_STYLE[kind]
                            : "border-transparent bg-secondary/30 text-muted-foreground",
                          label === "T2" && "border-navy/20 bg-navy text-white",
                        )}
                      >
                        <span className="max-w-16 truncate">{label}</span>
                        <span className="sr-only">: {code || "Sem marcação"}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-t border-border bg-card px-3 py-2 text-left text-[11px]"
              >
                Em escala
              </th>
              {totals.map((total) => (
                <td
                  key={total.date}
                  className="border-l border-t border-border py-2 font-bold text-primary"
                >
                  {total.work}
                </td>
              ))}
            </tr>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-t border-border bg-card px-3 py-2 text-left text-[11px]"
              >
                De folga
              </th>
              {totals.map((total) => (
                <td
                  key={total.date}
                  className="border-l border-t border-border py-2 font-bold text-muted-foreground"
                >
                  {total.off}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
        <span>
          <b className="text-primary">T1</b> · Turno 1
        </span>
        <span>
          <b className="text-navy">T2</b> · Turno 2
        </span>
        <span>
          <b>F</b> · Folga
        </span>
        <span>
          <b className="text-warning-foreground">Fé</b> · Férias
        </span>
        <span>
          <b className="text-navy">L</b> · Licença / afastamento
        </span>
        <span>
          <b>—</b> · Sem marcação
        </span>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Totais referentes apenas às pessoas selecionadas. Role a tabela para os lados para ver todos
        os dias.
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <CalendarDays className="size-3.5" /> Clique no nome para abrir o calendário individual.
        {people.length > 12 && " A exportação divide a seleção em imagens reunidas em um ZIP."}
      </p>
    </div>
  );
}
