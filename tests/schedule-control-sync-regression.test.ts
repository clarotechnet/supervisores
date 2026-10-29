import { describe, it, expect } from "vitest";
import {
  controlMonthValues,
  parseControlMonthTab,
  controlMonthFormatting,
} from "../supabase/functions/_shared/schedule-operational-master";
import {
  operationalValues,
  parseUpdatedSheet,
  type Payload,
} from "../supabase/functions/_shared/schedule-operational";
const planned: Payload = {
  dates: [
    "2026-12-01",
    "2026-12-02",
    "2026-12-03",
    "2026-12-04",
    "2026-12-05",
    "2026-12-06",
    "2026-12-07",
  ],
  codes: ["T. 1"],
  people: [
    {
      name: "TEST EMPLOYEE",
      jobTitle: "CONTROLADOR (DESC FTA)",
      assignments: { "2026-12-01": "T. 1", "2026-12-02": "Folga" },
    },
  ],
};
describe("regressão da leitura Controle dezembro/janeiro", () => {
  it("gera Nome/Função e identifica B2 numérico sem aceitar estrutura desconhecida", () => {
    const rows: unknown[][] = controlMonthValues(planned, "2026-12");
    expect(rows[1]!.slice(0, 2)).toEqual(["Nome", "Função"]);
    rows[1]![1] = 0;
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("B2 inválido");
  });
  it("aceita capitalização do cabeçalho sem mudar a competência ou as datas", () => {
    const rows = controlMonthValues(planned, "2026-12");
    rows[1]![0] = " NOME ";
    rows[1]![1] = "FUNCAO";
    expect(parseControlMonthTab(rows, planned, planned, "2026-12").payload.dates).toEqual(
      planned.dates,
    );
    rows[1]![2] = "02/12";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
      "Cabeçalho da data",
    );
  });
  it("sincroniza a correção FTA/FTZ junto das folgas e identifica a alteração de função", () => {
    const rows = controlMonthValues(planned, "2026-12");
    rows[2]![1] = "CONTROLADOR (DESC FTZ)";
    rows[2]![2] = "Folga";
    const result = parseControlMonthTab(rows, planned, planned, "2026-12");
    expect(result.payload.people[0]!.jobTitle).toBe("CONTROLADOR (DESC FTZ)");
    expect(result.changes).toHaveLength(1);
    expect(result.functionChanges).toEqual([
      {
        employee_name: "TEST EMPLOYEE",
        previous_function: "CONTROLADOR (DESC FTA)",
        current_function: "CONTROLADOR (DESC FTZ)",
      },
    ]);
    expect(parseControlMonthTab(rows, planned, result.payload, "2026-12").functionChanges).toEqual(
      [],
    );
    expect(planned.people[0]!.jobTitle).toBe("CONTROLADOR (DESC FTA)");
  });
  it("continua rejeitando trocar a pessoa ou a função operacional de cobertura", () => {
    const rows = controlMonthValues(planned, "2026-12");
    rows[2]![1] = "SUPERVISOR COP";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("Identificação");
    rows[2]![1] = planned.people[0]!.jobTitle;
    rows[2]![0] = "ANOTHER EMPLOYEE";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("Identificação");
    const legacy = operationalValues(planned);
    legacy[1]![2] = "CONTROLADOR (DESC FTZ)";
    expect(() => parseUpdatedSheet(legacy, planned, planned)).toThrow("Identificação");
  });
  it("avisa ao editar os dois cabeçalhos sem bloquear as linhas de folgas", () => {
    const request = controlMonthFormatting(123, 42, 37).find((r) => "addProtectedRange" in r)!;
    expect(request).toMatchObject({
      addProtectedRange: {
        protectedRange: {
          warningOnly: true,
          range: {
            sheetId: 123,
            startRowIndex: 0,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: 39,
          },
        },
      },
    });
  });
});
