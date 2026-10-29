import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleUpload } from "@/lib/types";
import { editOfficialScheduleCell, OfficialScheduleEditError } from "@/services/schedule-edit";
export function ScheduleOfficialEditDialog({
  open,
  onOpenChange,
  schedule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  schedule: ScheduleUpload | null;
  onSaved: () => Promise<void>;
}) {
  const [cell, setCell] = useState<{ name: string; date: string; expectedCode: string } | null>(
    null,
  );
  const [code, setCode] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    setCell(null);
    setCode("");
  }, [open, schedule?.id, schedule?.updated_at, schedule?.imported_at]);
  async function save() {
    if (!schedule || !cell || saving) return;
    setSaving(true);
    try {
      const result = await editOfficialScheduleCell({ scheduleId: schedule.id, ...cell, code });
      await onSaved();
      setCell(null);
      toast.success(
        result.unchanged
          ? "O código já está atualizado."
          : "Alteração salva no Sheets oficial e sincronizada no painel.",
      );
    } catch (error) {
      if (error instanceof OfficialScheduleEditError && error.writeAttempted) {
        toast.warning(error.message + " Confira a escala em Atualizar via API antes de repetir.");
        await onSaved();
        setCell(null);
      } else toast.error(error instanceof Error ? error.message : "Não foi possível editar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            Editar escala oficial
          </DialogTitle>
          <DialogDescription>
            Clique no código de um dia. Salvar grava somente essa célula na própria aba do Sheets
            oficial e sincroniza o painel, preservando o histórico.
          </DialogDescription>
        </DialogHeader>
        {cell && (
          <div className="sticky top-0 z-20 grid gap-2 rounded-xl border bg-card p-4">
            <Label htmlFor="official-schedule-code">
              {cell.name} · {cell.date.slice(8)}/{cell.date.slice(5, 7)} · atual:{" "}
              {cell.expectedCode || "Sem marcação"}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="official-schedule-code"
                autoFocus
                className="max-w-64"
                list="official-schedule-codes"
                maxLength={80}
                disabled={saving}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <datalist id="official-schedule-codes">
                {[
                  "M. 1",
                  "M. 2",
                  "T. 1",
                  "T. 2",
                  "Folga",
                  "PLANTÃO",
                  "AT",
                  "Férias",
                  "FALTA",
                  "Afastamento",
                  "BH",
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}Salvar no Sheets oficial
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => setCell(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="sticky left-0 z-20 min-w-56 bg-card p-3 text-left">Colaborador</th>
                {schedule?.payload.dates
                  .filter((date) => date.startsWith(schedule.schedule_month.slice(0, 7)))
                  .map((date) => (
                    <th className="min-w-20 p-2" key={date}>
                      {date.slice(8)}/{date.slice(5, 7)}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {schedule?.payload.people.map((person, index) => (
                <tr className="border-t" key={person.name + "-" + index}>
                  <th className="sticky left-0 bg-card p-3 text-left font-medium">{person.name}</th>
                  {schedule.payload.dates
                    .filter((date) => date.startsWith(schedule.schedule_month.slice(0, 7)))
                    .map((date) => (
                      <td className="p-1 text-center" key={date}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setCell({
                              name: person.name,
                              date,
                              expectedCode: person.assignments[date] || "",
                            });
                            setCode(person.assignments[date] || "");
                          }}
                          className="w-full rounded px-2 py-3 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={"Editar " + person.name + " em " + date}
                        >
                          {person.assignments[date] || "—"}
                        </button>
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
