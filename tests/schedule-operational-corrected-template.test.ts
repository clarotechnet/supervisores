import { describe, expect, it } from "vitest";
import {
  operationalFromDraft,
  operationalFormattedValues,
  parseUpdatedSheet,
} from "../supabase/functions/_shared/schedule-operational";
import { operationalSheetFormatting } from "../supabase/functions/_shared/schedule-operational-format";
import { controlDecemberReference } from "../src/lib/schedule-control-december-reference";
import { generateInitialControlDecemberPreview } from "../src/lib/schedule-generator";
import type { ScheduleUpload } from "../src/lib/types";
describe("Corrigida: Excel real → rascunho → Sheets novo", () => {
  const people = controlDecemberReference();
  it("preserva o Excel novo com 42 pessoas, 35 dias, plantões e férias", () => {
    const source: ScheduleUpload = {
      id: "test",
      city: "natal",
      sector: "controle-operacional",
      schedule_month: "2026-11-01",
      source_file: "6x1",
      source_sheet: "11-2026",
      imported_by: null,
      imported_at: "",
      updated_at: "",
      employee_count: 42,
      entry_count: 42,
      payload: {
        dates: ["2026-11-30"],
        codes: ["T. 1"],
        people: people.map((p) => ({
          name: p.name,
          jobTitle: p.jobTitle,
          login: "47",
          assignments: { "2026-11-30": "T. 1" },
        })),
      },
    };
    const preview = generateInitialControlDecemberPreview(source);
    expect(preview.blockingIssues.filter((x) => x.includes("confirmar exceção 5x2"))).toHaveLength(
      0,
    );
    const output = operationalFromDraft(
      preview.payload,
      preview.calendarWeeks,
      preview.outsideAssignments,
    );
    expect(output.people).toHaveLength(42);
    expect(output.dates.at(-1)).toBe("2027-01-04");
    expect(output.people.every((p) => p.login === "")).toBe(true);
    for (let i = 0; i < 42; i++) {
      for (const date of Object.keys(people[i]!.assignments))
        expect(output.people[i]!.assignments[date]).toBe(people[i]!.assignments[date]);
    }
    const values = operationalFormattedValues(output);
    expect(values[0]?.[5]).toBe("01/12 TER");
    expect(values[0]?.at(-1)).toBe("04/01 SEG");
    const result = parseUpdatedSheet(values, output, output);
    expect(result.changes).toEqual([]);
    const legacyHeader = [...values[0]!];
    legacyHeader[4] = "2026-11-30";
    legacyHeader[5] = "2026-12-01";
    legacyHeader[legacyHeader.length - 1] = "2027-01-04";
    values[0] = legacyHeader;
    expect(parseUpdatedSheet(values, output, output).changes).toEqual([]);
    const requests = operationalSheetFormatting(output);
    expect(requests.some((x) => "addConditionalFormatRule" in x)).toBe(true);
    expect(requests.some((x) => "setDataValidation" in x)).toBe(true);
  });
});
