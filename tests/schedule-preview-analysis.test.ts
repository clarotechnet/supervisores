import { describe, it, expect } from "vitest";
import {
  scheduleCalendarWeeks,
  type ScheduleGeneratedPreview,
} from "../src/lib/schedule-generator";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";
import {
  analyzePreview,
  previewAnalysisInput,
  applyPreviewSuggestion,
} from "../src/lib/schedule-preview-analysis";
import { validatePreviewAnalysisInput } from "../supabase/functions/_shared/schedule-ai-preview";
import { editControlPreviewCode } from "../src/lib/schedule-preview-editor";

function fixture(): ScheduleGeneratedPreview {
  const month = "2026-12";
  const dates = scheduleMonthDates(month);
  const calendarWeeks = scheduleCalendarWeeks(month);
  const code = (day: string, index: number) => {
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    return weekday === 0 || (index > 0 && weekday === 3) ? "Folga" : "M. 1";
  };
  return {
    targetMonth: month,
    sourceMonth: "2026-11",
    rule: getScheduleGenerationRule("recife", "desconexao")!,
    calendarWeeks,
    eventCoverage: [],
    warnings: [],
    blockingIssues: [],
    payload: {
      dates,
      codes: ["M. 1", "Folga"],
      people: [0, 1, 2].map((index) => ({
        name: "PESSOA DEMO " + index,
        login: "LOGIN-" + index,
        jobTitle: "Técnico",
        assignments: Object.fromEntries(dates.map((day) => [day, code(day, index)])),
      })),
    },
    outsideAssignments: [0, 1, 2].map((index) =>
      Object.fromEntries(
        calendarWeeks
          .flat()
          .filter((day) => !day.startsWith(month))
          .map((day) => [day, code(day, index)]),
      ),
    ),
  };
}
describe("análise da prévia antes de salvar", () => {
  it("recalcula após edição local sem salvar nem alterar a referência inicial", () => {
    const baseline = fixture();
    const original = structuredClone(baseline);
    const issue = analyzePreview(previewAnalysisInput(baseline)).issues.find(
      (i) => i.kind === "weekly",
    )!;
    const date = issue.restOptions![0]!.date;
    const edited = applyPreviewSuggestion(baseline, baseline, { issueId: issue.id, date });
    expect(edited.payload.people[0]!.assignments[date]).toBe("Folga");
    expect(
      analyzePreview(previewAnalysisInput(edited, baseline)).issues.some((i) => i.id === issue.id),
    ).toBe(false);
    expect(baseline).toEqual(original);
  });
  it("recusa sugestão obsoleta depois que a célula muda para AT", () => {
    const p = fixture();
    const issue = analyzePreview(previewAnalysisInput(p)).issues.find((i) => i.kind === "weekly")!;
    const date = issue.restOptions![0]!.date;
    const next = editControlPreviewCode(p, 0, date, "AT");
    expect(() => applyPreviewSuggestion(next, p, { issueId: issue.id, date })).toThrow(
      /mudou|válida/,
    );
    expect(next.payload.people[0]!.assignments[date]).toBe("AT");
  });
  it("recusa aplicar folga em dia histórico", () => {
    const p = fixture();
    const issue = analyzePreview(previewAnalysisInput(p)).issues.find((i) => i.kind === "weekly")!;
    expect(() => applyPreviewSuggestion(p, p, { issueId: issue.id, date: "2026-11-30" })).toThrow(
      /histórico/,
    );
  });
  it("aceita a prévia limitada no servidor e descarta logins no formato de análise", () => {
    const p = fixture();
    const input = validatePreviewAnalysisInput(previewAnalysisInput(p));
    expect(input.current.people).toHaveLength(3);
    expect(input.current.people[0]).not.toHaveProperty("login");
    expect(analyzePreview(input).issues.some((i) => i.kind === "weekly")).toBe(true);
  });
  it("rejeita datas fora da janela e prévias com pessoas em excesso", () => {
    const input = previewAnalysisInput(fixture());
    const outside = structuredClone(input);
    outside.current.dates[0] = "2030-01-01";
    expect(() => validatePreviewAnalysisInput(outside)).toThrow();
    const huge = structuredClone(input);
    huge.current.people = Array(501).fill(huge.current.people[0]);
    expect(() => validatePreviewAnalysisInput(huge)).toThrow();
  });
  it("conta PLANTÃO explícito, sem contar T. 1 como plantão no Controle", () => {
    const input = previewAnalysisInput(fixture());
    input.rule = { dutyCode: "PLANTÃO", sundayDutyCount: 3, analysisMonth: "2026-12" };
    for (const person of input.current.people) person.assignments["2026-12-06"] = "T. 1";
    const issue = analyzePreview(input).issues.find((i) => i.id === "coverage:2026-12-06");
    expect(issue?.detail).toContain("atual: 0");
    expect(
      analyzePreview(input).issues.some(
        (i) => i.date.startsWith("2026-11") && i.kind === "coverage",
      ),
    ).toBe(false);
  });
});
