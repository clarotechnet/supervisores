import { describe, expect, it } from "vitest";
import type { ScheduleUpload } from "../src/lib/types";
import {
  controlDecemberReference,
  CONTROL_DECEMBER_REFERENCE_ID,
} from "../src/lib/schedule-control-december-reference";
import {
  generateInitialControlDecemberPreview,
  generateSchedulePreview,
} from "../src/lib/schedule-generator";
import { operationalFromDraft } from "../supabase/functions/_shared/schedule-operational";

function november(): ScheduleUpload {
  const people = controlDecemberReference().map((p, i) => ({
    name: p.name,
    jobTitle: p.jobTitle,
    login: "Z" + String(10000 + i),
    assignments: { "2026-11-30": "T. 1" },
  }));
  people.find((p) => p.name === "ANA PATRICIA")!.assignments["2026-11-30"] = "Férias";
  return {
    id: "nov-ref",
    city: "natal",
    sector: "controle-operacional",
    schedule_month: "2026-11-01",
    source_file: "Novembro 6x1",
    source_sheet: "11-2026",
    imported_by: null,
    imported_at: "",
    updated_at: "",
    employee_count: people.length,
    entry_count: people.length,
    payload: { people, dates: ["2026-11-30"], codes: ["T. 1", "Férias"] },
  };
}
describe("Controle RN: implantação inicial dezembro 2026 (modelo Excel)", () => {
  it("reproduz 42 colaboradores, 35 dias e 3 plantonistas em 5 eventos de dezembro", () => {
    const people = controlDecemberReference();
    expect(people).toHaveLength(42);
    expect(Object.keys(people[0]!.assignments)).toHaveLength(35);
    const preview = generateInitialControlDecemberPreview(november());
    expect(preview.referenceSeedId).toBe(CONTROL_DECEMBER_REFERENCE_ID);
    expect(preview.payload.people).toHaveLength(42);
    expect(preview.payload.dates).toHaveLength(31);
    expect(preview.eventCoverage.map((e) => [e.date, e.assigned])).toEqual([
      ["2026-12-06", 3],
      ["2026-12-13", 3],
      ["2026-12-20", 3],
      ["2026-12-25", 3],
      ["2026-12-27", 3],
    ]);
    expect(preview.blockingIssues.some((s) => s.includes("folga fixa não identificada"))).toBe(
      false,
    );
    expect(preview.warnings.some((s) => s.includes("novembro era 6x1"))).toBe(true);
    expect(preview.eventCoverage.every((e) => e.planned === 3)).toBe(true);
  });
  it("não prolonga Férias de novembro se a referência traz escala explícita em dezembro", () => {
    const s = november();
    const p = generateInitialControlDecemberPreview(s);
    expect(p.payload.people.find((x) => x.name === "ANA PATRICIA")?.assignments["2026-12-01"]).toBe(
      "T. 1",
    );
    expect(
      p.warnings.some(
        (s) => s.includes("ANA PATRICIA") && s.includes("confirmar data efetiva de retorno"),
      ),
    ).toBe(true);
    expect(
      p.blockingIssues.some(
        (s) => s.includes("ANA PATRICIA") && s.includes("confirmar datas de Férias"),
      ),
    ).toBe(false);
    expect(s.payload.people.find((x) => x.name === "ANA PATRICIA")?.assignments["2026-11-30"]).toBe(
      "Férias",
    );
  });
  it("preserva plantões e folgas de 01 a 04/01 no rascunho e na planilha editável", () => {
    const p = generateInitialControlDecemberPreview(november());
    const rosa = p.payload.people.findIndex((x) => x.name === "ROSA FERNANDA");
    expect(p.outsideAssignments[rosa]?.["2027-01-01"]).toBe("PLANTÃO");
    expect(p.outsideAssignments[rosa]?.["2027-01-04"]).toBe("T. 1");
    const operational = operationalFromDraft(p.payload, p.calendarWeeks, p.outsideAssignments);
    expect(operational.dates[0]).toBe("2026-11-29");
    expect(operational.dates.at(-1)).toBe("2027-01-04");
    expect(operational.dates).toHaveLength(37);
    const draft = operational.people.find((x) => x.name === "ROSA FERNANDA")!;
    expect(draft.assignments["2027-01-01"]).toBe("PLANTÃO");
    expect(draft.assignments["2027-01-04"]).toBe("T. 1");
    expect(draft.login).toMatch(/^Z/);
  });
  it("avisa somente violações reais do modelo e não ajusta 6x1 de exceções silenciosamente", () => {
    const p = generateInitialControlDecemberPreview(november());
    const jose = p.payload.people.find((x) => x.name === "JOSE VICTOR")!;
    expect(jose.assignments["2026-12-08"]).toBe("Folga");
    // Four corrected employees now have the missing rest days in the UPDATED Excel.
    for (const name of ["JOSE VICTOR", "STUART ARAUJO", "EVANIO", "ANA PATRICIA"]) {
      expect(p.blockingIssues.some((s) => s.startsWith(name + ": referência de dezembro"))).toBe(
        false,
      );
    }
    expect(p.blockingIssues.filter((s) => s.includes("confirmar exceção 5x2"))).toHaveLength(0);
    // MARTA foi falsamente sinalizada no agrupamento segunda–domingo.
    // Domingo 13/12 pertence à semana 13–19, distinta de 06–12.
    expect(p.blockingIssues.some((s) => s.startsWith("MARTA MARIA: referência de dezembro"))).toBe(
      false,
    );
    expect(p.calendarWeeks.some((w) => w[0] === "2026-12-06" && w[6] === "2026-12-12")).toBe(true);
    expect(p.blockingIssues.every((s) => !s.includes("folga fixa não identificada"))).toBe(true);
  });
  it("MARTA tem plantão domingo 06/12 e folgas na segunda 07 e sexta 11", () => {
    const p = generateInitialControlDecemberPreview(november());
    const m = p.payload.people.find((x) => x.name === "MARTA MARIA")!;
    expect(m.assignments["2026-12-06"]).toBe("PLANTÃO");
    expect(m.assignments["2026-12-07"]).toBe("Folga");
    expect(m.assignments["2026-12-11"]).toBe("Folga");
    const week = p.calendarWeeks.find((w) => w[0] === "2026-12-06")!;
    expect(week.filter((d) => m.assignments[d] === "Folga")).toHaveLength(2);
    expect(m.assignments["2026-12-13"]).toBe("Folga");
    expect(p.blockingIssues.some((s) => s.startsWith("MARTA MARIA: referência"))).toBe(false);
  });
  it("janeiro continua usando dezembro como mês base, fora do fluxo de implantação", () => {
    const ref = generateInitialControlDecemberPreview(november());
    const current = operationalFromDraft(ref.payload, ref.calendarWeeks, ref.outsideAssignments);
    const source: ScheduleUpload = {
      ...november(),
      schedule_month: "2026-12-01",
      payload: current,
    };
    const jan = generateSchedulePreview(source, "2027-01");
    expect(
      jan.payload.people.find((p) => p.name === "ROSA FERNANDA")?.assignments["2027-01-04"],
    ).toBe("T. 1");
    expect(jan.sourceMonth).toBe("2026-12");
  });
});
