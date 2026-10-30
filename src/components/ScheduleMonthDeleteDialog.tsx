import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  latestOperationalSource,
  deleteOperationalSheet,
  inspectOperationalSheetDeletion,
  type OperationalSheet,
} from "@/services/schedule-operational";
import type { ScheduleUpload } from "@/lib/types";

export function ScheduleMonthDeleteDialog({
  open,
  onOpenChange,
  schedule,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleUpload | null;
  onDeleted: () => Promise<void>;
}) {
  const [linked, setLinked] = useState<OperationalSheet | null>(null);
  const [loading, setLoading] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState("");
  const [target, setTarget] = useState<Awaited<
    ReturnType<typeof inspectOperationalSheetDeletion>
  > | null>(null);
  const expected = target?.confirmation || "EXCLUIR " + schedule?.schedule_month.slice(0, 7);
  useEffect(() => {
    if (!open || !schedule) return;
    let active = true;
    setLinked(null);
    setTarget(null);
    setError("");
    setConfirmation("");
    setLoading(true);
    void latestOperationalSource(schedule.city, schedule.sector, schedule.schedule_month, {
      allowDeletionPending: true,
    })
      .then(async (sheet) => {
        if (!sheet) throw Error("A aba oficial vinculada não foi encontrada.");
        const inspected = await inspectOperationalSheetDeletion(sheet.id);
        if (!inspected.confirmation || inspected.gridId == null)
          throw Error(
            "O servidor não confirmou a aba. Atualize a função schedule-operational antes de excluir.",
          );
        if (active) {
          setLinked(sheet);
          setTarget(inspected);
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Não foi possível conferir o vínculo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, schedule]);
  async function remove() {
    if (!linked || !target || !schedule || confirmation !== expected || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const result = await deleteOperationalSheet(linked.id, schedule.id, confirmation, target);
      if (!result.deleted) throw Error("O servidor não confirmou a exclusão.");
      toast.success("Escala e aba mensal excluídas. O histórico foi preservado.");
      onOpenChange(false);
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a exclusão.");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!deleting) onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(e) => {
          if (deleting) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (deleting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Excluir escala e aba do Sheets</DialogTitle>
          <DialogDescription>
            A escala sai do painel e a aba mensal vinculada é removida do arquivo oficial. As
            versões e os registros de alterações ficam no histórico.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Conferindo a aba vinculada...
          </p>
        ) : (
          linked && (
            <>
              <div className="rounded-lg border p-3 text-sm">
                <b>{linked.sheet_tab}</b>
                <p className="text-xs text-muted-foreground">
                  Identificador da aba: {target?.gridId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {linked.city} · {linked.sector} · {linked.schedule_month.slice(0, 7)}
                </p>
              </div>
              {target?.warning && (
                <p role="status" className="rounded-lg border p-3 text-sm">
                  {target.warning}
                </p>
              )}
              <p className="text-sm">
                A aba será apagada no Google Sheets. Para refazer a competência, sincronize o mês
                anterior e gere uma nova versão.
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-month-confirmation">Digite {expected} para confirmar</Label>
                <Input
                  id="delete-month-confirmation"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={deleting}
                />
              </div>
            </>
          )
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || !linked || deleting || confirmation !== expected}
            onClick={() => void remove()}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {deleting ? "Excluindo..." : "Excluir escala e aba"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
