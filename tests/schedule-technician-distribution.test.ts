import { describe, expect, it } from "vitest";
import { balanceFixedRests, fixedRestSummary } from "../src/lib/schedule-fixed-rest";
import {
  getScheduleGenerationRule,
  scheduleRuleForMonth,
} from "../src/lib/schedule-generator-rules";
import {
  generateInitialRnDecemberPreview,
  generateSchedulePreview,
} from "../src/lib/schedule-generator";
import { rnDecemberReference } from "../src/lib/schedule-rn-december-reference";
import { editControlPreviewCode } from "../src/lib/schedule-preview-editor";
import { previewAnalysisInput } from "../src/lib/schedule-preview-analysis";
import type { SchedulePerson, ScheduleUpload } from "../src/lib/types";
const rule = getScheduleGenerationRule("natal", "adesao-servico")!;
const days = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
function technician(i: number): SchedulePerson {
  return {
    name: `Técnico ${i}`,
    login: `Z${i}`,
    jobTitle: "Técnico",
    assignments: Object.fromEntries(
      days.map((d) => [
        d,
        [0, 2].includes(new Date(d + "T12:00:00Z").getUTCDay()) || d.endsWith("-25")
          ? "Folga"
          : "M. 1",
      ]),
    ),
  };
}
function source(month = "2026-11"): ScheduleUpload {
  const people = rnDecemberReference("adesao-servico")!;
  return {
    id: "test",
    city: "natal",
    sector: "adesao-servico",
    schedule_month: month + "-01",
    source_file: "test",
    source_sheet: "test",
    employee_count: people.length,
    entry_count: people.length,
    imported_by: null,
    imported_at: "",
    updated_at: "",
    payload: {
      dates: month === "2026-12" ? days : ["2026-11-30"],
      codes: ["M. 1"],
      people:
        month === "2026-12"
          ? people
          : people.map((p) => ({ ...p, assignments: { "2026-11-30": "M. 1" } })),
    },
  };
}
describe("distribuição percentual e cobertura de Adesão", () => {
  it("arredonda 25% e distribui toda a equipe sem perder pessoas para totais pequenos e ímpares", () => {
    for (const total of [0, 1, 2, 3, 4, 17, 57, 63, 66]) {
      const original = Array.from({ length: total }, (_, i) => technician(i));
      const snapshot = structuredClone(original);
      const balanced = balanceFixedRests(original, "2026-12", rule);
      const summary = fixedRestSummary(balanced.people, "2026-12", rule);
      expect(summary.targets[6]).toBe(Math.round(total * 0.25));
      expect(Object.values(summary.targets).reduce((a, b) => a + b, 0)).toBe(total);
      expect(summary.active).toBe(total);
      expect(summary.issues).toEqual([]);
      expect(original).toEqual(snapshot);
    }
  });
  it("usa 57 no denominador e mantém os 4 AT e os 17 demais ativos no modelo", () => {
    const p = generateInitialRnDecemberPreview(source());
    const summary = fixedRestSummary(p.payload.people, p.targetMonth, p.rule);
    expect(summary).toMatchObject({
      active: 57,
      otherActive: 17,
      protectedCount: 4,
      counts: { 1: 9, 2: 9, 3: 9, 4: 8, 5: 8, 6: 14 },
      issues: [],
    });
    expect(p.payload.people).toHaveLength(78);
    expect(p.blockingIssues).toEqual([]);
    for (const person of p.payload.people.filter((x) => !x.login?.trim()))
      for (const d of p.eventCoverage) expect(person.assignments[d.date]).toBe("Folga");
  });
  it("preserva a folga compensatória explícita de Natal em todas as frentes com plantão", () => {
    for (const sector of ["adesao-servico", "vt", "mdu", "mossoro"]) {
      const people = rnDecemberReference(sector)!;
      const duty = people.filter((p) => p.assignments["2026-12-25"] === "M. 1");
      expect(duty.length).toBeGreaterThan(0);
      for (const person of duty) expect(person.assignments["2026-12-26"]).toBe("Folga");
    }
  });
  it("recalcula o último domingo em meses diferentes sem alterar a política cadastrada", () => {
    const original = JSON.stringify(rule);
    expect(scheduleRuleForMonth(rule, "2026-12").dateDutyOverrides?.["2026-12-27"]).toBe(10);
    expect(scheduleRuleForMonth(rule, "2027-01").dateDutyOverrides?.["2027-01-31"]).toBe(10);
    expect(scheduleRuleForMonth(rule, "2027-02").dateDutyOverrides?.["2027-02-28"]).toBe(10);
    expect(JSON.stringify(rule)).toBe(original);
  });
  it("gera janeiro com 3 por domingo, 10 no último e 5 no feriado; preserva dezembro e os dias explícitos", () => {
    const s = source("2026-12"),
      snapshot = structuredClone(s);
    const p = generateSchedulePreview(s, "2027-01");
    expect(s).toEqual(snapshot);
    expect(p.eventCoverage.map((e) => [e.date, e.planned, e.assigned])).toEqual([
      ["2027-01-01", 5, 0],
      ["2027-01-03", 3, 3],
      ["2027-01-10", 3, 3],
      ["2027-01-17", 3, 3],
      ["2027-01-24", 3, 3],
      ["2027-01-31", 10, 10],
    ]);
    // O feriado já veio explicitamente como Folga do mês anterior: exige revisão, sem sobrescrever.
    expect(p.blockingIssues.some((x) => x.startsWith("2027-01-01: cobertura"))).toBe(true);
    for (const person of p.payload.people.filter((x) => !x.login?.trim()))
      expect(p.eventCoverage.every((e) => person.assignments[e.date] === "Folga")).toBe(true);
  });
  it("rejeita plantão manual sem login e omite esse candidato na análise IA", () => {
    const p = generateInitialRnDecemberPreview(source());
    const index = p.payload.people.findIndex((x) => !x.login?.trim());
    const edited = editControlPreviewCode(p, index, "2026-12-06", "M. 1");
    expect(edited.blockingIssues).toContain(
      "2026-12-06: pessoa excluída de plantão: " + p.payload.people[index]!.name,
    );
    expect(previewAnalysisInput(p).rule.excludedFromDuty).toContain(p.payload.people[index]!.name);
  });
  it("distribui as demais cinco abas entre segunda e sábado sem impor os 25% da Adesão", () => {
    for (const sector of ["mdu", "vt", "mossoro", "construcao", "desconexao"]) {
      const r = getScheduleGenerationRule(sector === "mossoro" ? "mossoro" : "natal", sector)!;
      const people = rnDecemberReference(sector)!;
      const summary = fixedRestSummary(people, "2026-12", r);
      expect(r.fixedOffStrategy).toBe("balanced");
      expect(summary.issues, sector).toEqual([]);
      expect(
        Math.max(...Object.values(summary.targets)) - Math.min(...Object.values(summary.targets)),
      ).toBeLessThanOrEqual(1);
    }
  });
});
