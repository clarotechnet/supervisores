import { describe, expect, it } from "vitest";
import { balanceFixedRests, fixedRestSummary } from "../src/lib/schedule-fixed-rest";
import { generateInitialRnDecemberPreview } from "../src/lib/schedule-generator";
import { getScheduleGenerationRule, isExcludedFromDuty } from "../src/lib/schedule-generator-rules";
import {
  rnDecemberReference,
  isInitialRnDecember,
} from "../src/lib/schedule-rn-december-reference";
import { editControlPreviewCode } from "../src/lib/schedule-preview-editor";
import type { SchedulePerson, ScheduleUpload } from "../src/lib/types";

const dates = Array.from({ length: 31 }, (_, i) => "2026-12-" + String(i + 1).padStart(2, "0"));
const weekday = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
const vtTargets = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 };
function source(front: string): ScheduleUpload {
  const people = rnDecemberReference(front)!;
  return {
    id: "test-source",
    city: "natal",
    sector: front,
    schedule_month: "2026-11-01",
    source_file: "test",
    source_sheet: "NOV",
    employee_count: people.length,
    entry_count: people.length,
    imported_by: null,
    imported_at: "",
    updated_at: "",
    payload: {
      dates: ["2026-11-30"],
      codes: ["M. 1"],
      people: people.map((p) => ({ ...p, assignments: { "2026-11-30": "M. 1" } })),
    },
  };
}
function person(name: string, fixed: number): SchedulePerson {
  return {
    name,
    jobTitle: "TECNICO",
    assignments: Object.fromEntries(
      dates.map((d) => [
        d,
        weekday(d) === 0 || weekday(d) === fixed || d === "2026-12-25" ? "Folga" : "M. 1",
      ]),
    ),
  };
}
describe("folgas fixas de segunda a sábado no RN", () => {
  it("VT distribui 17 pessoas em 3/3/3/3/3/2, sem trocar os plantonistas da referência", () => {
    const preview = generateInitialRnDecemberPreview(source("vt"));
    expect(fixedRestSummary(preview.payload.people, "2026-12", vtTargets)).toMatchObject({
      active: 17,
      protectedCount: 0,
      counts: vtTargets,
      issues: [],
    });
    const expected = {
      "6": ["T6074699", "Z136958", "Z162951", "Z531363", "Z595406"],
      "13": ["Z103647", "Z156593", "Z343552", "Z355113", "Z453020"],
      "20": ["Z029703", "Z041730", "Z052045", "Z131573", "Z595276"],
      "25": ["T6074699", "Z156973", "Z162951", "Z595406", "Z655153"],
      "27": ["Z103647", "Z136958", "Z156593", "Z343552", "Z531363"],
    };
    for (const [day, logins] of Object.entries(expected)) {
      const date = "2026-12-" + day.padStart(2, "0");
      expect(
        preview.payload.people
          .filter((p) => p.assignments[date] === "M. 1")
          .map((p) => p.login)
          .sort(),
      ).toEqual(logins);
    }
    for (const p of preview.payload.people.filter((p) =>
      ["T6074699", "Z162951"].includes(p.login || ""),
    )) {
      expect(p.assignments["2026-12-01"]).toBe("Férias");
      expect(p.assignments["2026-12-02"]).toBe("Férias");
      expect(p.assignments["2026-12-03"]).not.toBe("Férias");
    }
    expect(preview.blockingIssues).toEqual([]);
    preview.payload.people.forEach((p, i) => {
      const all = { ...preview.outsideAssignments[i], ...p.assignments };
      for (const week of preview.calendarWeeks.filter((w) => w[0]! >= "2026-12-01")) {
        expect(week.filter((d) => all[d] === "Folga").length).toBeGreaterThanOrEqual(2);
        expect(week.filter((d) => all[d]?.startsWith("M.")).length).toBeLessThanOrEqual(5);
      }
    });
  });
  it("Adesão usa os 57 elegíveis, mantém 4 AT e distribui os demais ativos separadamente", () => {
    const preview = generateInitialRnDecemberPreview(source("adesao-servico"));
    const targets = preview.rule;
    const summary = fixedRestSummary(preview.payload.people, "2026-12", targets);
    expect(preview.payload.people).toHaveLength(78);
    expect(summary).toMatchObject({ active: 57, otherActive: 17, protectedCount: 4, expected: 57 });
    expect(
      preview.payload.people.filter((p) => dates.every((d) => p.assignments[d] === "AT")),
    ).toHaveLength(4);
    expect(summary.targets).toEqual({ 1: 9, 2: 9, 3: 9, 4: 8, 5: 8, 6: 14 });
    expect(summary.issues).toEqual([]);
    expect(preview.eventCoverage.map((e) => e.assigned)).toEqual([3, 3, 3, 5, 10]);
    expect(preview.blockingIssues).toEqual([]);
    const excluded = preview.payload.people.filter((p) => isExcludedFromDuty(p.name, preview.rule));
    expect(excluded).toHaveLength(6);
    for (const p of excluded)
      for (const n of [6, 13, 20, 25, 27])
        expect(p.assignments["2026-12-" + String(n).padStart(2, "0")]).toBe("Folga");
    const gabriel = preview.payload.people.find((p) => p.name === "GABRIEL RELVA DE BRITO")!;
    for (const n of [1, 2, 3]) expect(gabriel.assignments["2026-12-0" + n]).toBe("Férias");
    expect(gabriel.assignments["2026-12-04"]).not.toBe("Férias");
  });
  it("revalida edições manuais e libera a distribuição quando a célula é restaurada", () => {
    const preview = generateInitialRnDecemberPreview(source("vt"));
    const p = preview.payload.people[0]!;
    const changed = editControlPreviewCode(preview, 0, "2026-12-08", "M. 1");
    expect(changed.payload.people[0]!.assignments["2026-12-08"]).toBe("M. 1");
    expect(p.assignments["2026-12-08"]).toBe("Folga");
    const restored = editControlPreviewCode(changed, 0, "2026-12-08", "Folga");
    expect(restored.blockingIssues.filter((s) => s.startsWith("Distribuição"))).toEqual([]);
  });
  it("não transplanta a regra percentual para outras cidades ou frentes", () => {
    for (const [city, front] of [
      ["fortaleza", "manutencao"],
      ["recife", "desconexao"],
      ["mossoro", "mossoro"],
      ["natal", "mdu"],
      ["natal", "construcao"],
      ["natal", "desconexao"],
    ]) {
      expect(getScheduleGenerationRule(city!, front!)?.fixedOffDistribution).toBeUndefined();
    }
    expect(isInitialRnDecember("fortaleza", "vt", "2026-12")).toBe(false);
    expect(isInitialRnDecember("recife", "adesao-servico", "2026-12")).toBe(false);
  });
});
describe("proteções do rebalanceamento", () => {
  const rule = {
    fixedOffDistribution: { 2: 1, 5: 1 },
    defaultShift: "M. 1",
    saturdayShift: "M. 1",
  };
  it("preserva férias/AT/faltas, eventos e compensações, sem mutar a fonte", () => {
    const people = [person("A", 2), person("B", 2)];
    people[1]!.assignments["2026-12-04"] = "AT";
    people[1]!.assignments["2026-12-11"] = "Férias";
    people[1]!.assignments["2026-12-18"] = "FALTA";
    people[1]!.assignments["2026-12-25"] = "M. 1";
    people[1]!.assignments["2026-12-21"] = "Folga";
    const original = structuredClone(people);
    const result = balanceFixedRests(people, "2026-12", rule);
    expect(people).toEqual(original);
    for (const d of ["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25", "2026-12-21"])
      expect(result.people[1]!.assignments[d]).toBe(original[1]!.assignments[d]);
    expect(result.people[0]!.assignments).toEqual(original[0]!.assignments);
  });
  it("preserva dias explícitos herdados e histórico mesmo ao mover o dia fixo", () => {
    const people = [person("A", 2), person("B", 2)];
    const outside = [{}, { "2026-11-30": "AT", "2027-01-01": "M. 1", "2027-01-02": "AT" }];
    const result = balanceFixedRests(people, "2026-12", rule, outside, [
      {},
      { "2026-12-08": "Folga", "2027-01-01": "M. 1" },
    ]);
    expect(result.people[1]!.assignments["2026-12-08"]).toBe("Folga");
    expect(result.outsideAssignments[1]).toMatchObject(outside[1]!);
  });
  it("não prolonga férias do mês encerrado, mantendo AT sem retorno confirmado", () => {
    const people = [person("Férias", 2), person("AT", 2)];
    for (const d of dates) {
      people[0]!.assignments[d] = "Férias";
      people[1]!.assignments[d] = "AT";
    }
    const result = balanceFixedRests(people, "2026-12", rule);
    expect(result.outsideAssignments[0]?.["2027-01-02"]).toBe("M. 1");
    expect(result.outsideAssignments[1]?.["2027-01-02"]).toBe("AT");
  });
});
