import {
  generateSchedulePreview,
  generateInitialControlDecemberPreview,
  generateInitialRnDecemberPreview,
  isInitialControlDecember,
  type ScheduleGeneratedPreview,
} from "./schedule-generator";
import { isInitialRnDecember } from "./schedule-rn-december-reference";
import { scheduleCodeKind } from "./schedule-import";
import { schedulePersonKey, scheduleIsHoliday } from "./schedule-history-memory";
import type { ScheduleGenerationSource } from "../services/schedule-generation-source";
import type {
  GenerationChoice,
  GenerationChoiceInput,
  GenerationOption,
} from "../../supabase/functions/_shared/schedule-ai-generation";
import { rankedGenerationOptions } from "../../supabase/functions/_shared/schedule-ai-generation";
export type AssistedGenerationOptions = {
  input: GenerationChoiceInput;
  previews: Record<string, ScheduleGeneratedPreview>;
};
const work = (c: string | undefined) =>
  !!c && c !== "Sem informação" && scheduleCodeKind(c) === "work";
export function buildAssistedGeneration(
  source: ScheduleGenerationSource,
  month: string,
): AssistedGenerationOptions {
  const initialControl = isInitialControlDecember(source.city, source.sector, month),
    initialRn = isInitialRnDecember(source.city, source.sector, month);
  const previews: Record<string, ScheduleGeneratedPreview> = {},
    options: GenerationOption[] = [],
    seen = new Set<string>();
  for (let seed = 0; seed < (initialControl || initialRn ? 1 : 3); seed++) {
    const preview = initialControl
      ? generateInitialControlDecemberPreview(source)
      : initialRn
        ? generateInitialRnDecemberPreview(source)
        : generateSchedulePreview(source, month, {
            tieBreakSeed: seed,
            previousRule: source.inheritedRule,
          });
    const signature = JSON.stringify(preview.payload);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const id = "option-" + seed;
    previews[id] = preview;
    const previous = new Map(
      source.payload.people.map((p) => [
        schedulePersonKey(p),
        Object.entries(p.assignments).filter(
          ([d, c]) =>
            d.startsWith(preview.sourceMonth) &&
            work(c) &&
            (new Date(d + "T12:00:00Z").getUTCDay() === 0 || scheduleIsHoliday(d, preview.rule)),
        ).length,
      ]),
    );
    const duties = preview.payload.people.map(
      (p) =>
        preview.eventCoverage.filter((e) =>
          preview.rule.dutyCode === "PLANTÃO"
            ? p.assignments[e.date] === "PLANTÃO"
            : work(p.assignments[e.date]),
        ).length,
    );
    options.push({
      id,
      pendingChecks: preview.blockingIssues.length,
      repeatedDuties: preview.payload.people.reduce(
        (n, p, i) => n + ((previous.get(schedulePersonKey(p)) || 0) > 0 ? duties[i]! : 0),
        0,
      ),
      maxDuties: Math.max(0, ...duties),
      workloadSpread: Math.max(0, ...duties) - (duties.length ? Math.min(...duties) : 0),
      events: preview.eventCoverage.map((e) => ({
        date: e.date,
        planned: e.planned,
        roster: preview.payload.people.flatMap((p, i) =>
          (
            preview.rule.dutyCode === "PLANTÃO"
              ? p.assignments[e.date] === "PLANTÃO"
              : work(p.assignments[e.date])
          )
            ? ["P" + String(i).padStart(3, "0")]
            : [],
        ),
      })),
    });
  }
  return { input: { city: source.city, sector: source.sector, month, options }, previews };
}
export function applyGenerationChoice(
  options: AssistedGenerationOptions,
  source: ScheduleGenerationSource,
  choice?: GenerationChoice,
): ScheduleGeneratedPreview {
  const ranked = rankedGenerationOptions(options.input),
    fallback = ranked[0]!;
  const selected = choice ? ranked.find((o) => o.id === choice.selectedOption) : fallback;
  if (!selected || !options.previews[selected.id])
    throw Error("A escolha da IA não corresponde às propostas verificadas.");
  const preview = options.previews[selected.id]!;
  return {
    ...preview,
    generationDecision: {
      mode: choice?.mode || "rules",
      selectedOption: selected.id,
      summary: choice?.summary || "Prévia montada pelas regras e pelo histórico sincronizado.",
      sourceId: source.id,
      sourceUpdatedAt: source.updated_at,
    },
    warnings: [...preview.warnings, ...(choice?.note ? [choice.note] : [])],
  };
}
