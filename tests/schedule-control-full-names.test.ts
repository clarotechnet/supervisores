import { describe, expect, it } from "vitest";
import { controlFullName, controlDutyNameAliases } from "../src/lib/schedule-control-names";
import {
  controlDecemberReference,
  CONTROL_DECEMBER_NO_DUTY,
} from "../src/lib/schedule-control-december-reference";
import { generateInitialControlDecemberPreview } from "../src/lib/schedule-generator";
import { getScheduleGenerationRule, isExcludedFromDuty } from "../src/lib/schedule-generator-rules";
import { previewAnalysisInput } from "../src/lib/schedule-preview-analysis";
import type { ScheduleUpload } from "../src/lib/types";

function source(): ScheduleUpload {
  return {
    id: "control-nov",
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-11-01",
    source_file: "fixture",
    source_sheet: "fixture",
    imported_by: null,
    imported_at: "",
    updated_at: "",
    employee_count: 42,
    entry_count: 42,
    payload: {
      dates: ["2026-11-30"],
      codes: ["T. 1"],
      people: controlDecemberReference().map((p, i) => ({
        name: p.name,
        jobTitle: p.jobTitle,
        login: "Z" + i,
        assignments: { "2026-11-30": "T. 1" },
      })),
    },
  };
}
describe("nomes completos do Controle RN", () => {
  it("completa as 42 identificações preservando logins, marcações e ordem da referência", () => {
    const input = source();
    const original = structuredClone(input);
    // A origem de novembro já traz Welton por extenso.
    input.payload.people[23]!.name = "WELTON MARQUES FERREIRA";
    const preview = generateInitialControlDecemberPreview(input);
    const reference = controlDecemberReference();
    expect(new Set(preview.payload.people.map((p) => p.name)).size).toBe(42);
    for (const [i, person] of preview.payload.people.entries()) {
      expect(person.name).toBe(controlFullName(reference[i]!.name));
      expect(person.login).toBe(original.payload.people[i]!.login);
      for (const day of preview.payload.dates)
        expect(person.assignments[day]).toBe(reference[i]!.assignments[day]);
    }
    expect(preview.blockingIssues.some((line) => line.includes("sem correspondência"))).toBe(false);
    expect(input.payload.people[0]!.name).toBe("ANTONIA ELIZIENE");
  });
  it("usa somente correspondências explícitas, inclusive as abreviações que não são prefixos", () => {
    expect(controlFullName("ALEX CAMPOS")).toBe("ALEX DA COSTA CAMPOS");
    expect(controlFullName("TIAGO JANUARIO")).toBe("TIAGO DA SILVA JANUARIO");
    expect(controlFullName("JEFERSON FERREIRA")).toBe("JEFFERSON FERREIRA BARBOSA");
    expect(controlFullName("ANTONIA OUTRA PESSOA")).toBe("ANTONIA OUTRA PESSOA");
    expect(controlDutyNameAliases("ANTONIA ELIZIENE DO NASCIMENTO")).toContain("ANTONIA ELIZIENE");
  });
  it("mantém as 19 exclusões do rodízio com nomes completos e nas análises de prévia", () => {
    const rule = getScheduleGenerationRule("natal", "controle-operacional")!;
    for (const name of CONTROL_DECEMBER_NO_DUTY)
      expect(isExcludedFromDuty(controlFullName(name), rule)).toBe(true);
    const preview = generateInitialControlDecemberPreview(source());
    const analysis = previewAnalysisInput(preview);
    for (const name of CONTROL_DECEMBER_NO_DUTY)
      expect(analysis.rule.excludedFromDuty).toContain(controlFullName(name));
    expect(
      isExcludedFromDuty("ANTONIA ELIZIENE DO NASCIMENTO", {
        ...rule,
        city: "fortaleza",
        excludedFromDuty: ["ANTONIA ELIZIENE"],
      }),
    ).toBe(false);
  });
  it("rejeita duplicar a mesma pessoa com nome antigo e completo na origem", () => {
    const input = source();
    input.payload.people.push({
      ...input.payload.people[0]!,
      name: controlFullName(input.payload.people[0]!.name),
    });
    expect(() => generateInitialControlDecemberPreview(input)).toThrow("Identificação ambígua");
  });
});
