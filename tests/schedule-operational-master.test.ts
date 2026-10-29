import { describe, it, expect } from "vitest";
import {
  CONTROL_EXPECTED_MASTER_ID,
  CONTROL_NOVEMBER_TAB,
  controlMonthTabName,
  controlTemplateTab,
  controlMonthValues,
  parseControlMonthTab,
  controlMonthFormatting,
  usesControlMaster,
} from "../supabase/functions/_shared/schedule-operational-master";
import type { Payload } from "../supabase/functions/_shared/schedule-operational";
const people = [
  {
    name: "MARTA MARIA",
    login: "",
    jobTitle: "SUPERVISOR COP",
    assignments: {
      "2026-11-29": "Folga",
      "2026-11-30": "T. 1",
      "2026-12-01": "T. 1",
      "2026-12-02": "T. 1",
      "2026-12-03": "T. 1",
      "2026-12-04": "T. 1",
      "2026-12-05": "Folga",
    },
  },
  {
    name: "ROBSON CARLOS",
    login: "",
    jobTitle: "SUPERVISOR COP",
    assignments: {
      "2026-11-29": "T. 1",
      "2026-11-30": "Folga",
      "2026-12-01": "T. 1",
      "2026-12-02": "T. 1",
      "2026-12-03": "T. 1",
      "2026-12-04": "T. 1",
      "2026-12-05": "Folga",
    },
  },
];
const dates = Object.keys(people[0]!.assignments);
const planned: Payload = { dates, people, codes: ["Folga", "T. 1"] };
describe("aba mensal na planilha mestre Controle RN", () => {
  it("mesmo workbook do botão Atualizar via API, sem arquivo novo", () => {
    expect(CONTROL_EXPECTED_MASTER_ID).toBe("1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64");
    expect(CONTROL_NOVEMBER_TAB).toBe("Controle NOVEMBRO 26 - ORIGINAL");
    expect(usesControlMaster("natal", "controle-operacional")).toBe(true);
    expect(controlMonthTabName("2026-12-01")).toBe("Controle DEZEMBRO 26 - 5X2");
    expect(controlMonthTabName("2027-01-01")).toBe("Controle JANEIRO 27 - 5X2");
    expect(controlTemplateTab("2026-12-01")).toBe(CONTROL_NOVEMBER_TAB);
    expect(controlTemplateTab("2027-01-01")).toBe("Controle DEZEMBRO 26 - 5X2");
  });
  it("preserva estrutura da aba original: 2 cabeçalhos e nome/função", () => {
    const matrix = controlMonthValues(planned, "2026-12-01");
    expect(matrix).toHaveLength(4);
    expect(matrix[0]!.slice(0, 4)).toEqual(["Mês-ano:", "DEZEMBRO 26", "DOM", "SEG"]);
    expect(matrix[1]!.slice(0, 4)).toEqual(["Nome", "Função", "29/11", "30/11"]);
    expect(matrix[2]!.slice(0, 4)).toEqual(["MARTA MARIA", "SUPERVISOR COP", "Folga", "T. 1"]);
    expect(parseControlMonthTab(matrix, planned, planned, "2026-12-01").changes).toHaveLength(0);
  });
  it("sincroniza mudança de plantão, falta, atestado e retorno por data, sem tocar no planejamento", () => {
    const matrix = controlMonthValues(planned, "2026-12-01");
    matrix[2]![4] = "AT";
    matrix[3]![4] = "FALTA";
    const result = parseControlMonthTab(matrix, planned, planned, "2026-12-01");
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]).toMatchObject({
      employee_name: "MARTA MARIA",
      duty_date: "2026-12-01",
      previous_code: "T. 1",
      current_code: "AT",
    });
    expect(result.payload.people[1]!.assignments["2026-12-01"]).toBe("FALTA");
    expect(planned.people[0]!.assignments["2026-12-01"]).toBe("T. 1");
    matrix[2]![4] = "T. 1";
    expect(
      parseControlMonthTab(matrix, planned, result.payload, "2026-12-01").changes[0]?.previous_code,
    ).toBe("AT");
  });
  it("bloqueia datas, identidade e linhas alteradas", () => {
    const original = controlMonthValues(planned, "2026-12-01");
    const data = JSON.parse(JSON.stringify(original)) as string[][];
    data[1]![4] = "02/12";
    expect(() => parseControlMonthTab(data, planned, planned, "2026-12-01")).toThrow(
      "Cabeçalho da data",
    );
    const wrong = JSON.parse(JSON.stringify(original)) as string[][];
    wrong[2]![0] = "OUTRA PESSOA";
    expect(() => parseControlMonthTab(wrong, planned, planned, "2026-12-01")).toThrow(
      "Identificação alterada",
    );
    expect(() =>
      parseControlMonthTab(original.slice(0, -1), planned, planned, "2026-12-01"),
    ).toThrow("Quantidade de colaboradores");
  });
  it("formata somente a nova aba, mantendo as antigas intactas", () => {
    const requests = controlMonthFormatting(1760000, 42, 37, [0, 5, 18]);
    expect(requests.some((x) => "setDataValidation" in x)).toBe(true);
    const greenRows = requests.filter((x) => {
      if (!("repeatCell" in x)) return false;
      const cell = x.repeatCell as {
        cell?: { userEnteredFormat?: { backgroundColor?: { green: number } } };
      };
      return (
        Math.abs((cell.cell?.userEnteredFormat?.backgroundColor?.green || 0) - 176 / 255) < 0.001
      );
    });
    expect(greenRows).toHaveLength(3);
    expect(requests.some((x) => "addConditionalFormatRule" in x)).toBe(true);
    expect(JSON.stringify(requests)).not.toContain("1202571719");
    expect(JSON.stringify(requests)).toContain("1760000");
  });
});
