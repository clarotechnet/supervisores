import { supabase } from "@/integrations/supabase/client";
import type { ScheduleAnalysis } from "../../supabase/functions/_shared/schedule-ai-analysis";
export type AiExplanation = {
  issueId: string;
  explanation: string;
  candidateKeys: string[];
  caution: string;
};
export type ScheduleAiResult = {
  ok: true;
  source: "operational" | "draft" | "preview";
  mode: "ai" | "rules";
  summary: string;
  note: string;
  analysis: ScheduleAnalysis;
  explanations: AiExplanation[];
  writeActions: 0;
};
export async function requestScheduleAnalysis(
  target:
    | { sheetId: string; draftId?: never }
    | { draftId: string; sheetId?: never }
    | {
        preview: import("../../supabase/functions/_shared/schedule-ai-preview").PreviewAnalysisInput;
      },
  signal?: AbortSignal,
): Promise<ScheduleAiResult> {
  const { data, error } = await supabase.functions.invoke("schedule-ai", {
    body: target,
    ...(signal ? { signal } : {}),
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const result = (await context
        .clone()
        .json()
        .catch(() => null)) as { error?: string } | null;
      if (result?.error) throw Error(result.error);
    }
    throw error;
  }
  if (data?.error) throw Error(String(data.error));
  if (!data?.ok || !Array.isArray(data.analysis?.issues))
    throw Error("Resposta inválida da análise de escalas.");
  return data as ScheduleAiResult;
}

/** Escolhe uma proposta completa, sem salvar rascunho ou alterar dados oficiais. */
export async function requestScheduleGenerationChoice(
  generation: import("../../supabase/functions/_shared/schedule-ai-generation").GenerationChoiceInput,
  signal?: AbortSignal,
): Promise<import("../../supabase/functions/_shared/schedule-ai-generation").GenerationChoice> {
  const { data, error } = await supabase.functions.invoke("schedule-ai", {
    body: { generation },
    ...(signal ? { signal } : {}),
  });
  if (error) throw error;
  if (
    !data?.ok ||
    data.source !== "generation" ||
    !["ai", "rules"].includes(data.mode) ||
    typeof data.selectedOption !== "string" ||
    typeof data.summary !== "string" ||
    data.writeActions !== 0
  )
    throw Error("Resposta inválida da geração assistida.");
  return data;
}
