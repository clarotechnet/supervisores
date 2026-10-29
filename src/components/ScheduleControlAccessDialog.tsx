import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, History, Loader2, RefreshCw, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHEDULE_CITY_OPTIONS } from "@/lib/types";
import { userRoleLabel } from "@/lib/access";
import {
  listControlAccessRequests,
  reviewControlAccess,
  fetchControlAccessHistory,
  type ControlAccessRequest,
  type ControlAccessStatus,
} from "@/services/schedule-access";
const statusLabels = {
  pending: "Pendente",
  approved: "Aprovado",
  denied: "Negado",
  revoked: "Revogado",
};
const actionLabels = {
  requested: "Pedido enviado",
  approved: "Acesso aprovado",
  denied: "Pedido negado",
  revoked: "Acesso revogado",
};
const cityName = (city: string) =>
  SCHEDULE_CITY_OPTIONS.find((item) => item.value === city)?.label ?? city;
export function ScheduleControlAccessDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  userId: string;
}) {
  const [filter, setFilter] = useState<ControlAccessStatus | "all">("pending");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(0);
  const [historyId, setHistoryId] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["schedule-control-access-requests", userId, filter, page],
    queryFn: () => listControlAccessRequests(filter, page * 50),
    enabled: open && Boolean(userId),
    refetchOnWindowFocus: "always",
    refetchInterval: open ? 30_000 : false,
  });
  const history = useQuery({
    queryKey: ["schedule-control-access-history", userId, historyId],
    queryFn: () => fetchControlAccessHistory(historyId),
    enabled: open && Boolean(userId && historyId),
  });
  const review = useMutation({
    mutationFn: ({
      request,
      decision,
    }: {
      request: ControlAccessRequest;
      decision: Exclude<ControlAccessStatus, "pending">;
    }) => reviewControlAccess(request, decision, note),
    onSuccess: async () => {
      setNote("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["schedule-control-access-requests", userId] }),
        client.invalidateQueries({ queryKey: ["schedule-control-access-history", userId] }),
        client.invalidateQueries({ queryKey: ["schedule-control-access"] }),
      ]);
      toast.success("Decisão registrada no histórico de acessos.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
      void query.refetch();
    },
  });
  function decide(
    request: ControlAccessRequest,
    decision: Exclude<ControlAccessStatus, "pending">,
  ) {
    const name = request.requester?.full_name || "este usuário";
    const question =
      decision === "approved"
        ? "Autorizar " +
          name +
          " a consultar todos os meses de Controle operacional em " +
          cityName(request.city) +
          ", até revogação? A autorização é apenas de consulta."
        : decision === "revoked"
          ? "Revogar o acesso de " +
            name +
            " ao Controle operacional em " +
            cityName(request.city) +
            "?"
          : "Negar o pedido de " + name + "?";
    if (!review.isPending && window.confirm(question)) review.mutate({ request, decision });
  }
  const rows = query.data?.requests ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Autorizações · Controle operacional</DialogTitle>
          <DialogDescription>
            Autorize a consulta por usuário e cidade. A autorização vale para todos os meses até
            revogação e mantém o nível do usuário. As demais frentes seguem suas permissões atuais.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-access-filter">Situação</Label>
            <select
              id="schedule-access-filter"
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as typeof filter);
                setPage(0);
              }}
            >
              <option value="all">Todos</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="size-4" /> Atualizar pedidos
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="schedule-access-review-note">Motivo da decisão (opcional)</Label>
          <Input
            id="schedule-access-review-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Será registrado na próxima decisão e exibido ao solicitante."
          />
        </div>
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Carregando pedidos...
          </p>
        ) : query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            Nenhum pedido nesta situação.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((request) => (
              <section key={request.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold">{request.requester?.full_name || "Usuário"}</h3>
                    <p className="break-words text-xs text-muted-foreground">
                      {request.requester?.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {request.requester && userRoleLabel(request.requester.role)} ·{" "}
                      {cityName(request.city)} · {statusLabels[request.status]}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Pedido: {new Date(request.requested_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                {request.request_note && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Solicitação: {request.request_note}
                  </p>
                )}
                {request.review_note && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Última decisão: {request.review_note}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {request.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        disabled={review.isPending || request.requester?.status !== "active"}
                        onClick={() => decide(request, "approved")}
                      >
                        <Check className="size-4" /> Aprovar consulta
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={review.isPending}
                        onClick={() => decide(request, "denied")}
                      >
                        <X className="size-4" /> Negar
                      </Button>
                    </>
                  )}
                  {request.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => decide(request, "revoked")}
                    >
                      <ShieldOff className="size-4" /> Revogar acesso
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setHistoryId(request.id)}>
                    <History className="size-4" /> Histórico
                  </Button>
                </div>
                {historyId === request.id && (
                  <div className="space-y-2 border-t pt-3 text-xs">
                    <p className="font-semibold">Histórico · últimos 200 registros</p>
                    {history.isPending ? (
                      <p>Carregando histórico...</p>
                    ) : history.error ? (
                      <p className="text-destructive">{history.error.message}</p>
                    ) : (
                      history.data?.map((event) => (
                        <p key={event.id} className="break-words">
                          {new Date(event.created_at).toLocaleString("pt-BR")} ·{" "}
                          {actionLabels[event.action]}
                          {" · "}
                          {event.actor?.full_name || "Usuário"}
                          {event.note && <> · {event.note}</>}
                        </p>
                      ))
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            Página {page + 1} · {query.data?.total ?? 0} pedido(s) nesta situação
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
