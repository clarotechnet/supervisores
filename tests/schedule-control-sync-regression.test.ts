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
import { findScheduleCell } from "../supabase/functions/_shared/schedule-google-source";
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
const reorderedPlan: Payload = {
  ...planned,
  people: [
    { ...structuredClone(planned.people[0]!), name: "ANTONIA ELIZIENE" },
    {
      name: "MATHEUS FREITAS",
      jobTitle: "ANALISTA",
      assignments: { "2026-12-01": "Folga", "2026-12-02": "T. 1" },
    },
    {
      name: "THIRD EMPLOYEE",
      jobTitle: "SUPERVISOR COP",
      assignments: { "2026-12-01": "T. 1", "2026-12-02": "T. 1" },
    },
  ],
};
function reorderedControlRows(): unknown[][] {
  const rows: unknown[][] = controlMonthValues(reorderedPlan, "2026-12");
  rows[0]![1] = 46357;
  [rows[2], rows[3], rows[4]] = [rows[3]!, rows[4]!, rows[2]!];
  return rows;
}
describe("regressão da leitura Controle dezembro/janeiro", () => {
  it("associa linhas reordenadas pelo nome e mantém os dias e a auditoria da pessoa correta", () => {
    const rows = reorderedControlRows();
    rows[2]![2] = "T. 1";
    rows[4]![2] = "Folga";
    rows[4]![1] = "CONTROLADOR (DESC FTZ)";
    const before = structuredClone(reorderedPlan);
    const originalRows = structuredClone(rows);
    const previous = structuredClone(reorderedPlan);
    previous.people.reverse();
    const result = parseControlMonthTab(rows, reorderedPlan, previous, "2026-12");
    expect(result.payload.people.map((p) => p.name)).toEqual(
      reorderedPlan.people.map((p) => p.name),
    );
    expect(result.changes).toEqual([
      {
        employee_key: "NOME:ANTONIA ELIZIENE",
        employee_name: "ANTONIA ELIZIENE",
        duty_date: "2026-12-01",
        planned_code: "T. 1",
        previous_code: "T. 1",
        current_code: "Folga",
      },
      {
        employee_key: "NOME:MATHEUS FREITAS",
        employee_name: "MATHEUS FREITAS",
        duty_date: "2026-12-01",
        planned_code: "Folga",
        previous_code: "Folga",
        current_code: "T. 1",
      },
    ]);
    expect(result.payload.people[0]!.assignments["2026-12-02"]).toBe("Folga");
    expect(result.payload.people[1]!.assignments["2026-12-02"]).toBe("T. 1");
    expect(result.payload.people[2]).toMatchObject(reorderedPlan.people[2]!);
    expect(result.functionChanges).toEqual([
      {
        employee_name: "ANTONIA ELIZIENE",
        previous_function: "CONTROLADOR (DESC FTA)",
        current_function: "CONTROLADOR (DESC FTZ)",
      },
    ]);
    const again = parseControlMonthTab(rows, reorderedPlan, result.payload, "2026-12");
    expect(again.changes).toEqual([]);
    expect(again.functionChanges).toEqual([]);
    expect(reorderedPlan).toEqual(before);
    expect(rows).toEqual(originalRows);
    // O editor deve localizar a célula física da pessoa, mesmo que a ordem mude.
    expect(findScheduleCell(rows, "2026-12", "ANTONIA ELIZIENE", "", "2026-12-01")).toMatchObject({
      a1: "C5",
      code: "Folga",
    });
    expect(findScheduleCell(rows, "2026-12", "MATHEUS FREITAS", "", "2026-12-01")).toMatchObject({
      a1: "C3",
      code: "T. 1",
    });
  });
  it("reordenar sem editar os dias não cria alterações ou eventos de função", () => {
    const result = parseControlMonthTab(
      reorderedControlRows(),
      reorderedPlan,
      reorderedPlan,
      "2026-12",
    );
    expect(result.payload.people).toMatchObject(reorderedPlan.people);
    expect(result.changes).toEqual([]);
    expect(result.functionChanges).toEqual([]);
  });
  it.each(["OTHER EMPLOYEE", "", null, 123, " ANTONIA ELIZIENE "])(
    "continua rejeitando pessoa desconhecida ou identificação inválida: %s",
    (name) => {
      const rows = reorderedControlRows();
      rows[4]![0] = name;
      expect(() => parseControlMonthTab(rows, reorderedPlan, reorderedPlan, "2026-12")).toThrow(
        "Identificação alterada na linha 5",
      );
    },
  );
  it("rejeita nomes repetidos mesmo com a quantidade correta de linhas", () => {
    const rows = reorderedControlRows();
    rows[4]![0] = "MATHEUS FREITAS";
    expect(() => parseControlMonthTab(rows, reorderedPlan, reorderedPlan, "2026-12")).toThrow(
      "Identificação duplicada na linha 5: MATHEUS FREITAS",
    );
  });
  it("rejeita remover ou adicionar colaboradores e função vazia após reordenação", () => {
    const rows = reorderedControlRows();
    expect(() =>
      parseControlMonthTab(rows.slice(0, -1), reorderedPlan, reorderedPlan, "2026-12"),
    ).toThrow("Quantidade de colaboradores");
    expect(() =>
      parseControlMonthTab([...rows, rows[2]!], reorderedPlan, reorderedPlan, "2026-12"),
    ).toThrow("Quantidade de colaboradores");
    rows[2]![1] = "";
    expect(() => parseControlMonthTab(rows, reorderedPlan, reorderedPlan, "2026-12")).toThrow(
      "Função inválida para MATHEUS FREITAS",
    );
  });
  it.each([
    46357,
    "dezembro 26",
    "  Dezembro\u00a026  ",
    "DEZEMBRO 2026",
    "dez. 26",
    "2026-12",
    "2026-12-01",
    "01/12/2026",
    "01/12/26",
    "12/2026",
  ])("aceita B1 equivalente a dezembro sem perder a alteração de folga: %s", (monthCell) => {
    const rows: unknown[][] = controlMonthValues(planned, "2026-12");
    rows[0]![1] = monthCell;
    rows[2]![2] = "Folga";
    const result = parseControlMonthTab(rows, planned, planned, "2026-12");
    expect(result.payload.people[0]!.assignments["2026-12-01"]).toBe("Folga");
    expect(result.changes).toHaveLength(1);
    expect(result.payload.dates).toEqual(planned.dates);
    expect(rows[0]![1]).toBe(monthCell);
  });
  it.each([
    46356,
    46388,
    "dezembro 25",
    "janeiro 27",
    "2027-12-01",
    "01/11/2026",
    "31/02/2026",
    "",
    null,
    { month: "2026-12" },
  ])("rejeita B1 de outro mês/ano ou sem competência verificável: %s", (monthCell) => {
    const rows: unknown[][] = controlMonthValues(planned, "2026-12");
    rows[0]![1] = monthCell;
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
      "Cabeçalho do mês",
    );
  });
  it("reconhece a competência de janeiro na virada do ano e março com acento", () => {
    for (const [month, value] of [
      ["2027-01", 46388],
      ["2027-03", "março 27"],
    ] as const) {
      const rows: unknown[][] = controlMonthValues(planned, month);
      rows[0]![1] = value;
      expect(parseControlMonthTab(rows, planned, planned, month).payload.dates).toEqual(
        planned.dates,
      );
      expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
        "Cabeçalho do mês",
      );
    }
  });
  it("a tolerância de B1 não permite trocar A1 ou reordenar as datas", () => {
    const rows: unknown[][] = controlMonthValues(planned, "2026-12");
    rows[0]![1] = 46357;
    rows[0]![0] = "Outra informação";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("A1 inválido");
    rows[0]![0] = " mês-ano: ";
    rows[1]![2] = "02/12";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
      "Cabeçalho da data",
    );
  });
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
  it("continua protegendo a identidade no Controle e a função nas demais origens", () => {
    const rows = controlMonthValues(planned, "2026-12");
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

describe("funções da aba Controle como fonte sincronizada", () => {
  it.each([
    ["CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO", "CONTROLADOR (ADESÃO) - FTZ - APOIO"],
    ["CONTROLADOR (ADESÃO APOIO) - NTL", "CONTROLADOR (ADESÃO) - NTL - APOIO"],
    ["CONTROLADOR (ADESÃO APOIO) - RCF", "CONTROLADOR (ADESÃO) - RCF - APOIO"],
    ["CONTROLADOR (CONSTRUÇÃO)", "CONTROLADOR (CONSTRUÇÃO) - APOIO"],
    ["CONTROLADOR (DESC NTL)", "CONTROLADOR (DESC APOIO)"],
    ["CONTROLADOR (DESC APOIO)", "CONTROLADOR (DESC APOIO) - APOIO"],
    ["CONTROLADOR (MANUT FTZ)", "CONTROLADOR (MANUT NTL)"],
    ["SUPERVISOR COP (ADS FTZ)", "SUPERVISOR COP - FTZ - MSRO"],
    ["SUPERVISOR COP (ADS NTL)", "SUPERVISOR COP - NTL"],
    ["SUPERVISOR COP (ADS RCF)", "SUPERVISOR COP - RCF"],
    ["SUPERVISOR COP (C.MDU)", "SUPERVISOR COP - MDU"],
    ["SUPERVISOR COP (DESC)", "SUPERVISOR COP - DESC"],
    ["SUPERVISOR COP (VT)", "SUPERVISOR COP - VT"],
  ])("sincroniza função/base de %s para %s sem alterar o planejamento", (before, after) => {
    const source = structuredClone(planned);
    source.people[0]!.jobTitle = before;
    const rows = controlMonthValues(source, "2026-12");
    rows[2]![1] = after;
    const result = parseControlMonthTab(rows, source, source, "2026-12");
    expect(result.payload.people[0]!.jobTitle).toBe(after);
    expect(result.payload.people[0]!.name).toBe(source.people[0]!.name);
    expect(result.changes).toEqual([]);
    expect(result.functionChanges).toEqual([
      {
        employee_name: source.people[0]!.name,
        previous_function: before,
        current_function: after,
      },
    ]);
    const again = parseControlMonthTab(rows, source, result.payload, "2026-12");
    expect(again.functionChanges).toEqual([]);
    expect(source.people[0]!.jobTitle).toBe(before);
  });
  it.each(["", "  ", null, 123, "A".repeat(161), "<script>", "CONTROLADOR\nCOP", "=TEST()"])(
    "rejeita descrição de função inválida: %s",
    (value) => {
      const rows: unknown[][] = controlMonthValues(planned, "2026-12");
      rows[2]![1] = value;
      expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
        "Função inválida",
      );
    },
  );
});
