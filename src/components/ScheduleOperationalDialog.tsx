import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  fetchOperationalChanges,
  listOperationalSheets,
  operationalDifferenceCount,
  operationalCoverageGaps,
  operationalDifferences,
  operationalWeeklyRestAlerts,
  syncOperationalSheet,
  type OperationalChange,
  type OperationalSheet,
} from "@/services/schedule-operational";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city: string;
  sector: string;
  month: string;
  onSynced: () => Promise<void>;
  canOpenSheet?: boolean;
}
export function ScheduleOperationalDialog({
  open,
  onOpenChange,
  city,
  sector,
  month,
  onSynced,
  canOpenSheet = false,
}: Props) {
  const [items, setItems] = useState<OperationalSheet[]>([]);
  const [logs, setLogs] = useState<OperationalChange[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState("");
  async function refresh(): Promise<OperationalSheet[]> {
    const rows = await listOperationalSheets(city, sector, month);
    setItems(rows);
    return rows;
  }
  useEffect(() => {
    if (!open || !city || !sector || !month) return;
    let active = true;
    setLoading(true);
    setItems([]);
    setLogs([]);
    setActiveId("");
    void listOperationalSheets(city, sector, month)
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        if (rows[0]) setActiveId(rows[0].id);
      })
      .catch((e: unknown) => {
        if (active)
          toast.error(e instanceof Error ? e.message : "Falha ao carregar escalas editáveis.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, city, sector, month]);
  useEffect(() => {
    if (!open || !activeId) {
      setLogs([]);
      return;
    }
    let active = true;
    void fetchOperationalChanges(activeId)
      .then((data) => {
        if (active) setLogs(data);
      })
      .catch(() => {
        if (active) setLogs([]);
      });
    return () => {
      active = false;
    };
  }, [open, activeId, items]);
  async function sync(item: OperationalSheet) {
    setSyncing(item.id);
    try {
      const result = await syncOperationalSheet(item.id);
      await refresh();
      await onSynced();
      if (result.warning) toast.warning(result.warning);
      else
        toast.success(
          result.changes
            ? result.changes + " alteração(ões) sincronizada(s)."
            : "Nenhuma alteração nova encontrada.",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar.");
    } finally {
      setSyncing("");
    }
  }
  const selected = items.find((item) => item.id === activeId) ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escala operacional · Google Sheets editável</DialogTitle>
          <DialogDescription>
            Edite os códigos na aba mensal vinculada do Google Sheets e sincronize aqui. O
            planejamento original e o histórico de alterações são preservados. Após a aprovação, as
            alterações também atualizam a escala oficial.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Consultando planilhas...
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            Nenhuma planilha operacional gerada para este mês. Crie uma a partir de um rascunho em
            "Gerar prévia 5x2". Não altera planilhas antigas.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant={item.id === activeId ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveId(item.id)}
                >
                  {new Date(item.created_at).toLocaleDateString("pt-BR")} ·{" "}
                  {item.draft_id.slice(0, 8)}
                </Button>
              ))}
            </div>
            {selected && (
              <section className="space-y-3 rounded-lg border p-3">
                <p className="text-sm">
                  <strong>{operationalDifferenceCount(selected)}</strong> célula(s) diferentes do
                  planejamento original após a última sincronização.
                </p>
                {operationalWeeklyRestAlerts(selected).length > 0 && (
                  <div className="rounded-md border border-destructive/35 p-2 text-xs">
                    <strong>
                      {operationalWeeklyRestAlerts(selected).length} semana(s) precisam de revisão
                      dos descansos 5x2:
                    </strong>
                    <ul className="mt-1 list-disc pl-4">
                      {operationalWeeklyRestAlerts(selected)
                        .slice(0, 8)
                        .map((alert, i) => (
                          <li key={i}>
                            {alert.employee}: {alert.start} a {alert.end} ({alert.restDays}{" "}
                            folga(s), {alert.workDays} dia(s) trabalhados)
                          </li>
                        ))}
                    </ul>
                    <p className="mt-1">
                      Aviso operacional: não substitui a validação de jornada e RH.
                    </p>
                  </div>
                )}
                {operationalCoverageGaps(selected).length > 0 && (
                  <div className="rounded-md border border-destructive/35 p-2 text-xs">
                    <strong>Cobertura de plantão reduzida após as alterações:</strong>
                    <ul className="mt-1 list-disc pl-4">
                      {operationalCoverageGaps(selected).map((gap) => (
                        <li key={gap.date}>
                          {gap.date.slice(8, 10)}/{gap.date.slice(5, 7)}: {gap.current} trabalhando;
                          eram {gap.expected} no planejamento
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1">
                      Registre o substituto na aba editável do mês e sincronize novamente.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Última sincronização:{" "}
                  {selected.last_synced_at
                    ? new Date(selected.last_synced_at).toLocaleString("pt-BR")
                    : "Não sincronizada"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {canOpenSheet && (
                    <Button
                      asChild={false}
                      variant="outline"
                      onClick={() =>
                        window.open(selected.spreadsheet_url, "_blank", "noopener,noreferrer")
                      }
                    >
                      <ExternalLink className="size-4" /> Abrir Google Sheets
                    </Button>
                  )}
                  <Button disabled={Boolean(syncing)} onClick={() => void sync(selected)}>
                    {syncing === selected.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Sincronizar alterações
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Edições como AT, FALTA, retorno e troca de plantão só aparecem neste painel depois
                  da sincronização. As mudanças não alteram automaticamente as folgas fixas ou a
                  escala originalmente planejada.
                </p>
              </section>
            )}
            {selected && operationalDifferences(selected).length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-bold">Situação atual diferente do planejamento</h3>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th className="p-2">Colaborador</th>
                        <th className="p-2">Data</th>
                        <th className="p-2">Planejado</th>
                        <th className="p-2">Atual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operationalDifferences(selected)
                        .slice(0, 100)
                        .map((x, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{x.name}</td>
                            <td className="p-2">
                              {x.date.slice(8, 10)}/{x.date.slice(5, 7)}
                            </td>
                            <td className="p-2">{x.planned || "—"}</td>
                            <td className="p-2 font-semibold">{x.current || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {selected && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <History className="size-4" /> Histórico das alterações (últimas 200)
                </h3>
                {!logs.length ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma alteração registrada após a criação da planilha.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          <th className="p-2">Colaborador</th>
                          <th className="p-2">Data</th>
                          <th className="p-2">Planejado</th>
                          <th className="p-2">Antes</th>
                          <th className="p-2">Atualizado</th>
                          <th className="p-2">Registrado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <tr key={log.id} className="border-t">
                            <td className="p-2">{log.employee_name}</td>
                            <td className="p-2">
                              {log.duty_date.slice(8, 10)}/{log.duty_date.slice(5, 7)}
                            </td>
                            <td className="p-2">{log.planned_code || "—"}</td>
                            <td className="p-2">{log.previous_code || "—"}</td>
                            <td className="p-2 font-semibold">{log.current_code || "—"}</td>
                            <td className="p-2">
                              {new Date(log.created_at).toLocaleString("pt-BR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
