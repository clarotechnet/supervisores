import { describe, it, expect } from "vitest";
import {
  generateSchedulePreview,
  generateInitialRnDecemberPreview,
} from "../src/lib/schedule-generator";
import {
  editControlPreviewCode,
  editControlPreviewPerson,
  addControlPreviewPerson,
  removeControlPreviewPerson,
} from "../src/lib/schedule-preview-editor";
import { rnDecemberReference } from "../src/lib/schedule-rn-december-reference";
import type { ScheduleUpload } from "../src/lib/types";
import {
  findScheduleCell,
  officialMonthValues,
  parseOfficialMonthTab,
} from "../supabase/functions/_shared/schedule-google-source";
function source(sector = "vt", city = "natal"): ScheduleUpload {
  const reference = rnDecemberReference(sector)!;
  return {
    id: "10000000-0000-0000-0000-000000000001",
    city,
    sector,
    schedule_month: "2026-11-01",
    source_file: "TEST",
    source_sheet: "NOV",
    employee_count: reference.length,
    entry_count: reference.length,
    imported_by: null,
    imported_at: "",
    updated_at: "",
    payload: {
      dates: ["2026-11-30"],
      codes: ["M. 1"],
      people: reference.map((p) => ({ ...p, assignments: { "2026-11-30": "M. 1" } })),
    },
  };
}
describe("edição de todas as prévias e vínculo único com Sheets", () => {
  for (const [front, count] of [
    ["adesao-servico", 78],
    ["mdu", 3],
    ["vt", 17],
    ["mossoro", 8],
    ["construcao", 27],
    ["desconexao", 7],
  ] as const) {
    it("carrega exatamente o modelo mensal de " + front, () => {
      const base = source(front, front === "mossoro" ? "mossoro" : "natal"),
        preview = generateInitialRnDecemberPreview(base),
        reference = rnDecemberReference(front)!;
      expect(preview.payload.people).toHaveLength(count);
      preview.payload.people.forEach((p, i) =>
        preview.payload.dates.forEach((date) =>
          expect(p.assignments[date]).toBe(reference[i]!.assignments[date]),
        ),
      );
      const original = JSON.stringify(preview),
        day = "2026-12-01";
      const edited = editControlPreviewCode(preview, 0, day, "AT");
      expect(edited.payload.people[0]!.assignments[day]).toBe("AT");
      expect(JSON.stringify(preview)).toBe(original);
      expect(rnDecemberReference(front)![0]!.assignments[day]).toBe(reference[0]!.assignments[day]);
      expect(() => editControlPreviewCode(preview, 0, "2026-11-30", "AT")).toThrow();
    });
  }
  it("edita também a geração normal sem referência inicial", () => {
    const preview = generateSchedulePreview(source("vt"), "2026-12");
    expect(preview.referenceSeedId).toBeUndefined();
    const edited = editControlPreviewCode(preview, 0, "2026-12-06", "AT");
    expect(edited.payload.people[0]!.assignments["2026-12-06"]).toBe("AT");
    expect(edited.eventCoverage.find((item) => item.date === "2026-12-06")?.assigned).toBe(
      edited.payload.people.filter((p) => p.assignments["2026-12-06"]?.startsWith("M.")).length,
    );
  });
  it("permite nome/login/função e inclusão/remoção fora do Controle", () => {
    const preview = generateInitialRnDecemberPreview(source("vt"));
    let next = addControlPreviewPerson(preview);
    const index = next.payload.people.length - 1;
    next = editControlPreviewPerson(next, index, "name", "TEST NEW");
    next = editControlPreviewPerson(next, index, "login", "TESTLOGIN");
    next = editControlPreviewPerson(next, index, "jobTitle", "TÉCNICO");
    expect(next.payload.people[index]?.login).toBe("TESTLOGIN");
    expect(removeControlPreviewPerson(next, index).payload.people).toEqual(preview.payload.people);
  });
  it("recalcula a cobertura e remove a pendência quando o valor é restaurado", () => {
    const preview = generateInitialRnDecemberPreview(source("vt")),
      date = "2026-12-06";
    const index = preview.payload.people.findIndex((p) => p.assignments[date] === "M. 1");
    const reduced = editControlPreviewCode(preview, index, date, "AT");
    expect(reduced.eventCoverage.find((item) => item.date === date)?.assigned).toBe(4);
    expect(
      reduced.blockingIssues.some((line) => line.startsWith(date + ": cobertura de plantão 4/5")),
    ).toBe(true);
    const restored = editControlPreviewCode(reduced, index, date, "M. 1");
    expect(
      restored.blockingIssues.some((line) => line.startsWith(date + ": cobertura de plantão")),
    ).toBe(false);
  });
  it("resolve a célula por identidade/data, mesmo após mover a linha", () => {
    const payload = generateInitialRnDecemberPreview(source("vt")).payload,
      rows = officialMonthValues(payload, "2026-12");
    [rows[2], rows[3]] = [rows[3]!, rows[2]!];
    expect(
      findScheduleCell(
        rows,
        "2026-12",
        payload.people[0]!.name,
        payload.people[0]!.login || "",
        "2026-12-06",
      ).a1,
    ).toBe("I4");
    expect(() => findScheduleCell(rows, "2026-12", "PESSOA AUSENTE", "", "2026-12-06")).toThrow();
    expect(() =>
      findScheduleCell(
        [...rows, rows[3]!],
        "2026-12",
        payload.people[0]!.name,
        payload.people[0]!.login || "",
        "2026-12-06",
      ),
    ).toThrow("ambíguo");
  });
  it("sincroniza o formato mensal oficial e detecta alterações de estrutura", () => {
    const payload = generateInitialRnDecemberPreview(source("vt")).payload,
      rows = officialMonthValues(payload, "2026-12");
    rows[2]![3] = "FALTA";
    const result = parseOfficialMonthTab(rows, payload, payload, "2026-12");
    expect(result.changes).toHaveLength(1);
    expect(result.payload.people[0]!.assignments["2026-12-01"]).toBe("FALTA");
    rows[2]![1] = "OUTRO";
    expect(() => parseOfficialMonthTab(rows, payload, payload, "2026-12")).toThrow();
  });
});

describe("revisão conserva regras de cada frente", () => {
  it("avisa repetição de plantão antes das duas rodadas intermediárias na VT", () => {
    const p = generateInitialRnDecemberPreview(source("vt"));
    const index = p.payload.people.findIndex(
      (person) => person.assignments["2026-12-06"] === "M. 1",
    );
    const changed = editControlPreviewCode(p, index, "2026-12-13", "M. 1");
    expect(
      changed.blockingIssues.some(
        (line) =>
          line.includes("intervalo de rodízio") &&
          line.startsWith(changed.payload.people[index]!.name),
      ),
    ).toBe(true);
  });
  it("mantém o turno M. 2 no sábado da Construção durante revisão manual", () => {
    const p = generateInitialRnDecemberPreview(source("construcao"));
    const index = p.payload.people.findIndex(
      (person) => person.assignments["2026-12-05"] === "M. 2",
    );
    const changed = editControlPreviewCode(p, index, "2026-12-05", "M. 1");
    expect(
      changed.blockingIssues.some((line) => line.includes("turno de sábado deve ser M. 2")),
    ).toBe(true);
    expect(
      editControlPreviewCode(changed, index, "2026-12-05", "M. 2").blockingIssues.some(
        (line) =>
          line.includes("turno de sábado deve ser M. 2") &&
          line.startsWith(p.payload.people[index]!.name),
      ),
    ).toBe(false);
  });
});
