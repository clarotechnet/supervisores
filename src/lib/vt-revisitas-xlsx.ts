import {
  parseVtAttendance,
  parseVtOrders,
  vtOrdersLayout,
  type VtCity,
  type VtImportKind,
} from "./vt-revisitas";

export async function readVtWorkbook(file: File, kind: VtImportKind, city: VtCity, month: string) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 16 * 1024 * 1024)
    throw Error("Selecione um arquivo XLSX de até 16 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const candidates = book.worksheets
    .filter((sheet) => sheet.actualRowCount >= 2)
    .map((sheet) => {
      const width = Math.min(sheet.columnCount, 100);
      const readRow = (i: number, columns?: number[]) => {
        const row = sheet.findRow(i + 1);
        if (!row?.hasValues) return [];
        const readCell = (column: number) => {
          const cell = row.findCell(column + 1);
          if (!cell) return null;
          // ExcelJS's formula value object omits falsy results, including numeric zero.
          if (cell.type === ExcelJS.ValueType.Formula) return cell.result ?? null;
          const value = cell.value;
          if (value && typeof value === "object") {
            if ("richText" in value) return value.richText.map((part) => part.text).join("");
            if ("text" in value) return value.text;
          }
          return value;
        };
        if (!columns) return Array.from({ length: width }, (_, column) => readCell(column));
        const values: unknown[] = [];
        for (const column of columns) values[column] = readCell(column);
        return values;
      };
      const header = Array.from({ length: Math.min(sheet.rowCount, 20) }, (_, i) => readRow(i));
      const layout = kind === "orders" ? vtOrdersLayout(header) : undefined;
      const priority = !layout?.fromSheet
        ? 0
        : sheet.name.trim().toUpperCase() === "REVISITAS IMPERIUM 2.0"
          ? 2
          : 1;
      return { sheet, header, layout, readRow, priority };
    });
  candidates.sort((a, b) => b.priority - a.priority);
  let firstError: unknown;
  for (const { sheet, header, layout, readRow } of candidates) {
    if (kind === "orders" && !layout) continue;
    if (sheet.rowCount > (layout?.fromSheet ? 50000 : 15021)) {
      throw Error(
        layout?.fromSheet
          ? "A aba histórica do Sheets ultrapassa 50.000 linhas. Exporte só o recorte desejado."
          : "O arquivo está acima de 15.000 linhas de dados.",
      );
    }
    const usedColumns = layout
      ? [...new Set(Object.values(layout.cols).filter((i) => i >= 0))]
      : undefined;
    const rows = Array.from({ length: sheet.rowCount }, (_, i) => {
      return header[i] ?? readRow(i, usedColumns);
    });
    try {
      return kind === "orders"
        ? { kind, ...parseVtOrders(rows, city, month) }
        : { kind, ...parseVtAttendance(rows, kind, city, month), pendingLines: [] };
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
