import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import type { ScheduleGeneratedPreview } from "../lib/schedule-generator";
import {
  previewAnalysisInput,
  analyzePreview,
  applyPreviewSuggestion,
  type PreviewSuggestion,
} from "../lib/schedule-preview-analysis";
import { requestScheduleAnalysis, type ScheduleAiResult } from "../services/schedule-ai";

interface Props {
  preview: ScheduleGeneratedPreview;
  baseline: ScheduleGeneratedPreview;
  active: boolean;
  onChange: (next: ScheduleGeneratedPreview) => void;
}
const short = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
export function SchedulePreviewAssistant({ preview, baseline, active, onChange }: Props) {
  const [automatic, setAutomatic] = useState(true);
  const requestRun = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState("all");
  const [remote, setRemote] = useState<{ input: string; data: ScheduleAiResult } | null>(null);
  const [request, setRequest] = useState<{
    input: string;
    running: boolean;
    waiting?: boolean;
    error: string;
  } | null>(null);
  const review = useMemo(() => {
    try {
      const input = previewAnalysisInput(preview, baseline);
      return { input, analysis: analyzePreview(input), error: "" };
    } catch (error) {
      return {
        input: null,
        analysis: null,
        error: error instanceof Error ? error.message : "Não foi possível revisar esta prévia.",
      };
    }
  }, [preview, baseline]);
  const fingerprint = useMemo(() => JSON.stringify(review.input), [review.input]);
  const pendingIssues = review.analysis?.issues.length || 0;
  const cancelReview = useCallback(() => {
    requestRun.current += 1;
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    requestAbort.current?.abort();
    requestAbort.current = null;
  }, []);
  const runReview = useCallback(() => {
    if (!active || !review.input) return;
    cancelReview();
    const run = requestRun.current;
    const abort = new AbortController();
    requestAbort.current = abort;
    setRemote(null);
    setRequest({ input: fingerprint, running: true, waiting: false, error: "" });
    const deadline = setTimeout(() => {
      if (run !== requestRun.current) return;
      requestRun.current += 1;
      abort.abort();
      setRequest({
        input: fingerprint,
        running: false,
        error: "A análise demorou mais de 25 segundos. Clique em Reanalisar para tentar novamente.",
      });
    }, 25000);
    abort.signal.addEventListener("abort", () => clearTimeout(deadline), { once: true });
    void requestScheduleAnalysis({ preview: review.input }, abort.signal)
      .then((data) => {
        if (run !== requestRun.current || abort.signal.aborted) return;
        setRemote({ input: fingerprint, data });
        setRequest({ input: fingerprint, running: false, error: "" });
      })
      .catch(() => {
        if (run !== requestRun.current || abort.signal.aborted) return;
        setRequest({
          input: fingerprint,
          running: false,
          error: "Não foi possível concluir a análise. Clique em Reanalisar para tentar novamente.",
        });
      })
      .finally(() => {
        clearTimeout(deadline);
        if (requestAbort.current === abort) requestAbort.current = null;
      });
  }, [active, review.input, fingerprint, cancelReview]);
  useEffect(() => {
    cancelReview();
    setRequest(null);
    setRemote(null);
    if (active && automatic && review.input && pendingIssues > 0) {
      setRequest({ input: fingerprint, running: true, waiting: true, error: "" });
      debounceTimer.current = setTimeout(runReview, 2000);
    }
    return cancelReview;
  }, [active, automatic, review.input, fingerprint, pendingIssues, runReview, cancelReview]);
  const result = remote?.input === fingerprint ? remote.data : null;
  const state = request?.input === fingerprint ? request : null;
  const explanations = new Map(result?.explanations.map((item) => [item.issueId, item]) || []);
  const issues = (review.analysis?.issues || []).filter(
    (issue) => filter === "all" || issue.kind === filter,
  );
  const apply = (suggestion: PreviewSuggestion) => {
    try {
      onChange(applyPreviewSuggestion(preview, baseline, suggestion));
      toast.success("Sugestão aplicada à prévia. Salve uma nova versão quando concluir.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revise a sugestão atual.");
    }
  };
  return (
    <aside
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 xl:sticky xl:top-0 xl:max-h-[72vh] xl:overflow-y-auto"
      aria-label="Assistente da prévia"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Bot className="size-4" />
          Assistente IA na geração
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          aria-label="Reanalisar prévia"
          title={state?.running ? "Reiniciar análise agora" : "Reanalisar prévia agora"}
          disabled={!active || !review.input}
          onClick={runReview}
        >
          {state?.running && !state.waiting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Reanalisar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Acompanha as alterações desta prévia, inclusive antes de salvar. Sugestões só entram no
        rascunho quando você clica em aplicar.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(event) => setAutomatic(event.target.checked)}
        />
        Análise IA automática
      </label>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {review.error ||
          state?.error ||
          (state?.running
            ? state.waiting
              ? "Regras atualizadas · aguardando pausa nas edições..."
              : "Reanalisando a prévia atual..."
            : pendingIssues
              ? "Regras atualizadas · " + pendingIssues + " ponto(s) para revisar."
              : "Regras atualizadas · nenhum conflito básico encontrado.")}
      </p>
      {state?.running && !state.waiting && <Loader2 className="size-4 animate-spin text-primary" />}
      {state?.error && (
        <p className="text-xs text-muted-foreground">
          IA indisponível nesta revisão. As regras e sugestões abaixo continuam disponíveis.
        </p>
      )}
      {result && (
        <section className="space-y-1 rounded-lg border bg-card p-2">
          <strong className="flex items-center gap-1 text-xs">
            <Sparkles className="size-3" />
            {result.mode === "ai" ? "Revisão da IA" : "Revisão pelas regras"}
          </strong>
          <p className="text-xs">{result.summary}</p>
          {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
        </section>
      )}
      {preview.blockingIssues.length > 0 && (
        <details className="rounded-lg border bg-card p-2">
          <summary className="cursor-pointer text-xs font-semibold">
            {preview.blockingIssues.length} pendência(s) de publicação
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
            {preview.blockingIssues.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      <select
        aria-label="Filtrar análise da prévia"
        className="w-full rounded-md border bg-background p-2 text-xs"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <option value="all">Todos os pontos ({pendingIssues})</option>
        <option value="weekly">Folgas e semanas 5x2</option>
        <option value="coverage">Cobertura e ausências</option>
        <option value="role">Funções no plantão</option>
      </select>
      <div className="space-y-2">
        {issues.slice(0, 30).map((issue) => {
          const explanation = explanations.get(issue.id);
          const ordered = explanation?.candidateKeys.length
            ? [
                ...explanation.candidateKeys.flatMap((key) =>
                  issue.candidates.filter((c) => c.key === key),
                ),
                ...issue.candidates.filter((c) => !explanation.candidateKeys.includes(c.key)),
              ]
            : issue.candidates;
          return (
            <section className="space-y-2 rounded-lg border bg-card p-2" key={issue.id}>
              <strong className="block text-xs">
                {short(issue.date)} · {issue.title}
              </strong>
              <p className="text-xs text-muted-foreground">{issue.detail}</p>
              {explanation?.explanation && <p className="text-xs">{explanation.explanation}</p>}
              {issue.kind === "weekly" &&
                issue.restOptions
                  ?.filter((option) => preview.payload.dates.includes(option.date))
                  .slice(0, 3)
                  .map((option) => (
                    <Button
                      type="button"
                      key={option.date}
                      size="sm"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal py-1.5 text-xs"
                      onClick={() => apply({ issueId: issue.id, date: option.date })}
                    >
                      Aplicar Folga em {short(option.date)} · {issue.affected[0]}
                    </Button>
                  ))}
              {issue.kind !== "weekly" &&
                ordered.map((candidate) => (
                  <Button
                    type="button"
                    key={candidate.key}
                    size="sm"
                    variant="outline"
                    className="h-auto w-full justify-start whitespace-normal py-1.5 text-xs"
                    onClick={() =>
                      apply({
                        issueId: issue.id,
                        date: issue.date,
                        candidateKey: candidate.key,
                        ...(candidate.compensation
                          ? { compensationDate: candidate.compensation.date }
                          : {}),
                      })
                    }
                  >
                    <span className="block space-y-1 text-left">
                      <span className="block font-semibold">
                        Escalar {candidate.name} em {short(issue.date)}
                      </span>
                      <span className="block text-muted-foreground">{candidate.role}</span>
                      {candidate.compensation && (
                        <span className="block">
                          Inclui Folga compensatória em {short(candidate.compensation.date)}
                        </span>
                      )}
                      {candidate.reason && (
                        <span className="block text-muted-foreground">{candidate.reason}</span>
                      )}
                    </span>
                  </Button>
                ))}
              {!issue.candidates.length &&
                issue.candidateNotes?.map((note) => (
                  <p className="text-xs text-muted-foreground" key={note}>
                    {note}
                  </p>
                ))}
              {!issue.restOptions?.length && !issue.candidates.length && (
                <p className="text-xs">Ajuste manual necessário na prévia.</p>
              )}
              {explanation?.caution && (
                <p className="text-xs text-muted-foreground">{explanation.caution}</p>
              )}
            </section>
          );
        })}
        {issues.length > 30 && (
          <p className="text-xs">
            Exibindo 30 de {issues.length}. A lista é atualizada a cada ajuste.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        A análise automática aguarda uma pausa de 2 segundos. Reanalisar consulta a prévia
        imediatamente, mesmo com a análise automática desligada. Não sincroniza o Sheets nem altera
        a escala. Aprovação e publicação continuam manuais.
      </p>
    </aside>
  );
}
