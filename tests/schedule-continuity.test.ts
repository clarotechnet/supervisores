import { describe, expect, it } from "vitest";
import { generateSchedulePreview } from "../src/lib/schedule-generator";
import { buildAssistedGeneration } from "../src/lib/schedule-assisted-generation";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import {
  editControlPreviewCode,
  revalidateSchedulePreview,
} from "../src/lib/schedule-preview-editor";
import { previewAnalysisInput, analyzePreview } from "../src/lib/schedule-preview-analysis";
import { operationalFromDraft } from "../supabase/functions/_shared/schedule-operational";
import {
  controlMonthValues,
  readControlMonthSource,
} from "../supabase/functions/_shared/schedule-operational-master";
import { isInheritedScheduleDate } from "../src/lib/schedule-continuity";
import type { ScheduleUpload } from "../src/lib/types";

function december(): ScheduleUpload {
  const dates = [
    ...scheduleMonthDates("2026-12"),
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
    "2027-01-04",
  ];
  const people = ["S COP", "C ADESAO", "Pessoa AT", "Pessoa férias", "Pessoa L"].map((name, i) => ({
    name,
    login: "47",
    jobTitle: i === 0 ? "SUPERVISOR COP" : "CONTROLADOR ADESÃO",
    assignments: Object.fromEntries(
      dates.map((d) => [
        d,
        new Date(d + "T12:00:00Z").getUTCDay() === 0 || new Date(d + "T12:00:00Z").getUTCDay() === 1
          ? "Folga"
          : "T. 1",
      ]),
    ),
  }));
  for (const [i, code] of ["PLANTÃO", "Folga", "AT", "Férias", "Licença"].entries())
    for (const day of dates.filter((d) => d.startsWith("2027"))) people[i]!.assignments[day] = code;
  return {
    id: "source",
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-12-01",
    source_file: "test",
    source_sheet: "Controle DEZEMBRO 26 - 5X2",
    imported_by: null,
    imported_at: "",
    updated_at: "fresh",
    employee_count: people.length,
    entry_count: 0,
    payload: { dates, people, codes: ["T. 1", "Folga", "PLANTÃO", "AT", "Férias", "Licença"] },
  };
}
describe("continuidade entre competências do Controle", () => {
  it("preserva toda célula preenchida até 04/01 em todas as opções, fecha domingo–sábado até 06/02 e não altera a origem", () => {
    const source = december(),
      before = structuredClone(source);
    for (const p of Object.values(buildAssistedGeneration(source, "2027-01").previews)) {
      expect(p.calendarWeeks.at(-1)).toEqual([
        "2027-01-31",
        "2027-02-01",
        "2027-02-02",
        "2027-02-03",
        "2027-02-04",
        "2027-02-05",
        "2027-02-06",
      ]);
      const operational = operationalFromDraft(p.payload, p.calendarWeeks, p.outsideAssignments);
      for (const person of source.payload.people) {
        const generated = operational.people.find((x) => x.name === person.name)!;
        for (const [date, code] of Object.entries(person.assignments).filter(
          ([d]) => d >= "2026-12-27",
        ))
          expect(generated.assignments[date], person.name + "/" + date).toBe(code);
        expect(generated.assignments["2027-01-05"]).toBeTruthy();
        expect(generated.assignments["2027-02-06"]).toBeTruthy();
      }
      expect(p.blockingIssues.some((s) => /2027-01-01.*cobertura/.test(s))).toBe(true);
    }
    expect(source).toEqual(before);
  });
  it("associa por colaborador, mesmo com linhas reordenadas e IDs legados repetidos", () => {
    const source = december();
    const p = generateSchedulePreview(source, "2027-01");
    p.payload.people.reverse();
    p.outsideAssignments.reverse();
    expect(
      revalidateSchedulePreview(p).blockingIssues.filter((s) => s.includes("dia herdado")),
    ).toEqual([]);
    for (const person of p.payload.people)
      expect(isInheritedScheduleDate(p, person, "2027-01-04")).toBe(true);
    expect(() => editControlPreviewCode(p, 0, "2027-01-04", "Folga")).toThrow("herdado");
  });
  it("bloqueia alterações manuais, revalida corrupção e não oferece compensação IA nos dias herdados", () => {
    const p = generateSchedulePreview(december(), "2027-01");
    expect(() => editControlPreviewCode(p, 0, "2027-01-02", "Folga")).toThrow("herdado");
    const input = previewAnalysisInput(p);
    const analysis = analyzePreview(input);
    for (const issue of analysis.issues) {
      for (const candidate of issue.candidates) {
        const person = p.payload.people.find((x) => x.name === candidate.name)!;
        expect(isInheritedScheduleDate(p, person, issue.date)).toBe(false);
        if (candidate.compensation)
          expect(isInheritedScheduleDate(p, person, candidate.compensation.date)).toBe(false);
      }
      for (const option of issue.restOptions || []) {
        const person = p.payload.people.find((x) => x.name === issue.affected[0])!;
        expect(isInheritedScheduleDate(p, person, option.date)).toBe(false);
      }
    }
    p.payload.people[0]!.assignments["2027-01-04"] = "Folga";
    expect(
      revalidateSchedulePreview(p).blockingIssues.some((s) => s.includes("dia herdado 2027-01-04")),
    ).toBe(true);
  });
  it("aplica a mesma proteção no mês seguinte", () => {
    const jan = generateSchedulePreview(december(), "2027-01");
    const source = {
      ...december(),
      schedule_month: "2027-01-01",
      payload: operationalFromDraft(jan.payload, jan.calendarWeeks, jan.outsideAssignments),
    };
    const feb = generateSchedulePreview(source, "2027-02");
    for (const person of feb.payload.people)
      for (let day = 1; day <= 6; day++) {
        const date = `2027-02-0${day}`;
        expect(person.assignments[date]).toBe(
          source.payload.people.find((p) => p.name === person.name)!.assignments[date],
        );
        expect(isInheritedScheduleDate(feb, person, date)).toBe(true);
      }
  });
  it("lê a extensão até 04/01 adicionada ao Sheets após o snapshot e recusa cabeçalhos fora de sequência", () => {
    const source = december(),
      live = source.payload;
    const stale = { ...live, dates: live.dates.filter((d) => d <= "2027-01-02") };
    const rows = controlMonthValues(live, "2026-12");
    rows.splice(2, rows.length - 2, ...rows.slice(2).reverse());
    const result = readControlMonthSource(rows, stale, stale, "2026-12");
    expect(result.payload.dates.at(-1)).toBe("2027-01-04");
    expect(result.payload.people).toEqual(live.people);
    rows[1]![rows[1]!.length - 1] = "06/01";
    expect(() => readControlMonthSource(rows, stale, stale, "2026-12")).toThrow("sequência");
  });
});
