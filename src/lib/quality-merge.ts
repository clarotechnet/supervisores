import type { QualityKind, QualityRecord, QualitySnapshot } from "./quality";
import { qqAgendaKey, qqSameValue, tcRowKey, type QQRecord, type TCRecord } from "./quality-math";

export interface QualityMergeReport {
  added: number;
  updated: number;
  unchanged: number;
  duplicatesInFile: number;
  duplicatesRemoved: number;
  total: number;
  start: string;
  end: string;
}
export interface QualityImportResult {
  snapshot: QualitySnapshot;
  report: QualityMergeReport;
}

function comparable(kind: QualityKind, record: QualityRecord): QualityRecord {
  // A renamed CSV is not a new attendance. Retain the original provenance for an unchanged row.
  if (kind !== "quebra") {
    const { file: _file, ...businessData } = record;
    return businessData;
  }
  return record;
}

export function mergeQualityRecords(
  kind: QualityKind,
  current: QualityRecord[],
  incoming: QualityRecord[],
): { records: QualityRecord[]; report: QualityMergeReport } {
  const key = (row: QualityRecord) =>
    kind === "quebra" ? qqAgendaKey(row as QQRecord) : tcRowKey(row as TCRecord);
  const rows = new Map<string, QualityRecord>();
  // Also repair duplicates in a previously saved snapshot, keeping the last version of each key.
  for (const row of current) rows.set(key(row), row);
  const duplicatesRemoved = current.length - rows.size;
  const fileRows = new Map<string, QualityRecord>();
  for (const row of incoming) fileRows.set(key(row), row);
  let added = 0,
    updated = 0,
    unchanged = 0;
  for (const [id, row] of fileRows) {
    const previous = rows.get(id);
    if (!previous) {
      rows.set(id, row);
      added++;
    } else {
      const merged = { ...previous, ...row };
      if (qqSameValue(comparable(kind, previous), comparable(kind, merged))) unchanged++;
      else {
        rows.set(id, merged);
        updated++;
      }
    }
  }
  const records = [...rows.values()];
  let start = "",
    end = "";
  for (const row of records) {
    const date = String(kind === "quebra" ? row["d"] : row["day"]);
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  }
  return {
    records,
    report: {
      added,
      updated,
      unchanged,
      duplicatesInFile: incoming.length - fileRows.size,
      duplicatesRemoved,
      total: records.length,
      start,
      end,
    },
  };
}

export function qualitySnapshotChanged(
  kind: QualityKind,
  current: QualitySnapshot | undefined,
  next: QualitySnapshot,
): boolean {
  if (!current || current.records.length !== next.records.length) return true;
  for (let i = 0; i < next.records.length; i++) {
    if (!qqSameValue(comparable(kind, current.records[i]!), comparable(kind, next.records[i]!)))
      return true;
  }
  const { records: _oldRows, files: _oldFiles, ...oldMetadata } = current;
  const { records: _newRows, files: _newFiles, ...newMetadata } = next;
  return !qqSameValue(oldMetadata, newMetadata);
}
