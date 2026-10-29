import { describe, expect, it } from "vitest";
import { analyzeSchedule } from "../supabase/functions/_shared/schedule-ai-analysis";
import type { Payload } from "../supabase/functions/_shared/schedule-operational";

const dates = [
  "2026-12-27",
  "2026-12-28",
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
]; // Sunday–Saturday
const shifts = (rest: number[]) =>
  Object.fromEntries(dates.map((date, i) => [date, rest.includes(i) ? "Folga" : "T. 1"]));
const planned: Payload = {
  dates,
  codes: ["T. 1", "Folga", "PLANTÃO", "AT"],
  people: [
    {
      name: "COP A",
      jobTitle: "SUPERVISOR COP",
      assignments: {
        ...shifts([1, 3]),
        "2026-12-27": "PLANTÃO",
      },
    },
    { name: "COP B", jobTitle: "SUPERVISOR COP", assignments: shifts([0, 2, 6]) },
    {
      name: "CONTROLADOR C",
      jobTitle: "CONTROLADOR ADESÃO",
      assignments: {
        ...shifts([2, 4]),
        "2026-12-27": "PLANTÃO",
      },
    },
    {
      name: "COP D",
      jobTitle: "SUPERVISOR COP",
      assignments: {
        ...shifts([0, 1]),
        "2027-01-02": "AT",
      },
    },
  ],
};
const clone = (): Payload => JSON.parse(JSON.stringify(planned)) as Payload;
describe("Assistente IA: descanso domingo–sábado, plantão e sugestões", () => {
  it("cobre o domingo com candidato que ainda terá duas folgas", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-27"] = "AT";
    const result = analyzeSchedule(planned, current, {
      sundayDutyCount: 2,
      minimumSupervisorDuty: 1,
      minimumAdesaoControllerDuty: 1,
    });
    const missing = result.issues.find((x) => x.id === "coverage:2026-12-27");
    expect(missing?.affected).toEqual(["COP A"]);
    expect(missing?.candidates.map((x) => x.name)).toContain("COP B");
    expect(missing?.candidates.map((x) => x.name)).not.toContain("COP D");
    expect(result.inspectedWeeks).toBe(1);
    expect(result.issues.some((x) => x.id === "role:2026-12-27:supervisor")).toBe(true);
  });
  it("não sugere quem perderia a segunda folga", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-27"] = "AT";
    current.people[1]!.assignments["2026-12-29"] = "T. 1";
    const missing = analyzeSchedule(planned, current, { sundayDutyCount: 2 }).issues.find(
      (x) => x.id === "coverage:2026-12-27",
    );
    expect(missing?.candidates).toHaveLength(0);
  });
  it("não confunde mudança de turno com ausência", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-29"] = "M. 1";
    expect(
      analyzeSchedule(planned, current).issues.some((x) => x.id === "coverage:2026-12-29"),
    ).toBe(false);
  });
  it("indica dias possíveis para segunda folga, nunca o plantão", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-28"] = "T. 1"; // retira 1 descanso
    const issue = analyzeSchedule(planned, current).issues.find(
      (x) => x.kind === "weekly" && x.affected.includes("COP A"),
    );
    expect(issue?.restOptions?.length).toBeGreaterThan(0);
    expect(issue?.restOptions?.some((x) => x.date === "2026-12-27")).toBe(false);
    expect(issue?.candidates).toHaveLength(0);
    const skip = analyzeSchedule(planned, current, { transitionStart: "2027-01-03" });
    expect(skip.issues.some((x) => x.kind === "weekly")).toBe(false);
  });
  it("a IA não indica como substitutos os excluídos de plantão", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-27"] = "AT";
    const result = analyzeSchedule(planned, current, {
      sundayDutyCount: 2,
      excludedFromDuty: ["COP B"],
    });
    expect(result.issues.find((x) => x.id === "coverage:2026-12-27")?.candidates).toHaveLength(0);
  });
  it("AT não vira folga e o conflito é classificado como ausência, não 6x1", () => {
    const current = clone();
    current.people[0]!.assignments["2026-12-29"] = "AT";
    expect(
      analyzeSchedule(planned, current).issues.some(
        (x) => x.kind === "coverage" && x.affected.includes("COP A"),
      ),
    ).toBe(true);
  });
});

it("só oferece supervisores quando a função mínima está ausente do planejamento", () => {
  const current = clone();
  for (const p of current.people) {
    p.jobTitle = "CONTROLADOR";
    p.assignments["2026-12-27"] = "Folga";
  }
  current.people[0]!.assignments["2026-12-27"] = "PLANTÃO";
  current.people[1]!.jobTitle = "SUPERVISOR COP";
  const issue = analyzeSchedule(current, current, {
    sundayDutyCount: 1,
    minimumSupervisorDuty: 1,
  }).issues.find((i) => i.id === "role:2026-12-27:supervisor")!;
  expect(issue.candidates.map((c) => c.name)).toEqual(["COP B"]);
});

it("não trata histórico sem informação como seis dias trabalhados", () => {
  const current = clone();
  current.people[0]!.assignments["2026-12-28"] = "Sem informação";
  const analysis = analyzeSchedule(planned, current);
  expect(analysis.issues.some((i) => i.kind === "weekly" && i.affected.includes("COP A"))).toBe(
    false,
  );
  expect(analysis.notes.some((line) => line.includes("histórico ou continuidade incompleto"))).toBe(
    true,
  );
});
