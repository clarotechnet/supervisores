import type { SchedulePayload } from "@/lib/types";

export interface ParsedScheduleSheet {
  sheetName: string;
  month: string;
  employeeCount: number;
  entryCount: number;
  payload: SchedulePayload;
  warnings: string[];
}

function text(value: unknown): string {
  if (value && typeof value === "object") {
    if ("result" in value) return text(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => text(part && typeof part === "object" && "text" in part ? part.text : part))
        .join("");
    }
    if ("text" in value) return text(value.text);
  }
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function excelDate(value: unknown): string | null {
  if (value && typeof value === "object" && "result" in value) {
    return excelDate(value.result);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === "number" && value > 20_000 && value < 100_000) {
    const decoded = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return isoDate(decoded.getUTCFullYear(), decoded.getUTCMonth() + 1, decoded.getUTCDate());
  }

  const raw = text(value);
  let match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    const yearValue = Number(match[3]);
    return isoDate(
      yearValue < 100 ? 2000 + yearValue : yearValue,
      Number(match[2]),
      Number(match[1]),
    );
  }

  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return null;
}

function mainMonth(dates: string[]): string {
  const totals = new Map<string, number>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + 1);
  }
  return (
    [...totals.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? ""
  );
}

function parseMatrix(rows: unknown[][], sheetName: string): ParsedScheduleSheet | null {
  if (rows.length < 3) return null;

  let headerRow = -1;
  let nameColumn = -1;
  let roleColumn = -1;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const possibleName = row.findIndex((cell) =>
      /^(nome|colaborador|funcionario)$/.test(normalized(cell)),
    );
    if (possibleName < 0) continue;
    headerRow = rowIndex;
    nameColumn = possibleName;
    roleColumn = row.findIndex((cell) => /^(funcao|cargo|setor)$/.test(normalized(cell)));
    break;
  }
  if (headerRow < 0 || nameColumn < 0) return null;

  let dateRow = -1;
  let dateColumns: Array<{ column: number; date: string }> = [];
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const candidates = row.flatMap((cell, column) => {
      if (column <= Math.max(nameColumn, roleColumn)) return [];
      const date = excelDate(cell);
      return date ? [{ column, date }] : [];
    });
    if (candidates.length > dateColumns.length) {
      dateRow = rowIndex;
      dateColumns = candidates;
    }
  }
  if (dateRow < 0 || dateColumns.length < 4) return null;

  const seenDates = new Set<string>();
  dateColumns = dateColumns.filter(({ date }) => {
    if (seenDates.has(date)) return false;
    seenDates.add(date);
    return true;
  });

  const dates = dateColumns.map(({ date }) => date);
  const people: SchedulePayload["people"] = [];
  const codes = new Set<string>();
  const seenNames = new Set<string>();
  const warnings: string[] = [];
  let entryCount = 0;

  for (let rowIndex = Math.max(headerRow, dateRow) + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const name = text(row[nameColumn]);
    if (!name || /^(total|totais|legenda)$/i.test(name)) continue;
    const nameKey = normalized(name);
    if (seenNames.has(nameKey)) {
      warnings.push(`${name}: linha repetida ignorada.`);
      continue;
    }

    const assignments: Record<string, string> = {};
    for (const { column, date } of dateColumns) {
      const code = text(row[column]);
      if (!code) continue;
      assignments[date] = code;
      codes.add(code);
      entryCount += 1;
    }
    if (Object.keys(assignments).length === 0) continue;

    seenNames.add(nameKey);
    people.push({
      name,
      jobTitle: roleColumn >= 0 ? text(row[roleColumn]) : "",
      assignments,
    });
  }

  const month = mainMonth(dates);
  if (!month || people.length === 0) return null;

  return {
    sheetName,
    month: `${month}-01`,
    employeeCount: people.length,
    entryCount,
    payload: {
      dates,
      people,
      codes: [...codes].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    },
    warnings,
  };
}

export async function parseScheduleWorkbook(file: File): Promise<ParsedScheduleSheet[]> {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    throw new Error("Selecione uma planilha Excel (.xlsx ou .xlsm).");
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const parsed = workbook.worksheets.flatMap((sheet) => {
    const rows: unknown[][] = [];
    for (let rowNumber = 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
      const worksheetRow = sheet.getRow(rowNumber);
      const row: unknown[] = [];
      for (let column = 1; column <= sheet.actualColumnCount; column += 1) {
        row.push(worksheetRow.getCell(column).value ?? "");
      }
      rows.push(row);
    }
    const result = parseMatrix(rows, sheet.name);
    return result ? [result] : [];
  });

  if (parsed.length === 0) {
    throw new Error(
      "Nenhuma aba compatível foi encontrada. A planilha precisa ter Nome, Função e ao menos quatro colunas de datas.",
    );
  }

  return parsed.sort((a, b) => b.month.localeCompare(a.month) || b.entryCount - a.entryCount);
}

export function scheduleCodeKind(code: string): "work" | "off" | "vacation" | "leave" {
  const value = normalized(code);
  if (value === "f" || value.includes("folga")) return "off";
  if (value === "fe" || value.includes("ferias")) return "vacation";
  if (value === "l" || /\b(lcc|lic|licenca|afast)/.test(value)) return "leave";
  return "work";
}
