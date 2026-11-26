import {
  VT_CITIES,
  vtOrderClassification,
  vtSeconds,
  type VtCity,
  type VtClassified,
} from "./vt-revisitas";

export interface VtOrderExportScope {
  city: VtCity;
  month: string;
  technician: string;
}

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function buildVtOrderDetailsWorkbook(
  rows: readonly VtClassified[],
  scope: VtOrderExportScope,
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TechNET";
  workbook.title = `Ordens de serviço VT - ${VT_CITIES[scope.city]} - ${scope.month}`;
  const sheet = workbook.addWorksheet("Ordens de serviço", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const identifier = { numFmt: "@", alignment: { horizontal: "left" as const } };
  const wrappedText = { alignment: { wrapText: true, vertical: "middle" as const } };
  sheet.columns = [
    { header: "Data", width: 14, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Início", width: 13, style: { numFmt: "hh:mm:ss" } },
    { header: "Técnico", width: 38, style: wrappedText },
    { header: "Login", width: 14, style: identifier },
    { header: "O.S.", width: 22, style: identifier },
    { header: "WO", width: 24, style: identifier },
    { header: "Contrato", width: 16, style: identifier },
    { header: "Bairro", width: 23 },
    { header: "Município", width: 22 },
    { header: "Serviço", width: 42, style: wrappedText },
    { header: "Cód. de baixa", width: 17 },
    { header: "Descrição da baixa", width: 45, style: wrappedText },
    { header: "Classificação", width: 27 },
    { header: "O.S. retorno", width: 24, style: identifier },
  ];
  for (const row of rows) {
    const day = new Date(`${row.day}T00:00:00Z`);
    const seconds = vtSeconds(row.time);
    sheet.addRow([
      Number.isNaN(day.getTime()) ? row.day || null : day,
      seconds === null ? null : seconds / 86400,
      row.technician,
      row.technicianLogin || null,
      row.os || null,
      row.wo || null,
      row.contract,
      row.neighborhood || null,
      row.municipality,
      row.service || null,
      row.code,
      row.description || null,
      vtOrderClassification(row),
      row.returnOs || null,
    ]);
  }
  sheet.autoFilter = { from: "A1", to: { row: sheet.rowCount, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.height = 23;
  header.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183450" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  return workbook;
}

export async function downloadVtOrderDetailsXlsx(
  rows: readonly VtClassified[],
  scope: VtOrderExportScope,
) {
  const workbook = await buildVtOrderDetailsWorkbook(rows, scope);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const blob = new Blob([bytes], { type: xlsxMime });
  const slug = [VT_CITIES[scope.city], scope.month, scope.technician]
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100)
    .replace(/-+$/, "");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `technet-revisitas-os-${slug}.xlsx`;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
