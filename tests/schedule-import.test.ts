import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseScheduleWorkbook, scheduleCodeKind } from "../src/lib/schedule-import";

describe("importação de escalas", () => {
  it("interpreta a matriz com Nome, Função, datas e códigos", async () => {
    const workbook = new ExcelJS.Workbook();
    const oldSheet = workbook.addWorksheet("SETEMBRO 2026");
    oldSheet.addRow(["", "", new Date(2026, 8, 1), new Date(2026, 8, 2)]);
    oldSheet.addRow(["Nome", "Função", "01", "02"]);
    oldSheet.addRow(["Ignorado", "CONTROLADOR", "T. 1", "Folga"]);

    const sheet = workbook.addWorksheet("OUTUBRO 2026 - ORIGINAL");
    sheet.addRow([
      "",
      "",
      new Date(2026, 9, 1),
      new Date(2026, 9, 2),
      new Date(2026, 9, 3),
      new Date(2026, 9, 4),
    ]);
    sheet.addRow(["Nome", "Função", "01", "02", "03", "04"]);
    sheet.addRow(["Maria da Silva", "CONTROLADOR - NTL", "T. 1", "T. 2", "Folga", "FÉRIAS"]);
    sheet.addRow(["João Santos", "SUPERVISOR - NTL", "Folga", "T. 1", "LCC.", "T. 2"]);

    const data = await workbook.xlsx.writeBuffer();
    const file = new File([data as BlobPart], "escala-outubro.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseScheduleWorkbook(file);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.sheetName).toBe("OUTUBRO 2026 - ORIGINAL");
    expect(parsed[0]?.month).toBe("2026-10-01");
    expect(parsed[0]?.employeeCount).toBe(2);
    expect(parsed[0]?.entryCount).toBe(8);
    expect(parsed[0]?.payload.people[0]).toMatchObject({
      name: "Maria da Silva",
      jobTitle: "CONTROLADOR - NTL",
      assignments: { "2026-10-01": "T. 1", "2026-10-04": "FÉRIAS" },
    });
  });

  it("classifica trabalho, folga, férias e licença", () => {
    expect(scheduleCodeKind("T. 1")).toBe("work");
    expect(scheduleCodeKind("Folga")).toBe("off");
    expect(scheduleCodeKind("FÉRIAS")).toBe("vacation");
    expect(scheduleCodeKind("LCC.")).toBe("leave");
  });
});
