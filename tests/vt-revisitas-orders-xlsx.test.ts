import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  classifyVtOrders,
  vtFilterOrderDetails,
  vtSeconds,
  type VtClassified,
  type VtOrder,
} from "../src/lib/vt-revisitas";
import { buildVtOrderDetailsWorkbook } from "../src/lib/vt-revisitas-orders-xlsx";

const scope = { city: "natal", month: "2026-11", technician: "Técnico Teste" } as const;
const service = "VISITA TECNICA - VIRTUA";
const order = (os: string, fields: Partial<VtOrder> = {}): VtOrder => ({
  id: `OS:${os}`,
  os,
  wo: "00123|000405",
  contract: "000200",
  day: "2026-11-04",
  time: "08:02:44",
  technician: scope.technician,
  municipality: "NATAL",
  neighborhood: "TIROL",
  node: "",
  service,
  code: 549,
  description: "",
  expunge: false,
  ...fields,
});

async function reopenExport(rows: readonly VtClassified[]) {
  const source = await buildVtOrderDetailsWorkbook(rows, scope);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await source.xlsx.writeBuffer());
  return workbook.getWorksheet("Ordens de serviço")!;
}

describe("Excel do detalhamento de Revisitas", () => {
  it("mantém IDs como texto, datas e horas ordenáveis, classificação e O.S. de retorno", async () => {
    const rows = classifyVtOrders([
      order("0000000000000000123", { description: "=1+1" }),
      order("000002", { day: "2026-11-08", code: 540 }),
      order("000003", { day: "2026-11-03", time: "", code: 0, contract: "000201" }),
      order("000004", {
        day: "2026-11-02",
        code: 510,
        service: "MANUTENCAO PREVENTIVA INDOOR I",
      }),
    ]).map((row) => ({ ...row, technicianLogin: "Z00001" }));
    const sheet = await reopenExport(rows);

    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBe("A1:N5");
    expect(sheet.getCell("A3").value).toEqual(new Date("2026-11-04T00:00:00Z"));
    expect(sheet.getCell("A3").numFmt).toBe("dd/mm/yyyy");
    expect(vtSeconds(sheet.getCell("B3").value)).toBe(8 * 3600 + 2 * 60 + 44);
    expect(sheet.getCell("B3").numFmt).toBe("hh:mm:ss");
    expect(sheet.getCell("B4").value).toBeNull();
    expect(sheet.getCell("C3").value).toBe("Técnico Teste");
    expect(sheet.getCell("D3").value).toBe("Z00001");
    expect(sheet.getCell("E3").value).toBe("0000000000000000123");
    expect(sheet.getCell("E3").numFmt).toBe("@");
    expect(sheet.getCell("F3").value).toBe("00123|000405");
    expect(sheet.getCell("G3").value).toBe("000200");
    expect(sheet.getCell("H3").value).toBe("TIROL");
    expect(sheet.getCell("I3").value).toBe("NATAL");
    expect(sheet.getCell("J3").value).toBe(service);
    expect(sheet.getCell("K3").value).toBe(549);
    expect(sheet.getCell("L3").value).toBe("=1+1");
    expect(sheet.getCell("M3").value).toBe("Revisita produtiva");
    expect(sheet.getCell("N3").value).toBe("000002");
    expect(sheet.getCell("K4").value).toBe(0);
    expect(sheet.getCell("M4").value).toBe("Cancelada");
    expect(sheet.getCell("N4").value).toBeNull();
    expect(sheet.getCell("M5").value).toBe("Produtiva");
    expect(sheet.getCell("N5").value).toBeNull();
  });

  it("exporta todas as ordens que passam por serviço, classificação e busca", async () => {
    const rows = classifyVtOrders([
      ...Array.from({ length: 81 }, (_, i) => order(`001${i + 100}`, { code: 203 })),
      order("0001", { code: 203, service: "VISITA TECNICA DIGITAL" }),
      order("0002", { code: 540 }),
      order("0003", { code: 204, neighborhood: "IGAPO" }),
    ]);
    const detail = vtFilterOrderDetails(rows, { category: "expunge", search: "Tírol", service });
    const sheet = await reopenExport(detail);

    expect(detail).toHaveLength(81);
    expect(sheet.rowCount).toBe(82);
    expect(sheet.autoFilter).toBe("A1:N82");
    expect(sheet.getColumn(5).values.slice(2)).toEqual(detail.map((row) => row.os));
    expect(sheet.getColumn(13).values.slice(2)).toEqual(Array(81).fill("Expurgada"));
  });
});
