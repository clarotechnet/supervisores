import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  controlDecemberReference,
  CONTROL_DECEMBER_NO_DUTY,
  CONTROL_DECEMBER_DATES,
} from "../src/lib/schedule-control-december-reference";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";
import {
  generateInitialControlDecemberPreview,
  generateSchedulePreview,
} from "../src/lib/schedule-generator";
import type { ScheduleUpload } from "../src/lib/types";

const encoder: Record<string, string> = { "T. 1": "T", Folga: "F", PLANTÃO: "P", Férias: "V" };
const people = controlDecemberReference();
function source(): ScheduleUpload {
  return {
    id: "nov",
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-11-01",
    source_file: "novembro 6x1",
    source_sheet: "11-2026",
    imported_by: null,
    imported_at: "",
    updated_at: "",
    employee_count: 42,
    entry_count: 42,
    payload: {
      dates: ["2026-11-30"],
      codes: ["T. 1"],
      people: people.map((p, i) => ({
        name: p.name,
        login: "Z" + i,
        jobTitle: p.jobTitle,
        assignments: { "2026-11-30": "T. 1" },
      })),
    },
  };
}
describe("Novo Excel 12-2026 (2): transcrição integral e segurança", () => {
  it("corresponde às 1.470 células e às 42 identidades do Excel enviado", () => {
    const txt = people
      .map((p) =>
        [
          p.name,
          p.jobTitle,
          CONTROL_DECEMBER_DATES.map((d) => encoder[p.assignments[d]]).join(""),
        ].join("|"),
      )
      .join("\n");
    expect(createHash("sha256").update(txt).digest("hex")).toBe(
      "5d45286a46ba67e1df665e039177c4e711e74e626a0fd8df6697fc290d71a368",
    );
    expect(people).toHaveLength(42);
    expect(CONTROL_DECEMBER_DATES).toHaveLength(35);
    const codes = people.flatMap((p) => CONTROL_DECEMBER_DATES.map((d) => p.assignments[d]));
    expect(codes.filter((x) => x === "PLANTÃO")).toHaveLength(21);
    expect(codes.filter((x) => x === "Férias")).toHaveLength(36);
  });
  it("os 19 verdes nunca aparecem como plantonistas no novo Excel", () => {
    expect(CONTROL_DECEMBER_NO_DUTY).toHaveLength(19);
    const rule = getScheduleGenerationRule("natal", "controle-operacional")!;
    expect(rule.excludedFromDuty).toEqual(CONTROL_DECEMBER_NO_DUTY);
    const excluded = new Set(CONTROL_DECEMBER_NO_DUTY);
    for (const person of people.filter((p) => excluded.has(p.name)))
      expect(Object.values(person.assignments)).not.toContain("PLANTÃO");
  });
  it("RENAN descansa segunda 07 e quarta 09 após plantão de domingo 06", () => {
    const renan = people.find((p) => p.name === "RENAN PAIVA")!;
    expect(renan.assignments["2026-12-05"]).toBe("T. 1");
    expect(renan.assignments["2026-12-06"]).toBe("PLANTÃO");
    expect(renan.assignments["2026-12-07"]).toBe("Folga");
    expect(renan.assignments["2026-12-09"]).toBe("Folga");
    const p = generateInitialControlDecemberPreview(source());
    expect(p.blockingIssues.some((x) => x.startsWith("RENAN PAIVA:"))).toBe(false);
  });
  it("férias não geram falso bloqueio de 5x2 nem são convertidas em Folga", () => {
    const p = generateInitialControlDecemberPreview(source());
    expect(p.blockingIssues.filter((x) => x.includes("confirmar exceção 5x2"))).toHaveLength(0);
    const antonia = p.payload.people.find((x) => x.name === "ANTONIA ELIZIENE")!;
    expect(antonia.assignments["2026-12-20"]).toBe("Férias");
    expect(p.warnings.some((x) => x.startsWith("ANTONIA ELIZIENE: semana"))).toBe(true);
    expect(p.rule.excludedFromDuty).toContain("ANTONIA ELIZIENE");
  });
});

it("preserva férias explícitas em 01–04/01 e gera os demais dias de Antonia e Tiago normalmente", () => {
  const december = source();
  december.schedule_month = "2026-12-01";
  december.payload = {
    dates: [...CONTROL_DECEMBER_DATES],
    codes: Object.keys(encoder),
    people: people.map((p, i) => ({ ...p, login: "Z" + i })),
  };
  const original = structuredClone(december);
  const january = generateSchedulePreview(december, "2027-01");
  for (const name of ["ANTONIA ELIZIENE", "TIAGO JANUARIO"]) {
    const person = january.payload.people.find((p) => p.name === name)!;
    expect(person.assignments["2027-01-01"]).toBe("Férias");
    expect(person.assignments["2027-01-04"]).toBe("Férias");
    expect(person.assignments["2027-01-05"]).not.toBe("Férias");
    expect(
      january.warnings.some((line) =>
        line.startsWith(name + ": férias anteriores não prorrogadas"),
      ),
    ).toBe(true);
    expect(january.blockingIssues.some((line) => line.startsWith(name + ": confirmar datas"))).toBe(
      false,
    );
    expect(
      january.outsideAssignments[january.payload.people.indexOf(person)]?.["2027-02-06"],
    ).not.toBe("Férias");
  }
  expect(december).toEqual(original);
});
