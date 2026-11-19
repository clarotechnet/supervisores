import { parseVtAttendance, parseVtOrders, type VtCity, type VtImportKind } from "./vt-revisitas";

export async function readVtWorkbook(file: File, kind: VtImportKind, city: VtCity, month: string) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 16 * 1024 * 1024)
    throw Error("Selecione um arquivo XLSX de até 16 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  let firstError: unknown;
  for (const sheet of book.worksheets) {
    if (sheet.actualRowCount < 2) continue;
    if (sheet.rowCount > 15021) throw Error("O arquivo está acima de 15.000 linhas de dados.");
    const rows = Array.from({ length: sheet.rowCount }, (_, i) => {
      const row = sheet.getRow(i + 1);
      return Array.from({ length: Math.min(sheet.columnCount, 100) }, (_, column) => {
        const value = row.getCell(column + 1).value;
        if (value && typeof value === "object") {
          if ("result" in value) return value.result ?? null;
          if ("richText" in value) return value.richText.map((part) => part.text).join("");
          if ("text" in value) return value.text;
        }
        return value;
      });
    });
    try {
      return kind === "orders"
        ? parseVtOrders(rows, city, month)
        : parseVtAttendance(rows, kind, city, month);
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.startsWith("Cabeçalho") &&
        !error.message.startsWith("Informe um cabeçalho")
      )
        throw error;
      firstError ??= error;
    }
  }
  throw firstError ?? Error("Nenhuma aba com dados compatíveis foi encontrada.");
}
