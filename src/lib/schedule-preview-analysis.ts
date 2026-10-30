import type { ScheduleGeneratedPreview } from "./schedule-generator";
import { operationalFromDraft } from "../../supabase/functions/_shared/schedule-operational";
import { analyzeSchedule } from "../../supabase/functions/_shared/schedule-ai-analysis";
import type { PreviewAnalysisInput } from "../../supabase/functions/_shared/schedule-ai-preview";
import { editControlPreviewCode } from "./schedule-preview-editor";
import { normalizeScheduleEmployeeName } from "./schedule-generator-rules";
import { schedulePersonKey } from "./schedule-history-memory";

export function previewAnalysisInput(
  preview: ScheduleGeneratedPreview,
  baseline: ScheduleGeneratedPreview = preview,
): PreviewAnalysisInput {
  const build = (p: ScheduleGeneratedPreview) =>
    operationalFromDraft(p.payload, p.calendarWeeks, p.outsideAssignments);
  const evidence = new Map(
    (preview.fixedRestEvidence || []).map((item) => [item.personKey, item.day]),
  );
  const fixedOffByName = Object.fromEntries(
    preview.payload.people.flatMap((person) => {
      const day = evidence.get(schedulePersonKey(person));
      return typeof day === "number" && day >= 1 && day <= 6
        ? [[normalizeScheduleEmployeeName(person.name), day]]
        : [];
    }),
  );
  return {
    city: preview.rule.city,
    sector: preview.rule.sector,
    month: preview.targetMonth,
    planned: build(baseline),
    current: build(preview),
    rule: {
      ...preview.rule,
      excludedFromDuty: [
        ...new Set([
          ...preview.rule.excludedFromDuty,
          ...(preview.rule.dutyRequiresLogin
            ? preview.payload.people.filter((p) => !p.login?.trim()).map((p) => p.name)
            : []),
        ]),
      ],
      additionalHolidays: [...(preview.rule.additionalHolidays || [])],
      analysisMonth: preview.targetMonth,
      allowRestCompensation: preview.rule.minimumIntermediateDuties === 0,
      fixedOffByName,
      ...(preview.rule.city === "natal" &&
      preview.rule.sector === "controle-operacional" &&
      preview.targetMonth === "2026-12"
        ? { transitionStart: "2026-12-06" }
        : {}),
    },
  };
}
export function analyzePreview(input: PreviewAnalysisInput) {
  return analyzeSchedule(input.planned, input.current, input.rule);
}
export type PreviewSuggestion = {
  issueId: string;
  date: string;
  candidateKey?: string;
  compensationDate?: string;
};
export function applyPreviewSuggestion(
  preview: ScheduleGeneratedPreview,
  baseline: ScheduleGeneratedPreview,
  suggestion: PreviewSuggestion,
): ScheduleGeneratedPreview {
  const analysis = analyzePreview(previewAnalysisInput(preview, baseline));
  const issue = analysis.issues.find((item) => item.id === suggestion.issueId);
  if (
    !issue ||
    suggestion.date < preview.targetMonth + "-01" ||
    !preview.payload.dates.includes(suggestion.date)
  )
    throw Error("A sugestão mudou ou pertence ao histórico. Revise a análise atual.");
  if (issue.kind === "weekly") {
    if (!issue.restOptions?.some((option) => option.date === suggestion.date))
      throw Error("Esta folga já não é uma opção válida.");
    const index = preview.payload.people.findIndex((p) => p.name === issue.affected[0]);
    if (index < 0) throw Error("Colaborador não encontrado.");
    return editControlPreviewCode(preview, index, suggestion.date, "Folga");
  }
  const candidate = issue.candidates.find((c) => c.key === suggestion.candidateKey);
  if (!candidate || suggestion.date !== issue.date) throw Error("Substituto já não disponível.");
  const index = preview.payload.people.findIndex((p) => p.name === candidate.name);
  if (index < 0) throw Error("Colaborador não encontrado.");
  const override =
    preview.rule.personShiftOverrides?.[normalizeScheduleEmployeeName(candidate.name)];
  const saturday = new Date(suggestion.date + "T12:00:00Z").getUTCDay() === 6;
  const code =
    preview.rule.dutyCode ||
    override ||
    (saturday ? preview.rule.saturdayShift : preview.rule.defaultShift);
  if (suggestion.compensationDate !== candidate.compensation?.date)
    throw Error("A compensação sugerida mudou. Revise a análise atual.");
  if (
    candidate.compensation &&
    (!preview.payload.dates.includes(candidate.compensation.date) ||
      !candidate.compensation.date.startsWith(preview.targetMonth + "-"))
  )
    throw Error("A compensação não pode alterar o histórico ou outra competência.");
  let next = editControlPreviewCode(preview, index, suggestion.date, code);
  if (candidate.compensation)
    next = editControlPreviewCode(next, index, candidate.compensation.date, "Folga");
  return next;
}
