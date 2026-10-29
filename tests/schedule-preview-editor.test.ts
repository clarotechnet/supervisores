import { describe, expect, it } from "vitest";
import { scheduleCodeKind } from "../src/lib/schedule-import";
import type { ScheduleUpload } from "../src/lib/types";
import { controlDecemberReference } from "../src/lib/schedule-control-december-reference";
import { generateInitialControlDecemberPreview } from "../src/lib/schedule-generator";
import {
  addControlPreviewPerson,
  editControlPreviewCode,
  editControlPreviewPerson,
  editControlPreviewDutyEligibility,
  removeControlPreviewPerson,
  revalidateControlPreview,
} from "../src/lib/schedule-preview-editor";

const base: ScheduleUpload = {
  id: "6x1-2026-11",
  city: "natal",
  sector: "controle-operacional",
  schedule_month: "2026-11-01",
  source_file: "Novembro",
  source_sheet: "11/2026",
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
      login: "Z" + String(10000 + i),
      jobTitle: p.jobTitle,
      assignments: { "2026-11-30": "T. 1" },
    })),
  },
};
const preview = () => generateInitialControlDecemberPreview(base);
describe("modelo de dezembro editável sem sobrescrever referência", () => {
  it("permite consertar uma semana 6x1 escolhendo qualquer folga, sem tocar no Excel", () => {
    const original = preview();
    const index = original.payload.people.findIndex((p) => p.name === "RENAN PAIVA");
    const person = original.payload.people[index]!;
    const day = "2026-12-09"; // Folga fixa adicional na semana do plantão 06/12
    expect(person.assignments[day]).toBe("Folga");
    const invalid = editControlPreviewCode(original, index, day, "T. 1");
    expect(
      invalid.blockingIssues.some(
        (x) => x.includes("RENAN PAIVA") && x.includes("2026-12-06 a 2026-12-12"),
      ),
    ).toBe(true);
    const updated = editControlPreviewCode(invalid, index, day, "Folga");
    expect(
      updated.blockingIssues.some(
        (x) => x.includes("RENAN PAIVA") && x.includes("2026-12-06 a 2026-12-12"),
      ),
    ).toBe(false);
    expect(original.payload.people[index]?.assignments[day]).toBe("Folga");
    expect(controlDecemberReference()[index]?.assignments[day]).toBe("Folga");
  });
  it("recalcula a cobertura quando o plantão muda e restaura quando substituído", () => {
    const original = preview(),
      date = "2026-12-06";
    const index = original.payload.people.findIndex((p) => p.assignments[date] === "PLANTÃO");
    const reduced = editControlPreviewCode(original, index, date, "AT");
    expect(reduced.eventCoverage.find((x) => x.date === date)?.assigned).toBe(2);
    expect(
      reduced.blockingIssues.some((x) => x.startsWith(date + ": cobertura de plantão 2/3")),
    ).toBe(true);
    const restored = editControlPreviewCode(reduced, index, date, "PLANTÃO");
    expect(restored.eventCoverage.find((x) => x.date === date)?.assigned).toBe(3);
    expect(restored.blockingIssues.some((x) => x.startsWith(date + ": cobertura de plantão"))).toBe(
      false,
    );
    expect(original.eventCoverage.find((x) => x.date === date)?.assigned).toBe(3);
  });
  it("edita dia 04/01, mas não modifica 30/11/2026 histórico 6x1", () => {
    const p = preview(),
      i = p.payload.people.findIndex((x) => x.name === "ROSA FERNANDA");
    const changed = editControlPreviewCode(p, i, "2027-01-04", "AT");
    expect(changed.outsideAssignments[i]?.["2027-01-04"]).toBe("AT");
    expect(p.outsideAssignments[i]?.["2027-01-04"]).toBe("T. 1");
    expect(() => editControlPreviewCode(p, i, "2026-11-30", "Folga")).toThrow(
      "não está na referência",
    );
  });
  it("permite mudar nomes, login e cargo, incluir e remover pessoas apenas do rascunho", () => {
    const p = preview();
    let edited = addControlPreviewPerson(p);
    const idx = edited.payload.people.length - 1;
    edited = editControlPreviewPerson(edited, idx, "name", "NOVO TESTE");
    edited = editControlPreviewPerson(edited, idx, "login", "ZNOVO");
    edited = editControlPreviewPerson(edited, idx, "jobTitle", "SUPERVISOR COP");
    expect(edited.payload.people.at(-1)?.name).toBe("NOVO TESTE");
    expect(edited.payload.people.at(-1)?.jobTitle).toBe("SUPERVISOR COP");
    expect(
      edited.blockingIssues.some((x) => x.includes("NOVO TESTE") && x.includes("sem código")),
    ).toBe(true);
    const dropped = removeControlPreviewPerson(edited, idx);
    expect(dropped.payload.people.length).toBe(42);
    expect(p.payload.people.length).toBe(42);
    expect(controlDecemberReference().length).toBe(42);
  });
  it("permite editar a elegibilidade de plantão dos colaboradores verdes sem alterar referência", () => {
    const p = preview();
    const index = p.payload.people.findIndex((x) => x.name === "ANTONIA ELIZIENE");
    expect(p.rule.excludedFromDuty).toContain("ANTONIA ELIZIENE");
    let changed = editControlPreviewDutyEligibility(p, index, true);
    expect(changed.rule.excludedFromDuty).not.toContain("ANTONIA ELIZIENE");
    expect(p.rule.excludedFromDuty).toContain("ANTONIA ELIZIENE");
    changed = editControlPreviewDutyEligibility(changed, index, false);
    expect(changed.rule.excludedFromDuty).toContain("ANTONIA ELIZIENE");
    const renamed = editControlPreviewPerson(changed, index, "name", "ANTONIA TESTE");
    expect(renamed.rule.excludedFromDuty).toContain("ANTONIA TESTE");
    expect(renamed.rule.excludedFromDuty).not.toContain("ANTONIA ELIZIENE");
  });
  it("exige identificação única e não aceita códigos ilegíveis", () => {
    const p = preview();
    const duplicate = editControlPreviewPerson(p, 1, "name", p.payload.people[0]!.name);
    expect(duplicate.blockingIssues.some((x) => x.includes("Nome de colaborador repetido"))).toBe(
      true,
    );
    expect(() => editControlPreviewCode(p, 0, "2026-12-01", "<script>")).toThrow("Código inválido");
    expect(revalidateControlPreview(p).blockingIssues).toHaveLength(p.blockingIssues.length);
  });
});
