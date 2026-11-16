import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicationReview, PublicationExceptionInput } from "@/services/schedule-operational";

export function SchedulePublicationReviewDialog({
  review,
  context,
  busy,
  onCancel,
  onConfirm,
}: {
  review: PublicationReview;
  context: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (exception: PublicationExceptionInput) => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const validReason = reason.trim().length >= 20 && reason.trim().length <= 2000;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] max-w-2xl overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Publicar com ressalva</DialogTitle>
          <DialogDescription>{context}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Esta escala tem {review.issues.length} pendência(s). A publicação alimentará o painel
          oficial. As pendências e sua justificativa permanecerão no histórico desta versão.
        </p>
        <ul
          className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3 text-sm"
          aria-label="Pendências para publicação"
        >
          {review.issues.map((issue) => (
            <li key={issue.id}>
              <strong>
                {issue.date ? issue.date.split("-").reverse().join("/") + " · " : ""}
                {issue.title}
              </strong>
              <p className="whitespace-pre-wrap text-muted-foreground">{issue.detail}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="publication-reason">Justificativa obrigatória</Label>
          <Textarea
            id="publication-reason"
            disabled={busy}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            aria-describedby="publication-reason-help"
            placeholder="Explique por que esta versão precisa ser publicada com as pendências acima."
          />
          <p id="publication-reason-help" className="text-xs text-muted-foreground">
            De 20 a 2000 caracteres. {reason.trim().length}/2000
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="publication-ack"
            checked={acknowledged}
            disabled={busy}
            onCheckedChange={(value) => setAcknowledged(value === true)}
          />
          <Label htmlFor="publication-ack" className="text-sm leading-5">
            Li as pendências e confirmo a publicação desta versão com ressalva, sob minha
            responsabilidade como administrador.
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Se a versão ou o Sheets mudar após esta revisão, será necessário conferir as pendências
          novamente.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !validReason || !acknowledged}
            onClick={() =>
              onConfirm({
                reason: reason.trim(),
                acknowledged: true,
                reviewToken: review.reviewToken,
              })
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Publicar com ressalva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
