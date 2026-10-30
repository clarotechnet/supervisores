import { describe, expect, it } from "vitest";
import {
  controlMonthValues,
  parseControlMonthTab,
  readControlMonthSource,
} from "../supabase/functions/_shared/schedule-operational-master";
import type { Payload } from "../supabase/functions/_shared/schedule-operational";

// Mesmo formato da aba: 42 pessoas nas linhas 3–44, datas até 04/01,
// totais em 45–46, critérios em 59–60 e indicadores nas colunas AN/AO.
function fixture(formattedTotals = false) {
  const dates = Array.from({ length: 37 }, (_, index) =>
    new Date(Date.UTC(2026, 10, 29 + index)).toISOString().slice(0, 10),
  );
  const planned: Payload = {
    dates,
    codes: ["T. 1"],
    people: Array.from({ length: 42 }, (_, index) => ({
      name: `COLABORADOR TESTE ${index + 1}`,
      jobTitle: "CONTROLADOR",
      assignments: Object.fromEntries(dates.map((date) => [date, "T. 1"])),
    })),
  };
  const rows: unknown[][] = controlMonthValues(planned, "2026-12");
  rows[1]!.push("PLATÕES", "quantidades");
  for (const row of rows.slice(2)) row.push("Não", 0);
  rows.push(
    [null, null, ...dates.map((_, i) => (formattedTotals ? String(i) : i))],
    ["", "", ...dates.map(() => (formattedTotals ? "0" : 0))],
  );
  while (rows.length < 58) rows.push([]);
  rows.push(["T. 1"], ["PLANTÃO"]);
  return { rows, planned };
}

describe("fórmulas auxiliares da aba mensal de Controle", () => {
  it.each([false, true])(
    "ignora totais numéricos, legendas e colunas auxiliares sem importar pessoas/datas/códigos extras (formatado=%s)",
    (formatted) => {
      const { rows, planned } = fixture(formatted);
      const before = structuredClone(rows);
      for (const parse of [parseControlMonthTab, readControlMonthSource]) {
        const result = parse(rows, planned, planned, "2026-12");
        expect(result.payload).toEqual(planned);
        expect(result.changes).toEqual([]);
        expect(result.functionChanges).toEqual([]);
      }
      expect(rows).toEqual(before);
    },
  );
  it("mantém o vínculo por nome e sincroniza só a marcação realmente editada", () => {
    const { rows, planned } = fixture();
    [rows[2], rows[43]] = [rows[43]!, rows[2]!];
    rows[2]![2] = "Folga";
    const result = parseControlMonthTab(rows, planned, planned, "2026-12");
    expect(result.payload.people).toHaveLength(42);
    expect(result.payload.people[41]!.assignments["2026-11-29"]).toBe("Folga");
    expect(result.payload.people[0]!.assignments["2026-11-29"]).toBe("T. 1");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.employee_name).toBe("COLABORADOR TESTE 42");
    expect(result.payload.codes).not.toContain("Não");
  });
  it("lê a extensão real até 04/01 mesmo com resumos depois das datas", () => {
    const { rows, planned } = fixture();
    const stale = { ...planned, dates: planned.dates.slice(0, -2) };
    rows[2]![38] = "Folga";
    const result = readControlMonthSource(rows, stale, stale, "2026-12");
    expect(result.payload.dates).toEqual(planned.dates);
    expect(result.payload.people[0]!.assignments["2027-01-04"]).toBe("Folga");
    expect(result.payload.people).toHaveLength(42);
  });
  it.each([
    ["COLABORADOR TESTE 1", "CONTROLADOR", "T. 1"],
    ["T. 1", "CONTROLADOR", "T. 1"],
    ["NOVO COLABORADOR"],
    ["", "", "T. 1"],
    ["PLANTÃO", "", "T. 1"],
  ])("continua rejeitando linha extra ambígua ou duplicada: %j", (...row) => {
    const { rows, planned } = fixture();
    rows.push(row);
    for (const parse of [parseControlMonthTab, readControlMonthSource])
      expect(() => parse(rows, planned, planned, "2026-12")).toThrow();
  });
  it.each(["antes dos totais", "depois das legendas"])(
    "inclui pessoa nova com Nome/Função %s, sem duplicar em novas atualizações",
    (position) => {
      const { rows, planned } = fixture();
      const newRow = ["NOVA PESSOA", "CONTROLADORA", ...planned.dates.map(() => "Folga")];
      rows.splice(position === "antes dos totais" ? 44 : rows.length, 0, newRow);
      const original = structuredClone(planned);
      const result = parseControlMonthTab(rows, planned, planned, "2026-12");
      expect(result.payload.people).toHaveLength(43);
      expect(result.addedPeople).toHaveLength(1);
      expect(result.addedPeople[0]).toMatchObject({
        name: "NOVA PESSOA",
        login: "",
        jobTitle: "CONTROLADORA",
      });
      expect(result.changes).toHaveLength(planned.dates.length);
      expect(
        result.changes.every(
          (change) =>
            change.employee_name === "NOVA PESSOA" &&
            change.previous_code === "" &&
            change.planned_code === "",
        ),
      ).toBe(true);
      const again = parseControlMonthTab(rows, planned, result.payload, "2026-12");
      expect(again.payload).toEqual(result.payload);
      expect(again.addedPeople).toEqual([]);
      expect(again.changes).toEqual([]);
      expect(planned).toEqual(original);
      expect(readControlMonthSource(rows, planned, planned, "2026-12").payload).toEqual(
        result.payload,
      );
      rows.splice(position === "antes dos totais" ? 44 : rows.length - 1, 1);
      expect(() => parseControlMonthTab(rows, planned, result.payload, "2026-12")).toThrow(
        "não remove pessoas",
      );
    },
  );
  it("inclui pessoa com dias vazios sem criar marcações e recusa duplicata com caixa diferente", () => {
    const { rows, planned } = fixture();
    rows.push(["NOVA PESSOA", "CONTROLADOR"]);
    const result = parseControlMonthTab(rows, planned, planned, "2026-12");
    expect(result.addedPeople).toHaveLength(1);
    expect(result.changes).toEqual([]);
    expect(Object.values(result.addedPeople[0]!.assignments).every((code) => code === "")).toBe(
      true,
    );
    rows.push(["nova pessoa", "CONTROLADOR"]);
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("duplicada");
  });
  it("não usa os totais para encobrir a remoção de um colaborador", () => {
    const { rows, planned } = fixture();
    rows.splice(43, 1);
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("Identificação");
  });
  it.each(["06/01", "2027-01-06", "06-01"])(
    "não confunde uma extensão de data inválida com coluna auxiliar: %s",
    (heading) => {
      const { rows, planned } = fixture();
      rows[0]![39] = "TER";
      rows[1]![39] = heading;
      expect(() => readControlMonthSource(rows, planned, planned, "2026-12")).toThrow("sequência");
    },
  );
  it("rejeita data após uma coluna auxiliar ou uma coluna de marcações sem cabeçalho", () => {
    for (const gap of [false, true]) {
      const { rows, planned } = fixture();
      rows[0]![gap ? 41 : 39] = gap ? "TER" : "";
      rows[1]![gap ? 41 : 39] = gap ? "05/01" : "";
      rows[2]![gap ? 41 : 39] = "T. 1";
      expect(() => readControlMonthSource(rows, planned, planned, "2026-12")).toThrow("sequência");
    }
  });
  it("continua validando cabeçalhos, nomes e valores dos dias dentro da tabela", () => {
    const { rows, planned } = fixture();
    rows[1]![2] = "30/11";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow(
      "Cabeçalho da data",
    );
    rows[1]![2] = "29/11";
    rows[2]![2] = 42;
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("Use texto");
    rows[2]![0] = "PESSOA DESCONHECIDA";
    expect(() => parseControlMonthTab(rows, planned, planned, "2026-12")).toThrow("Identificação");
  });
});
