import { describe, expect, it } from "vitest";
import {
  scheduleCalendarWeeks,
  type ScheduleGeneratedPreview,
} from "../src/lib/schedule-generator";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";
import { schedulePersonKey } from "../src/lib/schedule-history-memory";
import {
  revalidateSchedulePreview,
  editControlPreviewCode,
} from "../src/lib/schedule-preview-editor";
import {
  analyzePreview,
  previewAnalysisInput,
  applyPreviewSuggestion,
} from "../src/lib/schedule-preview-analysis";
import { validatePreviewAnalysisInput } from "../supabase/functions/_shared/schedule-ai-preview";

const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
function fixture(): ScheduleGeneratedPreview {
  const month = "2027-01";
  const dates = scheduleMonthDates(month);
  const calendarWeeks = scheduleCalendarWeeks(month);
  const definitions = [
    ["ADESAO EM PLANTAO", "CONTROLADOR (ADESÃO)", 2],
    ["COP DISPONIVEL", "SUPERVISOR COP - NTL", 5],
    ["COP DE APOIO", "SUPERVISOR COP - FTZ", 3],
    ["ADESAO DISPONIVEL", "CONTROLADOR (ADESÃO) - NTL", 4],
    ["EXCLUIDO", "SUPERVISOR COP", 4],
    ["CAMPO", "SUPERVISOR DE CAMPO", 3],
  ] as const;
  const code = (date: string, fixed: number) =>
    weekday(date) === 0 || weekday(date) === fixed || date === "2027-01-01" ? "Folga" : "T. 1";
  const people = definitions.map(([name, jobTitle, fixed]) => ({
    name,
    jobTitle,
    assignments: Object.fromEntries(dates.map((d) => [d, code(d, fixed)])),
  }));
  people[0]!.assignments["2027-01-03"] = "PLANTÃO";
  people[0]!.assignments["2027-01-04"] = "Folga";
  return revalidateSchedulePreview({
    targetMonth: month,
    sourceMonth: "2026-12",
    rule: {
      ...getScheduleGenerationRule("natal", "controle-operacional")!,
      excludedFromDuty: ["EXCLUIDO", "COP DE APOIO"],
    },
    fixedRestPolicy: "preserve-history",
    fixedRestEvidence: people.map((p, i) => ({
      personKey: schedulePersonKey(p),
      day: definitions[i]![2],
      week: [],
      method: "normal-week",
    })),
    calendarWeeks,
    outsideAssignments: definitions.map(([, , fixed]) =>
      Object.fromEntries(
        calendarWeeks
          .flat()
          .filter((d) => !dates.includes(d))
          .map((d) => [d, code(d, fixed)]),
      ),
    ),
    eventCoverage: [],
    warnings: [],
    blockingIssues: ["2027-01-03: cobertura insuficiente (1/3)."],
    payload: { dates, people, codes: ["T. 1", "Folga", "PLANTÃO"] },
  });
}
const analysis = (p: ScheduleGeneratedPreview, baseline = p) =>
  analyzePreview(previewAnalysisInput(p, baseline));
describe("sugestões de cobertura com compensação na prévia", () => {
  it("indica supervisor COP em 03/01 mesmo com folga nos demais domingos", () => {
    const p = fixture();
    const before = structuredClone(p);
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    expect(issue.detail).toContain("supervisor COP");
    expect(issue.candidates.map((c) => c.name)).toEqual(["COP DISPONIVEL"]);
    const candidate = issue.candidates[0]!;
    expect(candidate.compensation).toEqual({ date: "2027-01-04", currentCode: "T. 1" });
    expect(candidate.reason).toContain("2 folgas e 5 dias");
    expect(p).toEqual(before);
  });
  it("gera alertas específicos de função mesmo quando a cobertura é zero", () => {
    const issues = analysis(fixture()).issues.filter((i) => i.date === "2027-01-01");
    expect(issues.map((i) => i.id)).toEqual(
      expect.arrayContaining([
        "coverage:2027-01-01",
        "role:2027-01-01:supervisor",
        "role:2027-01-01:adesao",
      ]),
    );
    expect(issues.flatMap((i) => i.candidates.map((c) => c.name))).not.toContain("COP DISPONIVEL");
  });
  it("aplica plantão e compensação juntos, preserva a sexta fixa e atualiza os bloqueios", () => {
    const baseline = fixture();
    const before = structuredClone(baseline);
    const issue = analysis(baseline).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    const candidate = issue.candidates[0]!;
    let next = applyPreviewSuggestion(baseline, baseline, {
      issueId: issue.id,
      date: issue.date,
      candidateKey: candidate.key,
      compensationDate: candidate.compensation!.date,
    });
    expect(next.payload.people[1]!.assignments["2027-01-03"]).toBe("PLANTÃO");
    expect(next.payload.people[1]!.assignments["2027-01-04"]).toBe("Folga");
    expect(next.payload.people[1]!.assignments["2027-01-08"]).toBe("Folga");
    expect(analysis(next, baseline).issues.some((i) => i.id === issue.id)).toBe(false);
    expect(next.blockingIssues).not.toContain("2027-01-03: cobertura insuficiente (1/3).");
    const coverage = analysis(next, baseline).issues.find((i) => i.id === "coverage:2027-01-03")!;
    const controller = coverage.candidates.find((c) => c.name === "ADESAO DISPONIVEL")!;
    expect(controller).toBeDefined();
    next = applyPreviewSuggestion(next, baseline, {
      issueId: coverage.id,
      date: coverage.date,
      candidateKey: controller.key,
      ...(controller.compensation ? { compensationDate: controller.compensation.date } : {}),
    });
    expect(next.eventCoverage.find((e) => e.date === "2027-01-03")).toEqual({
      date: "2027-01-03",
      planned: 3,
      assigned: 3,
    });
    expect(next.blockingIssues.filter((line) => line.startsWith("2027-01-03:"))).toEqual([]);
    expect(analysis(next, baseline).issues.filter((i) => i.date === "2027-01-03")).toEqual([]);
    expect(next.outsideAssignments).toEqual(baseline.outsideAssignments);
    expect(baseline).toEqual(before);
  });
  it("não aceita aplicar só o plantão quando a compensação é obrigatória", () => {
    const p = fixture();
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    expect(() =>
      applyPreviewSuggestion(p, p, {
        issueId: issue.id,
        date: issue.date,
        candidateKey: issue.candidates[0]!.key,
      }),
    ).toThrow("compensação");
  });
  it("recusa uma sugestão obsoleta se o dia de compensação passou a AT", () => {
    const p = fixture();
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    const c = issue.candidates[0]!;
    const next = editControlPreviewCode(p, 1, c.compensation!.date, "AT");
    expect(() =>
      applyPreviewSuggestion(next, p, {
        issueId: issue.id,
        date: issue.date,
        candidateKey: c.key,
        compensationDate: c.compensation!.date,
      }),
    ).toThrow(/disponível|mudou/);
  });
  it("explica quando nenhum supervisor pode entrar por exclusão do rodízio", () => {
    const p = fixture();
    p.rule.excludedFromDuty = [...p.rule.excludedFromDuty, "COP DISPONIVEL"];
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    expect(issue.candidates).toEqual([]);
    expect(issue.candidateNotes?.join(" ")).toContain("Excluído");
  });
  it("não usa plantão ou afastamento como dia de compensação", () => {
    const p = fixture();
    p.payload.people[1]!.assignments["2027-01-04"] = "PLANTÃO";
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    expect(issue.candidates[0]!.compensation?.date).not.toBe("2027-01-04");
    p.payload.people[1]!.assignments["2027-01-06"] = "AT";
    expect(analysis(p).issues.find((i) => i.id === issue.id)?.candidates).toEqual([]);
  });
  it("mantém no servidor a folga fixa e o plano de compensação, com entrada limitada", () => {
    const input = previewAnalysisInput(fixture());
    const parsed = validatePreviewAnalysisInput(input);
    expect(parsed.rule.fixedOffByName?.["COP DISPONIVEL"]).toBe(5);
    expect(parsed.rule.allowRestCompensation).toBe(true);
    const issue = analyzePreview(parsed).issues.find((i) => i.id === "role:2027-01-03:supervisor")!;
    expect(issue.candidates[0]!.compensation?.date).toBe("2027-01-04");
    for (const fixed of [0, 7, "5", null]) {
      const invalid = structuredClone(input);
      invalid.rule.fixedOffByName = { "COP DISPONIVEL": fixed } as Record<string, number>;
      expect(() => validatePreviewAnalysisInput(invalid)).toThrow();
    }
  });
  it("não sugere compensar em dezembro ou em outra competência", () => {
    const p = fixture();
    p.payload.people[1]!.assignments["2027-01-01"] = "Folga";
    p.payload.people[1]!.assignments["2027-01-02"] = "PLANTÃO";
    p.outsideAssignments[1]!["2026-12-27"] = "PLANTÃO";
    p.outsideAssignments[1]!["2026-12-30"] = "Folga";
    p.fixedRestEvidence![1]!.day = 3;
    const issue = analysis(p).issues.find((i) => i.id === "role:2027-01-01:supervisor")!;
    expect(issue.candidates).toEqual([]);
    expect(issue.candidateNotes?.join(" ")).toContain("mesma semana e competência");
  });
});
