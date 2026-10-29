import { forwardRef, useImperativeHandle, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SchedulePersonDetails } from "@/components/SchedulePersonDetails";
import type { SchedulePerson, ScheduleUpload, ScheduleDateNote } from "@/lib/types";

export type SchedulePersonDialogHandle = {
  open: (name: string, date: string | undefined, people: SchedulePerson[]) => void;
};
type Selection = { people: SchedulePerson[]; index: number; date: string };
/** O estado da inspeção fica no popup: navegar não renderiza novamente a matriz da equipe. */
export const SchedulePersonDialog = forwardRef<
  SchedulePersonDialogHandle,
  {
    schedule: ScheduleUpload;
    notes: ScheduleDateNote[];
    isAdmin: boolean;
    filterDescription: string;
    onOpenNote: (date: string) => void;
  }
>(function SchedulePersonDialog({ schedule, notes, isAdmin, filterDescription, onOpenNote }, ref) {
  const [selection, setSelection] = useState<Selection | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      open(name, date, people) {
        const index = people.findIndex((p) => p.name === name);
        if (index >= 0) setSelection({ people, index, date: date || "" });
      },
    }),
    [],
  );
  const person = selection?.people[selection.index];
  function move(step: -1 | 1) {
    setSelection((current) => {
      if (!current) return current;
      const index = current.index + step;
      return index >= 0 && index < current.people.length ? { ...current, index } : current;
    });
  }
  return (
    <Dialog
      open={!!person}
      onOpenChange={(open) => {
        if (!open) setSelection(null);
      }}
    >
      <DialogContent
        overlayClassName="bg-black/45 data-[state=open]:animate-none data-[state=closed]:animate-none"
        className="schedule-person-dialog max-w-2xl data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{person?.name || "Escala individual"}</DialogTitle>
          <DialogDescription>
            Resumo e calendário. Navegue entre os colaboradores da seleção atual.
          </DialogDescription>
        </DialogHeader>
        <nav className="schedule-person-navigation" aria-label="Navegação entre colaboradores">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selection || selection.index === 0}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" />
            <span>Anterior</span>
          </Button>
          <span
            className="text-center text-xs text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            <b className="text-foreground">{selection ? selection.index + 1 : 0}</b> de{" "}
            {selection?.people.length || 0}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selection || selection.index >= selection.people.length - 1}
            onClick={() => move(1)}
          >
            <span>Próximo</span>
            <ChevronRight className="size-4" />
          </Button>
        </nav>
        <div className="schedule-person-dialog-body">
          {person && (
            <SchedulePersonDetails
              key={person.name}
              person={person}
              month={schedule.schedule_month}
              sector={schedule.sector}
              city={schedule.city}
              filterDescription={filterDescription}
              notes={notes}
              isAdmin={isAdmin}
              onOpenNote={(date) => {
                setSelection(null);
                onOpenNote(date);
              }}
              focusDate={selection?.date || ""}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
