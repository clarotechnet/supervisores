import { describe, expect, it } from "vitest";
import { buildQuarkNearHomeReport, selectQuarkNearPunches } from "../src/lib/quark-location-report";
import { createQuarkLocationWorkbook } from "../src/lib/quark-location-export";
import { locationPersonView, nearSelectionPunches } from "./fixtures/quark-location";

const baseReport = () => buildQuarkNearHomeReport([locationPersonView!], nearSelectionPunches, 200);

describe("seleção de registros da lista de batidas próximas", () => {
  it("permite selecionar duas linhas com o mesmo número original, sem agrupar outras batidas do dia", () => {
    const report = selectQuarkNearPunches(baseReport(), ["2026-10-28-3", "2026-11-07-3"]);
    expect(report.details.map(({ punch }) => punch.point_id)).toEqual([
      "2026-11-07-3",
      "2026-10-28-3",
    ]);
    expect(report.details.map(({ dayNumber }) => dayNumber)).toEqual([3, 3]);
    expect(report.ranking[0]).toMatchObject({ nearPunches: 2, nearDays: 2, validPunches: 12 });
    expect(report.ranking[0]!.nearRate).toBeCloseTo((2 / 12) * 100);
  });
  it("permite só uma linha entre duas com o mesmo número original", () => {
    const report = selectQuarkNearPunches(baseReport(), ["2026-11-07-3"]);
    expect(report.details.map(({ punch }) => punch.point_id)).toEqual(["2026-11-07-3"]);
    expect(report.details[0]!.dayNumber).toBe(3);
  });
  it("somente seleciona registros que já passaram pelo filtro de proximidade", () => {
    const report = selectQuarkNearPunches(baseReport(), [
      "2026-10-28-3",
      "2026-10-28-1",
      "2026-10-28-4",
      "inexistente",
    ]);
    expect(report.details.map(({ punch }) => punch.point_id)).toEqual(["2026-10-28-3"]);
  });
  it("selecionar todas mantém os mesmos registros e denominador do relatório original", () => {
    const report = baseReport();
    expect(report.details).toHaveLength(3);
    expect(selectQuarkNearPunches(report, null)).toEqual(report);
    expect(
      selectQuarkNearPunches(
        report,
        report.details.map(({ punch }) => punch.point_id),
      ),
    ).toEqual(report);
  });
  it("seleção vazia ou IDs fora do período não voltam silenciosamente a todos", () => {
    const report = baseReport();
    expect(selectQuarkNearPunches(report, [])).toEqual({ ranking: [], details: [] });
    const october = buildQuarkNearHomeReport(
      [locationPersonView!],
      nearSelectionPunches.filter((row) => row.work_date.startsWith("2026-10")),
      200,
    );
    expect(selectQuarkNearPunches(october, ["2026-11-07-3"]).details).toEqual([]);
    expect(
      selectQuarkNearPunches(buildQuarkNearHomeReport([], nearSelectionPunches, 200), [
        "2026-11-07-3",
      ]).details,
    ).toEqual([]);
  });
  it("IDs continuam ligados às linhas certas após reordenação ou atualização do raio, sem alterar a fonte", () => {
    const original = JSON.stringify(nearSelectionPunches);
    const report = baseReport();
    const base = JSON.stringify(report);
    const ids = ["2026-10-28-3", "2026-11-07-3"];
    expect(
      selectQuarkNearPunches(
        buildQuarkNearHomeReport([locationPersonView!], [...nearSelectionPunches].reverse(), 3000),
        ids,
      ).details.map(({ punch }) => punch.point_id),
    ).toEqual(["2026-11-07-3", "2026-10-28-3"]);
    selectQuarkNearPunches(report, ids);
    expect(JSON.stringify(report)).toBe(base);
    expect(JSON.stringify(nearSelectionPunches)).toBe(original);
  });
  it("XLSX inclui somente as duas linhas marcadas, com data, hora e número original", async () => {
    const report = selectQuarkNearPunches(baseReport(), ["2026-10-28-3", "2026-11-07-3"]);
    const bytes = await createQuarkLocationWorkbook(
      report,
      "2026-10-26",
      "2026-11-25",
      200,
      "individual",
      { punchSelection: "2 de 3 batida(s) próxima(s) selecionada(s)" },
    );
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const summary = workbook.getWorksheet("Resumo individual")!;
    const details = workbook.getWorksheet("Batidas próximas")!;
    expect(summary.getCell("F3").value).toBe("2 de 3 batida(s) próxima(s) selecionada(s)");
    expect(summary.getCell("G6").value).toBe(2);
    expect(summary.getCell("I6").value).toBe(12);
    expect(details.rowCount).toBe(7);
    expect([6, 7].map((row) => details.getCell(`D${row}`).value)).toEqual([
      "2026-11-07",
      "2026-10-28",
    ]);
    expect([6, 7].map((row) => details.getCell(`K${row}`).value)).toEqual([3, 3]);
  }, 30000);
});
