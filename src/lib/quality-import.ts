import type { Json } from "@/integrations/supabase/types";
import type { CertificationKind, QualitySnapshot } from "./quality";
import { assertQualityRecords } from "./quality";
import {
  qqReadWorkbook,
  toRec,
  qqNormalize409,
  qqNormalizeFront,
  qqAgendaKey,
  qqSameValue,
  parseCsvCompact,
  decodeFile,
  type QQRecord,
  type TCRecord,
} from "./quality-math";
import { mergeQualityRecords, type QualityImportResult } from "./quality-merge";

export function normalizeQQSnapshot(snapshot: QualitySnapshot): QualitySnapshot {
  const updates = snapshot["sourceUpdates"] as
    Array<{ before: QQRecord; after: QQRecord }> | undefined;
  const corrections = new Map((updates ?? []).map((row) => [qqAgendaKey(row.before), row]));
  const records = (snapshot.records as QQRecord[])
    .map((row) => {
      const update = corrections.get(qqAgendaKey(row));
      const matches =
        update &&
        Object.keys(update.before)
          .filter((k) => k !== "sv")
          .every(
            (k) =>
              (k === "osGroup" && row[k] === undefined) || qqSameValue(row[k], update.before[k]),
          );
      return qqNormalizeFront(qqNormalize409(matches ? { ...row, ...update.after } : row));
    })
    .filter((row): row is QQRecord => !!row);
  return { ...snapshot, records };
}
export async function importQQ(
  file: File,
  current: QualitySnapshot | undefined,
): Promise<QualityImportResult> {
  const rows = await qqReadWorkbook(await file.arrayBuffer());
  const first = rows[0];
  if (!first) throw Error("Planilha vazia.");
  const missing = [
    "TIPO_ATENDIMENTO",
    "DAT_AGENDA",
    "TIPO_TRATAMENTO",
    "SUB_AGRUPAMENTO_SC",
  ].filter((key) => !(key in first));
  if (!("UN_TECNICO" in first) && !("UNIDADE_NEGOCIO" in first))
    missing.push("UN_TECNICO ou UNIDADE_NEGOCIO");
  if (missing.length) throw Error(`Colunas ausentes: ${missing.join(", ")}`);
  const incoming = rows
    .map(toRec)
    .filter((r): r is QQRecord => !!r)
    .map(qqNormalize409);
  assertQualityRecords("quebra", incoming);
  const old = (current?.records ?? []) as QQRecord[];
  const { records, report } = mergeQualityRecords("quebra", old, incoming);
  return { snapshot: { ...current, records }, report };
}
export function parseTC(
  text: string,
  name: string,
  metadata: Record<string, Json | undefined> = {},
) {
  const maps = {
    ...((metadata["techMap"] as Record<string, { name?: string; company?: string }>) ?? {}),
    ...((metadata["customMap"] as Record<string, { name?: string; company?: string }>) ?? {}),
  };
  const names = {
    ...((metadata["nameUpdates"] as Record<string, string>) ?? {}),
    ...((metadata["corrections"] as Record<string, string>) ?? {}),
  };
  const records = parseCsvCompact(text, name, (login, unit) => ({
    name: names[login] || maps[login]?.name || login,
    company: maps[login]?.company || unit,
    mapped: !!maps[login],
    mapSource: maps[login] ? "manual" : "base",
  }));
  assertQualityRecords("certification", records);
  return records;
}
export function mergeTC(old: TCRecord[], incoming: TCRecord[]): TCRecord[] {
  return mergeQualityRecords("certification", old, incoming).records as TCRecord[];
}
export async function importTC(
  file: File,
  current: QualitySnapshot | undefined,
  kind: CertificationKind = "certification",
): Promise<QualityImportResult> {
  const { records, report } = mergeQualityRecords(
    kind,
    (current?.records ?? []) as TCRecord[],
    parseTC(await decodeFile(file), file.name, current ?? {}),
  );
  const files = [...new Set([...((current?.["files"] as string[]) ?? []), file.name])];
  return { snapshot: { ...current, records, files }, report };
}
