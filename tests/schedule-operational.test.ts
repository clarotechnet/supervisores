import { describe, expect, it } from "vitest";
import {
  employeeKey,
  operationalFromDraft,
  operationalValues,
  parseUpdatedSheet,
  type Payload,
} from "../supabase/functions/_shared/schedule-operational";

const payload: Payload = {
  dates: ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"],
  codes: ["T. 1", "Folga", "PLANTÃO"],
  people: [
    {
      name: "SUPERVISOR A",
      login: "Z123",
      jobTitle: "SUPERVISOR COP",
      assignments: {
        "2026-12-28": "T. 1",
        "2026-12-29": "Folga",
        "2026-12-30": "T. 1",
        "2026-12-31": "T. 1",
      },
    },
    {
      name: "CONTROLADOR B",
      jobTitle: "CONTROLADOR (ADESÃO)",
      assignments: {
        "2026-12-28": "T. 1",
        "2026-12-29": "T. 1",
        "2026-12-30": "PLANTÃO",
        "2026-12-31": "Folga",
      },
    },
  ],
};
const weeks = [
  [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ],
];
const outside = [
  { "2027-01-01": "Folga", "2027-01-02": "T. 1", "2027-01-03": "Folga" },
  { "2027-01-01": "T. 1", "2027-01-02": "Folga", "2027-01-03": "PLANTÃO" },
];
describe("planilha operacional: planejamento, revisão e auditoria", () => {
  it("leva toda a semana e preserva a base imutável", () => {
    const planned = operationalFromDraft(payload, weeks, outside);
    expect(planned.dates).toHaveLength(7);
    expect(planned.people[1]?.assignments["2027-01-03"]).toBe("PLANTÃO");
    expect(payload.people[0]?.assignments["2027-01-03"]).toBeUndefined();
  });
  it("registra AT, retorno normal e substituição sem alterar o planejado", () => {
    const planned = operationalFromDraft(payload, weeks, outside);
    const rows = operationalValues(planned);
    rows[1]![3] = "AT"; // supervisor afastou-se em 28/12
    rows[2]![3] = "PLANTÃO"; // controlador cobre
    let current = parseUpdatedSheet(rows, planned, planned);
    expect(current.changes).toHaveLength(2);
    expect(current.changes.find((x) => x.employee_name === "SUPERVISOR A")?.planned_code).toBe(
      "T. 1",
    );
    expect(planned.people[0]?.assignments["2026-12-28"]).toBe("T. 1");
    expect(current.payload.people[0]?.assignments["2026-12-28"]).toBe("AT");
    rows[1]![3] = "T. 1"; // retorno
    const returned = parseUpdatedSheet(rows, planned, current.payload);
    expect(returned.changes).toHaveLength(1);
    expect(returned.changes[0]).toMatchObject({
      previous_code: "AT",
      current_code: "T. 1",
      planned_code: "T. 1",
    });
    expect(employeeKey(planned.people[0]!)).toBe("NOME:SUPERVISOR A");
    expect(employeeKey(planned.people[1]!)).toBe("NOME:CONTROLADOR B");
  });
  it("nega alteração em login, nomes, datas, número de linhas e fórmulas", () => {
    const planned = operationalFromDraft(payload, weeks, outside);
    const rows = operationalValues(planned);
    rows[0]![3] = "31/12";
    expect(() => parseUpdatedSheet(rows, planned, planned)).toThrow("Cabeçalho");
    const names = operationalValues(planned);
    names[1]![1] = "OUTRO";
    expect(() => parseUpdatedSheet(names, planned, planned)).toThrow("Identificação");
    expect(() => parseUpdatedSheet(names.slice(0, -1), planned, planned)).toThrow("Linhas");
    const formulas = operationalValues(planned);
    formulas[2]![4] = 10 as unknown as string;
    expect(() => parseUpdatedSheet(formulas, planned, planned)).toThrow("Use texto");
  });
  it("não duplica alteração ao sincronizar sem edições adicionais", () => {
    const planned = operationalFromDraft(payload, weeks, outside);
    const result = parseUpdatedSheet(operationalValues(planned), planned, planned);
    expect(result.changes).toEqual([]);
  });
});
