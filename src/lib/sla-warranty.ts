import type { Json } from "@/integrations/supabase/types";
import { parseDate } from "./sla-math";
export const SLA_SOURCES = ["current", "history", "previousCsv"] as const;
export type SlaSource = (typeof SLA_SOURCES)[number];
export interface SlaRecord extends Record<string, Json | undefined> {
  indicator: string;
  reportDate: string;
  contract: string;
  os: string;
  city: string;
  standardCount: number;
  logs: number;
  taskCount: number;
  recordKey: string;
  sourceFormat: string;
}
export type SlaStats = Record<string, Json | undefined>;
export interface SlaMetric {
  total: number;
  good: number;
  revis: number;
  logs: number;
  sla: number;
  attendance: SlaMetric;
  tasks: SlaMetric;
  mode: string;
}
export interface SlaBase {
  source: string;
  sourceType: string;
  stats: SlaStats;
  records: SlaRecord[];
}
export interface SlaSnapshot {
  current: SlaBase;
  history?: SlaBase;
  previousCsv?: SlaBase;
}
export interface SlaManifest {
  id: string;
  source_file: string;
  imported_by: string;
  created_at: string;
  published_at: string | null;
  row_count: number;
  chunk_count: number;
  metadata: Json;
  base_import_id: string | null;
}
export interface SlaDataset {
  manifest: SlaManifest | null;
  snapshot?: SlaSnapshot;
}
export function assertSlaBase(base: SlaBase) {
  if (
    !base ||
    typeof base.source !== "string" ||
    typeof base.sourceType !== "string" ||
    !base.stats ||
    typeof base.stats !== "object" ||
    !Array.isArray(base.records) ||
    base.records.length > 1_000_000
  )
    throw Error("Base SLA inválida.");
  const keys = new Set<string>(),
    attendances = new Set<string>(),
    formats = new Set<string>();
  for (const row of base.records) {
    if (
      !row ||
      !["Sla Garantia Total", "Sla Garantia"].includes(row.indicator) ||
      !parseDate(row.reportDate) ||
      !row.contract ||
      !row.os ||
      !row.city ||
      ![0, 1].includes(row.standardCount) ||
      !Number.isInteger(row.logs) ||
      row.logs < 0 ||
      !Number.isInteger(row.taskCount) ||
      row.taskCount < 1 ||
      !["detailed", "consolidated"].includes(row.sourceFormat)
    )
      throw Error("Registro SLA inválido. Confira o arquivo de origem.");
    const key = JSON.stringify([row.indicator, row.reportDate, row.city, row.os]);
    if (row.recordKey !== key || keys.has(key))
      throw Error("A base SLA contém chave inválida ou O.S. duplicada.");
    keys.add(key);
    formats.add(row.sourceFormat);
    if (row.sourceFormat === "consolidated") {
      const attendance = JSON.stringify([row.indicator, row.contract, row.reportDate, row.city]);
      if (attendances.has(attendance))
        throw Error("Atendimento consolidado duplicado na base SLA.");
      attendances.add(attendance);
    }
  }
  if (formats.size > 1)
    throw Error("A mesma fonte SLA não pode misturar linhas detalhadas e consolidadas.");
}
export function assertSlaSnapshot(snapshot: SlaSnapshot) {
  if (!snapshot?.current?.records.length)
    throw Error("Não há registros válidos na base atual de SLA.");
  let count = 0;
  for (const source of SLA_SOURCES)
    if (snapshot[source]) {
      assertSlaBase(snapshot[source]!);
      count += snapshot[source]!.records.length;
    }
  if (count > 1_000_000) throw Error("O conjunto SLA excede 1 milhão de registros.");
}
export function slaErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (["42P01", "PGRST205", "PGRST202"].includes(code ?? ""))
    return "Instale a migration 20261020154717_add_sla_warranty_dashboard.sql no projeto supervisortechnet para ativar o SLA Garantia.";
  return (
    (error as { message?: string })?.message ||
    "Não foi possível carregar ou salvar o SLA Garantia."
  );
}
