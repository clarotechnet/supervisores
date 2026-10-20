import type { SlaRecord, SlaStats, SlaMetric } from "./sla-warranty";
export function normalizeSlaRows(
  raw: Record<string, unknown>[],
  options?: { legacy?: boolean },
): { records: SlaRecord[]; stats: SlaStats };
export function csvToRows(text: string): Record<string, unknown>[];
export function groupRows(rows: SlaRecord[]): SlaRecord[];
export function calc(groups: SlaRecord[], mode?: "attendance" | "tasks"): SlaMetric;
export function parseDate(value: unknown): Date | null;
