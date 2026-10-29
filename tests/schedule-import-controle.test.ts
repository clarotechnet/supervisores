import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseScheduleWorkbook, scheduleCodeKind } from "../src/lib/schedule-import";

describe("importação da escala Controle dezembro/2026", () => {
  it("reconhece cabeçalhos 01/12, 42 técnicos e dias estendidos de janeiro/2027", async () => {
    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("12-2026");
    const oneTo31 = Array.from({ length: 31 }, (_, i) =>
      String(i + 1).padStart(2, "0") + "/12");
    sh.addRow(["COLABORADOR", "FUNÇÃO", ...oneTo31, 46023, 46024, 46025]);
    sh.addRow(["", "", ...Array(34).fill("")]);
    for (let i = 0; i < 42; i++) {
      const normal = Array.from({ length: 34 }, () => "T. 1");
      for (const day of [6, 13, 20, 27, 34]) normal[day - 1] = "Folga";
      if (i < 3) {
        normal[5] = "PLANTÃO";   // 06/12
        normal[31] = "PLANTÃO";  // 01/01 (2027, ainda que número do Excel seja 2026)
        normal[33] = "PLANTÃO";  // 03/01
      }
      sh.addRow(["TESTE " + i, i < 3
        ? "SUPERVISOR COP (ADS)" : "CONTROLADOR (ADESÃO)", ...normal]);
    }
    const data = await wb.xlsx.writeBuffer();
    const file = {
      name: "Escala_INTERNO_Dezembro_2026.xlsx",
      arrayBuffer: async () => Uint8Array.from(data).buffer,
    } as File;
    const result = await parseScheduleWorkbook(file);
    expect(result).toHaveLength(1);
    const parsed = result[0]!;
    expect(parsed.month).toBe("2026-12-01");
    expect(parsed.employeeCount).toBe(42);
    expect(parsed.payload.dates).toHaveLength(34);
    expect(parsed.payload.dates.slice(-3)).toEqual([
      "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(parsed.payload.people[0]?.assignments["2027-01-01"]).toBe("PLANTÃO");
    expect(parsed.warnings.some((x) => x.includes("ano anterior"))).toBe(true);
    expect(scheduleCodeKind("PLANTÃO")).toBe("work");
  });
});
