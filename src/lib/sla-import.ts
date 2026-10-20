import type { Json } from "@/integrations/supabase/types";
import { csvToRows, normalizeSlaRows } from "./sla-math";
import { qqSameValue } from "./quality-math";
import {
  assertSlaSnapshot,
  SLA_SOURCES,
  type SlaBase,
  type SlaSnapshot,
  type SlaRecord,
} from "./sla-warranty";

export function extractSlaHtml(html: string): SlaSnapshot {
  const text = html.match(/<script\b[^>]*id=["']dataset["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!text)
    throw Error("Selecione o HTML do painel SLA Garantia. Os scripts não serão executados.");
  const payload = JSON.parse(text);
  const decode = (base: {
    source: string;
    sourceType: string;
    stats: Record<string, Json>;
    fields: string[];
    rows: Json[][];
  }): SlaBase => {
    if (
      !base ||
      !Array.isArray(base.fields) ||
      !Array.isArray(base.rows) ||
      base.rows.some((row) => !Array.isArray(row) || row.length !== base.fields.length)
    )
      throw Error("Dados incorporados de SLA inválidos.");
    return {
      source: base.source,
      sourceType: base.sourceType,
      stats: base.stats ?? {},
      records: base.rows.map(
        (values) =>
          Object.fromEntries(
            base.fields.map((field, index) => [field, values[index]]),
          ) as SlaRecord,
      ),
    };
  };
  const snapshot: SlaSnapshot = { current: decode(payload) };
  for (const source of ["history", "previousCsv"] as const)
    if (payload[source]) snapshot[source] = decode(payload[source]);
  assertSlaSnapshot(snapshot);
  return snapshot;
}

async function excelRows(file: File): Promise<Record<string, unknown>[]> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Error("A planilha não contém abas.");
  const value = (cell: import("exceljs").Cell): unknown => {
    const raw = cell.value;
    if (raw && typeof raw === "object" && !(raw instanceof Date)) {
      if ("result" in raw) return raw.result ?? "";
      if ("richText" in raw) return raw.richText.map((part) => part.text).join("");
      if ("text" in raw) return raw.text;
      if ("error" in raw) throw Error(`Célula ${cell.address}: erro de fórmula ${raw.error}.`);
    }
    return raw ?? "";
  };
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, column) => {
    headers[column - 1] = String(value(cell))
      .trim()
      .replace(/^\uFEFF/, "");
  });
  const rows: Record<string, unknown>[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const result = Object.fromEntries(headers.filter(Boolean).map((header) => [header, ""]));
    headers.forEach((header, column) => {
      if (header) result[header] = value(row.getCell(column + 1)) as string;
    });
    if (Object.values(result).some((entry) => entry !== "" && entry !== null)) rows.push(result);
  }
  return rows;
}

export async function importSlaFile(file: File, previous?: SlaSnapshot): Promise<SlaSnapshot> {
  if (file.size > 128 * 1024 * 1024) throw Error("O arquivo excede 128 MB.");
  if (/\.html?$/i.test(file.name)) return extractSlaHtml(await file.text());
  let raw: Record<string, unknown>[], sourceType: string;
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer();
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder("windows-1252").decode(bytes);
    }
    raw = csvToRows(content);
    sourceType = "CSV";
  } else if (/\.xlsx$/i.test(file.name)) {
    raw = await excelRows(file);
    sourceType = "Excel";
  } else throw Error("Use CSV ou XLSX. Para XLS antigo, salve como XLSX ou CSV antes de importar.");
  if (!raw.length) throw Error("Arquivo vazio.");
  const normalized = normalizeSlaRows(raw);
  // Same source behavior: a CSV/Excel replaces the current SLA source, never
  // mixes detailed/consolidated records or appends duplicate attendances.
  const snapshot = { ...previous, current: { source: file.name, sourceType, ...normalized } };
  assertSlaSnapshot(snapshot);
  return snapshot;
}
export function sameSlaSnapshot(a: SlaSnapshot | undefined, b: SlaSnapshot): boolean {
  if (!a) return false;
  return SLA_SOURCES.every((source) => qqSameValue(a[source] ?? null, b[source] ?? null));
}
