import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduleDateNote } from "@/lib/types";

interface ScheduleDateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  note: ScheduleDateNote | null;
  isAdmin: boolean;
  saving: boolean;
  onSave: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ScheduleDateNoteDialog({
  open,
  onOpenChange,
  date,
  note,
  isAdmin,
  saving,
  onSave,
  onDelete,
}: ScheduleDateNoteDialogProps) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) setBody(note?.body ?? "");
  }, [open, note]);

  const formattedDate = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" /> Observação da data
          </DialogTitle>
          <DialogDescription className="capitalize">{formattedDate}</DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="schedule-date-note">Observação para os controladores</Label>
            <Textarea
              id="schedule-date-note"
              rows={6}
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Informe orientações, mudanças ou pontos de atenção para esta data."
            />
            <p className="text-[10px] text-muted-foreground">
              Esta observação ficará visível para os controladores que consultarem a escala.
            </p>
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
            {note?.body}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <div>
            {isAdmin && note && (
              <Button variant="destructive" onClick={() => void onDelete()} disabled={saving}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Fechar
            </Button>
            {isAdmin && (
              <Button onClick={() => void onSave(body)} disabled={saving || body.trim().length < 3}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Salvar observação
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
