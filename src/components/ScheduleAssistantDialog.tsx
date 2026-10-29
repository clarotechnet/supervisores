import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listOperationalSheets } from "@/services/schedule-operational";
import { listGenerationDrafts } from "@/services/schedule-generation";
import { requestScheduleAnalysis, type ScheduleAiResult } from "@/services/schedule-ai";

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  city: string;
  sector: string;
  month: string;
}
type Choice = { value: string; label: string };
const short = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
export function ScheduleAssistantDialog({ open, onOpenChange, city, sector, month }: Props) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [chosen, setChosen] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScheduleAiResult | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  useEffect(() => {
    if (!open || !city || !sector || !month) return;
    let active = true;
    setChoices([]);
    setChosen("");
    setResult(null);
    setLoading(true);
    setKindFilter("all");
    void Promise.all([
      listOperationalSheets(city, sector, month),
      listGenerationDrafts(city, sector, month),
    ])
      .then(([sheets, drafts]) => {
        if (!active) return;
        const entries: Choice[] = [
          ...sheets.map((x) => ({
            value: "sheet:" + x.id,
            label:
              "Operacional / Sheets · " +
              new Date(x.created_at).toLocaleDateString("pt-BR") +
              " · " +
              (x.last_synced_at ? "sincronizada" : "não sincronizada"),
          })),
          ...drafts.map((x) => ({
            value: "draft:" + x.id,
            label: "Prévia 5x2 · versão " + x.revision + " · " + x.status,
          })),
        ];
        setChoices(entries);
        setChosen(entries[0]?.value || "");
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : "Erro ao listar escalas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, city, sector, month]);
  async function analyze() {
    if (!chosen) return;
    setRunning(true);
    setResult(null);
    try {
      const [type, id] = chosen.split(":");
      const data = await requestScheduleAnalysis(
        type === "sheet" ? { sheetId: id! } : { draftId: id! },
      );
      setResult(data);
      if (data.mode === "ai") toast.success("Análise com IA concluída.");
      else toast.info("Análise pelas regras disponível.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível analisar a escala.");
    } finally {
      setRunning(false);
    }
  }
  const issues = useMemo(
    () =>
      result?.analysis.issues.filter(
        (issue) => kindFilter === "all" || issue.kind === kindFilter,
      ) || [],
    [result, kindFilter],
  );
  const explanations = useMemo(
    () => new Map(result?.explanations.map((x) => [x.issueId, x]) || []),
    [result],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            Assistente IA de Escalas
          </DialogTitle>
          <DialogDescription>
            Revisão assistida de ausências, plantões e semanas 5x2. A IA recomenda, mas não modifica
            escalas, rascunhos, Supabase ou Google Sheets.
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="schedule-ai-source">Versão para analisar</Label>
            {loading ? (
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Consultando escalas...
              </p>
            ) : choices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Não existe escala operacional ou prévia salva para {month}. Salve uma prévia ou crie
                a planilha editável primeiro.
              </p>
            ) : (
              <select
                id="schedule-ai-source"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={chosen}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setResult(null);
                }}
              >
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button disabled={!chosen || running || loading} onClick={() => void analyze()}>
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {running ? "Analisando..." : "Analisar conflitos e sugerir substitutos"}
          </Button>
          <p className="text-xs text-muted-foreground">
            O modelo externo só é consultado quando você clica em Analisar. Quando ativo, recebe
            dados resumidos e IDs anônimos, sem nomes ou logins. A análise automática das regras
            funciona mesmo sem chave da IA.
          </p>
        </section>
        {result && (
          <div className="space-y-4">
            <section className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">
                  {result.mode === "ai"
                    ? "Análise com modelo de IA + regras"
                    : "Análise automática pelas regras"}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {result.analysis.inspectedWeeks} semana(s) completas ·{" "}
                  {result.analysis.issues.length} pendência(s)
                </span>
              </div>
              <p className="text-sm">{result.summary}</p>
              {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
              {result.analysis.notes.map((line, i) => (
                <p className="text-xs text-muted-foreground" key={i}>
                  {line}
                </p>
              ))}
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="schedule-ai-filter">Mostrar</Label>
              <select
                id="schedule-ai-filter"
                className="rounded-md border bg-background p-2 text-xs"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
              >
                <option value="all">Todas ({result.analysis.issues.length})</option>
                <option value="coverage">Ausências e cobertura</option>
                <option value="role">Funções obrigatórias</option>
                <option value="weekly">Descanso semanal</option>
              </select>
            </div>
            {issues.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm">
                Nenhuma pendência encontrada neste filtro. A revisão de horas e acordos trabalhistas
                continua necessária.
              </p>
            ) : (
              <div className="max-h-[47vh] space-y-3 overflow-auto pr-1">
                {issues.map((issue) => {
                  const ai = explanations.get(issue.id);
                  const ordered = ai?.candidateKeys?.length
                    ? [
                        ...ai.candidateKeys.flatMap((key) =>
                          issue.candidates.filter((c) => c.key === key),
                        ),
                        ...issue.candidates.filter((c) => !ai.candidateKeys.includes(c.key)),
                      ]
                    : issue.candidates;
                  return (
                    <section key={issue.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <strong className="text-sm">{issue.title}</strong>
                        <span className="text-xs text-muted-foreground">
                          {short(issue.date)} ·{" "}
                          {issue.severity === "high" ? "Prioridade alta" : "Revisar"}
                        </span>
                      </div>
                      <p className="text-sm">{issue.detail}</p>
                      {issue.affected.length > 0 && (
                        <p className="text-xs">
                          <strong>Envolvidos:</strong> {issue.affected.join(", ")}
                        </p>
                      )}
                      {ai?.explanation && (
                        <p className="text-sm">
                          <Sparkles className="mr-1 inline size-3.5" />
                          <strong>IA:</strong> {ai.explanation}
                        </p>
                      )}
                      {issue.kind === "weekly" && (issue.restOptions?.length || 0) > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold">
                            Dias possíveis para adicionar a segunda folga (revisar cobertura):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {issue.restOptions!.map((option) => (
                              <span
                                key={option.date}
                                className="rounded-md border px-2 py-1 text-xs"
                              >
                                {short(option.date)} · atual {option.currentCode} → Folga
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {ordered.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold">
                            Possíveis substitutos para avaliação:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ordered.map((c) => (
                              <span key={c.key} className="rounded-md border px-2 py-1 text-xs">
                                {c.name} · {c.role} · {c.restDays} folgas previstas na semana
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : issue.kind === "coverage" || issue.kind === "role" ? (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ShieldAlert className="size-4" /> Sem candidato que preserve pelo menos
                          dois descansos na semana. Exige remanejamento manual e validação.
                        </p>
                      ) : null}
                      {ai?.caution && (
                        <p className="text-xs text-muted-foreground">Cuidado: {ai.caution}</p>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Sugestões não são aprovação nem comprovam cumprimento da legislação. Confira função,
              horas, folga fixa e convenção coletiva antes de alterar o Sheets.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
