import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requestControlAccess, type ControlAccessRequest } from "@/services/schedule-access";
export function ScheduleControlAccessGate({
  city,
  cityLabel,
  loading,
  error,
  request,
  onRefresh,
}: {
  city: string;
  cityLabel: string;
  loading: boolean;
  error: Error | null;
  request: ControlAccessRequest | null;
  onRefresh: () => void;
}) {
  const [note, setNote] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => requestControlAccess(city, note),
    onSuccess: async () => {
      setNote("");
      await client.invalidateQueries({ queryKey: ["schedule-control-access"] });
      toast.success("Pedido enviado para aprovação do administrador.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const pending = request?.status === "pending";
  return (
    <section className="grid min-w-0 gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-bold">Acesso restrito ao Controle operacional</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para consultar as escalas de Controle operacional em {cityLabel}, solicite autorização
            ao administrador. As demais frentes continuam disponíveis conforme seu perfil.
          </p>
        </div>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Verificando autorização...
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </div>
      ) : pending ? (
        <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm">
          Pedido enviado em {new Date(request.requested_at).toLocaleString("pt-BR")}. Aguarde a
          decisão do administrador. A autorização será verificada automaticamente.
        </p>
      ) : (
        <div className="max-w-2xl space-y-3">
          {request && (
            <p role="status" className="rounded-lg border p-3 text-sm">
              {request.status === "revoked"
                ? "Seu acesso foi revogado."
                : "Seu pedido anterior foi negado."}
              {request.review_note && <> Motivo: {request.review_note}</>} Você pode enviar uma nova
              solicitação.
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-access-note">Motivo da solicitação (opcional)</Label>
            <Textarea
              id="schedule-access-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explique por que precisa consultar esta escala."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A autorização permite consultar todos os meses desta frente nesta cidade, até ser
            revogada. A gestão da escala e o link do Sheets permanecem com o administrador.
          </p>
          <Button disabled={mutation.isPending || !city} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />} Solicitar acesso
          </Button>
        </div>
      )}
    </section>
  );
}
