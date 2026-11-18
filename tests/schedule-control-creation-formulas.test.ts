import { describe, expect, it } from "vitest";
import {
  controlMonthCreation,
  controlMonthCreationRequests,
} from "../supabase/functions/_shared/schedule-control-formulas";
import {
  parseControlMonthTab,
  readControlMonthSource,
} from "../supabase/functions/_shared/schedule-operational-master";
import type { Payload } from "../supabase/functions/_shared/schedule-operational";

function fixture(count = 42, start = "2026-11-29", days = 37): Payload {
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(Date.parse(start + "T12:00:00Z") + index * 86400000).toISOString().slice(0, 10),
  );
  return {
    dates,
    codes: ["T. 1", "Folga", "PLANTÃO"],
    people: Array.from({ length: count }, (_, i) => ({
      name: "COLABORADOR " + (i + 1),
      jobTitle: "CONTROLADOR",
      fixedRest: "Quarta",
      assignments: Object.fromEntries(dates.map((date) => [date, "T. 1"])),
    })),
  };
}
describe("criação do Controle com indicadores e totais calculados", () => {
  it("gera as referências reais de dezembro, incluindo AN/AO e Folga fixa final em AP", () => {
    const payload = fixture(),
      before = structuredClone(payload);
    const { rows, columnCount, rowCount } = controlMonthCreation(payload, "2026-12");
    expect(columnCount).toBe(42);
    expect(rowCount).toBe(60);
    expect(rows[1]!.values.slice(39).map((cell) => cell.userEnteredValue)).toEqual([
      { stringValue: "PLATÕES" },
      { stringValue: "quantidades" },
      { stringValue: "Folga fixa" },
    ]);
    expect(rows[2]!.values[39]!.userEnteredValue).toEqual({
      formulaValue: '=IF(COUNTIF(C3:AM3;$A$60)>0;"Sim";"Não")',
    });
    expect(rows[2]!.values[40]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(E3:AI3;$A$60)",
    });
    expect(rows[43]!.values[40]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(E44:AI44;$A$60)",
    });
    expect(rows[44]!.values[2]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(C3:C44;$A$59)",
    });
    expect(rows[45]!.values[38]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(AM3:AM44;$A$60)",
    });
    expect(rows[58]!.values[0]!.userEnteredValue).toEqual({ stringValue: "T. 1" });
    expect(rows[59]!.values[0]!.userEnteredValue).toEqual({ stringValue: "PLANTÃO" });
    expect(payload).toEqual(before);
  });
  it("adapta as datas a janeiro e os critérios à quantidade de colaboradores", () => {
    const { rows, rowCount } = controlMonthCreation(fixture(47, "2026-12-27", 37), "2027-01");
    expect(rowCount).toBe(65);
    expect(rows[2]!.values[39]!.userEnteredValue).toEqual({
      formulaValue: '=IF(COUNTIF(C3:AM3;$A$65)>0;"Sim";"Não")',
    });
    expect(rows[48]!.values[40]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(H49:AL49;$A$65)",
    });
    expect(rows[49]!.values[2]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(C3:C49;$A$64)",
    });
    expect(rows[50]!.values[2]!.userEnteredValue).toEqual({
      formulaValue: "=COUNTIF(C3:C49;$A$65)",
    });
  });
  it("cresce o grid da cópia e limpa todo o conteúdo antigo sem limitar a limpeza a AO", () => {
    const requests = controlMonthCreationRequests(987, fixture(55, "2027-01-24", 42), "2027-02", {
      rowCount: 1001,
      columnCount: 41,
    });
    expect(requests[0]).toMatchObject({
      updateSheetProperties: {
        properties: { sheetId: 987, gridProperties: { rowCount: 1001, columnCount: 47 } },
      },
    });
    expect(requests[1]).toEqual({
      updateCells: { range: { sheetId: 987 }, rows: [], fields: "userEnteredValue" },
    });
    for (const request of requests) expect(JSON.stringify(request)).toContain('"sheetId":987');
    expect(JSON.stringify(requests)).not.toContain("sourceSheetId");
  });
  it("mantém textos como texto literal ao escrever fórmulas tipadas", () => {
    const payload = fixture(1);
    payload.people[0]!.name = "=Texto literal";
    const { rows } = controlMonthCreation(payload, "2026-12");
    expect(rows[2]!.values[0]!.userEnteredValue).toEqual({ stringValue: "=Texto literal" });
    expect(rows[2]!.values[2]!.userEnteredValue).toEqual({ stringValue: "T. 1" });
    expect(rows[1]!.values[2]!.userEnteredValue).toEqual({ stringValue: "29/11" });
  });
  it("os resumos calculados não viram pessoas nem datas na sincronização", () => {
    const payload = fixture();
    const rows = controlMonthCreation(payload, "2026-12").rows.map((row) =>
      row.values.map((cell) =>
        "formulaValue" in cell.userEnteredValue ? 0 : cell.userEnteredValue.stringValue,
      ),
    );
    for (const parse of [parseControlMonthTab, readControlMonthSource]) {
      const result = parse(rows, payload, payload, "2026-12");
      expect(result.payload).toEqual({ ...payload, codes: ["T. 1"] });
      expect(result.changes).toEqual([]);
      expect(result.addedPeople).toEqual([]);
    }
  });
  it("recusa uma competência ausente e não gera fórmulas vazias ou referências invertidas", () => {
    expect(() => controlMonthCreation(fixture(), "2027-02")).toThrow("competência");
    expect(() => controlMonthCreation(fixture(0), "2026-12")).toThrow("pessoas");
    const payload = fixture();
    payload.dates.reverse();
    expect(() => controlMonthCreation(payload, "2026-12")).toThrow("sequência");
  });
});

it("usa vírgula somente quando a localidade da planilha usa ponto decimal", () => {
  const payload = fixture();
  const us = controlMonthCreation(payload, "2026-12", "en_US");
  expect(us.rows[2]!.values[40]!.userEnteredValue).toEqual({
    formulaValue: "=COUNTIF(E3:AI3,$A$60)",
  });
  const br = controlMonthCreation(payload, "2026-12", "pt_BR");
  expect(br.rows[2]!.values[40]!.userEnteredValue).toEqual({
    formulaValue: "=COUNTIF(E3:AI3;$A$60)",
  });
});
