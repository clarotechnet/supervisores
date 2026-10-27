import { useEffect, useState } from "react";
import { CalendarClock, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleUpload, ScheduleUploadSummary } from "@/lib/types";
import { fetchScheduleUpload } from "@/services/schedules";
import {
  generateSchedulePreview, type ScheduleGeneratedPreview,
} from "@/lib/schedule-generator";
import { getScheduleGenerationRule } from "@/lib/schedule-generator-rules";
import { downloadScheduleReport } from "@/lib/schedule-report";
import { scheduleCodeKind } from "@/lib/schedule-import";
import {
  listGenerationDrafts,
  restoreGenerationPreview,
  saveGeneratedDraft,
  type GenerationDraft,
} from "@/services/schedule-generation";

interface ScheduleGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSummary: ScheduleUploadSummary | null;
  targetMonth: string;
  userId: string;
}
function previousMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function brDate(value: string) {
  return value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4);
}

export function ScheduleGeneratorDialog({
  open, onOpenChange, sourceSummary, targetMonth, userId,
}: ScheduleGeneratorDialogProps) {
  const month = targetMonth.slice(0, 7);
  const [source, setSource] = useState<ScheduleUpload | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [preview, setPreview] = useState<ScheduleGeneratedPreview | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<GenerationDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const rule = source ? getScheduleGenerationRule(source.city, source.sector) : null;

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setWeekIndex(0);
    setSavedRevision(null);
  }, [open, targetMonth, sourceSummary?.id]);

  useEffect(() => {
    let active = true;
    setSource(null);
    setSourceError("");
    if (!open || !sourceSummary) { setLoadingSource(false); return; }
    setLoadingSource(true);
    void fetchScheduleUpload(sourceSummary.id)
      .then((row) => {
        if (!active) return;
        if (!row) throw new Error("Escala anterior não encontrada no banco.");
        setSource(row);
      })
      .catch((error: unknown) => {
        if (active) setSourceError(error instanceof Error ? error.message : "Não foi possível carregar o mês anterior.");
      })
      .finally(() => { if (active) setLoadingSource(false); });
    return () => { active = false; };
  }, [open, sourceSummary?.id]);

  useEffect(() => {
    if (!open || !source || !month) {
      setDrafts([]);
      return;
    }
    let active = true;
    setLoadingDrafts(true);
    listGenerationDrafts(source.city, source.sector, month)
      .then((rows) => { if (active) setDrafts(rows); })
      .catch(() => { if (active) toast.error("Não foi possível consultar o histórico de rascunhos."); })
      .finally(() => { if (active) setLoadingDrafts(false); });
    return () => { active = false; };
  }, [open, source?.city, source?.sector, month]);

  function generate() {
    if (!source || !month) return;
    try {
      const result = generateSchedulePreview(source, month);
      setPreview(result);
      setWeekIndex(0);
      setSavedRevision(null);
      if (result.blockingIssues.length) {
        toast.warning("Prévia criada com pendências obrigatórias.");
      } else {
        toast.success("Prévia calculada. Confira antes de publicar.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar prévia.");
    }
  }
  async function saveDraft() {
    if (!preview || !source || !userId) return;
    setSaving(true);
    try {
      const result = await saveGeneratedDraft({ source, preview, userId });
      setSavedRevision(result.draft.revision);
      setDrafts(await listGenerationDrafts(source.city, source.sector, preview.targetMonth));
      if (result.auditLogged) {
        toast.success(`Rascunho versão ${result.draft.revision} salvo no Supabase.`);
      } else {
        toast.warning(`Rascunho salvo (versão ${result.draft.revision}), mas o registro de auditoria falhou.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  }
  function openDraft(draft: GenerationDraft) {
    if (!rule) return;
    setPreview(restoreGenerationPreview(draft, rule));
    setWeekIndex(0);
    setSavedRevision(draft.revision);
  }
  async function exportPreview() {
    if (!preview || !source) return;
    setExporting(true);
    try {
      await downloadScheduleReport({
        ...source,
        id: "preview-only",
        schedule_month: preview.targetMonth + "-01",
        source_file: "PRÉVIA NÃO PUBLICADA",
        source_sheet: "Gerador 5x2",
        payload: preview.payload,
        employee_count: preview.payload.people.length,
        entry_count: preview.payload.people.length * preview.payload.dates.length,
      });
      toast.success("Relatório da prévia exportado, sem alterar a escala oficial.");
    } catch {
      toast.error("Não foi possível exportar a prévia.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> Gerador de escala · prévia 5x2
          </DialogTitle>
          <DialogDescription>
            Usa a escala anterior do Supabase. Não altera o Google Sheets nem
            publica automaticamente. Os rascunhos são salvos separadamente no Supabase;
            a IA online será conectada em uma etapa separada.
          </DialogDescription>
        </DialogHeader>
        {loadingSource ? (
          <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Buscando escala anterior...</p>
        ) : !sourceSummary || !source ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            {sourceError || `Não foi encontrada a escala-base de ${previousMonth(month)} para esta cidade e frente. Importe ou sincronize o mês anterior; não é necessário importar ${month}.`}
          </p>
        ) : !rule ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">Não existe uma regra configurada para esta cidade e frente.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <strong>{rule.label}</strong>
              <p className="mt-1 text-xs text-muted-foreground">
                Base: {source.schedule_month.slice(0, 7)} ·
                {source.payload.people.length} colaboradores.
                {rule.notes ? " " + rule.notes : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor="schedule-generate-month">Mês de destino (selecionado na página)</Label>
                <Input id="schedule-generate-month" type="month" value={month} readOnly />
              </div>
              <Button onClick={generate} disabled={!month}>
                <CalendarClock className="size-4" /> Gerar prévia
              </Button>
            </div>
            <section className="rounded-lg border p-3">
              <h3 className="text-sm font-bold">Rascunhos salvos no Supabase</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Versões independentes da escala oficial. Uma sincronização do Sheets não as substitui.
              </p>
              {loadingDrafts ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Carregando histórico...
                </p>
              ) : drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum rascunho salvo para este período.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-auto">
                  {drafts.map((draft) => (
                    <div key={draft.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b py-1 text-xs">
                      <div>
                        <strong>Versão {draft.revision}</strong> · {draft.status} ·{" "}
                        {new Date(draft.created_at).toLocaleString("pt-BR")}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openDraft(draft)}>
                        Abrir rascunho
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {savedRevision !== null && (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Rascunho versão {savedRevision} selecionado. A escala oficial permanece inalterada.
              </p>
            )}
            {preview && (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Colaboradores</div>
                    <div className="text-xl font-bold">{preview.payload.people.length}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Plantões previstos</div>
                    <div className="text-xl font-bold">
                      {preview.eventCoverage.reduce((n, x) => n + (x.planned || 0), 0)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Pendências</div>
                    <div className="text-xl font-bold">{preview.blockingIssues.length}</div>
                  </div>
                </div>
                {preview.calendarWeeks.length > 0 && (
                  <section className="rounded-lg border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold">Escala semanal 5x2 (segunda a domingo)</h3>
                        <p className="text-xs text-muted-foreground">
                          Dias anteriores são históricos; dias do mês seguinte são provisórios.
                        </p>
                      </div>
                      <select
                        aria-label="Escolher semana da prévia"
                        className="rounded-md border border-input bg-background px-3 py-2 text-xs"
                        value={weekIndex}
                        onChange={(event) => setWeekIndex(Number(event.target.value))}
                      >
                        {preview.calendarWeeks.map((week, index) => (
                          <option key={week[0]} value={index}>
                            {brDate(week[0]!)} a {brDate(week[6]!)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-[760px] w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 bg-card">
                          <tr>
                            <th className="sticky left-0 z-10 min-w-48 border-b bg-card p-2">Colaborador</th>
                            {preview.calendarWeeks[weekIndex]?.map((day) => (
                              <th key={day}
                                className={`min-w-20 border-b p-2 text-center ${day.slice(0, 7) !== month ? "text-muted-foreground" : ""}`}>
                                {new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })}
                                <div>{brDate(day).slice(0, 5)}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.payload.people.map((person, index) => (
                            <tr key={person.login || `${person.name}-${index}`} className="border-b">
                              <td className="sticky left-0 bg-card p-2 font-medium">{person.name}</td>
                              {preview.calendarWeeks[weekIndex]?.map((day) => {
                                const code = day.slice(0, 7) === month
                                  ? person.assignments[day]
                                  : preview.outsideAssignments[index]?.[day];
                                return (
                                  <td key={day}
                                    className={`p-2 text-center ${day.slice(0, 7) !== month ? "bg-muted/50 text-muted-foreground" : ""}`}>
                                    {code || "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {preview.blockingIssues.length > 0 && (
                  <section className="rounded-lg border border-destructive/35 bg-destructive/5 p-3">
                    <h3 className="text-sm font-bold">Pendências que impedem publicação</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {preview.blockingIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  </section>
                )}
                <section className="rounded-lg border p-3">
                  <h3 className="mb-2 text-sm font-bold">Cobertura de domingos e feriados</h3>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead><tr>
                        <th className="p-2">Data</th>
                        <th className="p-2">Previstos</th>
                        <th className="p-2">Escalados</th>
                        <th className="p-2">Colaboradores</th>
                      </tr></thead>
                      <tbody>
                        {preview.eventCoverage.map((event) => {
                          const staff = preview.payload.people.filter((person) =>
                            scheduleCodeKind(person.assignments[event.date] || "") === "work");
                          return <tr key={event.date} className="border-t align-top">
                            <td className="p-2">{brDate(event.date)}</td>
                            <td className="p-2">{event.planned ?? "Pendente"}</td>
                            <td className="p-2">{event.assigned}</td>
                            <td className="p-2">{staff.map((p) => p.name).join(", ") || "—"}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="rounded-lg border p-3">
                  <h3 className="mb-2 text-sm font-bold">Observações para revisão</h3>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
                  </ul>
                </section>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {preview && (
            <Button onClick={() => void saveDraft()} disabled={saving || !userId}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar nova versão no Supabase
            </Button>
          )}
          {preview && (
            <Button variant="outline" onClick={() => void exportPreview()} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> :
                <FileSpreadsheet className="size-4" />}
              Exportar relatório da prévia
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
