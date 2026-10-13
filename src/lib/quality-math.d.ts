import type { Json } from "@/integrations/supabase/types";
import type { QualityRecord } from "./quality";
export interface QQRecord extends QualityRecord {
  d: string;
  lt: string;
  un: string;
  ci: string;
  cl: string;
  f: string;
  gf: string;
  b: number;
  c: Record<string, number> | null;
  w: string;
  contract: string;
  os: string;
  wo: string;
  baixa: string;
  responsible: string;
  rawCategory: string;
  treatment: string;
  service: string;
  osGroup: string;
}
export interface TCRecord extends QualityRecord {
  login: string;
  name: string;
  company: string;
  baseUnit: string;
  mapSource: string;
  qr: string;
  tnum: string;
  tden: string;
  points: string;
  day: string;
  month: number;
  year: number;
  city: string;
  sub: string;
  group: string;
  type: string;
  uf: string;
  wo: string;
  finish: string;
  contract: string;
  orders: string;
  lowCodes: string;
  revisitWo: string;
  noteAt: string;
}
export interface QQStats {
  n: number;
  b: number;
  q: number;
  cat: Record<string, number>;
  pb: number;
  pq: number;
}
export interface TCMetric {
  os: number;
  revBad: number;
  revGood: number;
  tnum: number;
  tden: number;
  points: number;
}
export interface TCResult extends TCMetric {
  name: string;
  loginText: string;
  companyText: string;
  days: Set<string>;
  revisit: number | null;
  tec1: number | null;
  prod: number | null;
  status: boolean;
  fails: string[];
  daily: Map<string, TCMetric>;
  cities: Set<string>;
  units: Set<string>;
  ufs: Set<string>;
}
export function norm(value: unknown): string;
export function qqReadWorkbook(buffer: ArrayBuffer): Promise<Record<string, Json>[]>;
export function toRec(record: Record<string, Json>): QQRecord | null;
export function qqNormalizeFront(record: QQRecord): QQRecord | null;
export function qqNormalize409(record: QQRecord): QQRecord;
export function qqFrontMatches(record: QQRecord, front: string): boolean;
export function qqQualifiedCategories(record: QQRecord): Record<string, number> | null;
export function qqAgendaKey(record: QQRecord): string;
export function qqSameValue(a: unknown, b: unknown): boolean;
export function qqMergeAgendaRecords(
  current: QQRecord[],
  incoming: QQRecord[],
): { rows: QQRecord[]; added: number; updated: number; unchanged: number };
export function stat(records: QQRecord[]): QQStats;
export function qqMonthlyInfo(records: QQRecord[]): QQStats & {
  sourceRate: number;
  references: Array<{ unit: string; front: string; month: string; value: number }>;
};
export function presentationCityLabel(value: string): string;
export function cityFromUnit(value: string): string;
export function parseCsvCompact(
  text: string,
  name: string,
  resolve?: (
    login: string,
    unit: string,
  ) => { name: string; company: string; mapped: boolean; mapSource: string },
): TCRecord[];
export function decodeFile(file: File): Promise<string>;
export function tcRowKey(record: TCRecord): string;
export function aggregate(records: TCRecord[]): TCResult[];
export function applyStatus(results: TCResult[]): void;
export function tcRule(): {
  rev: number;
  tec: number;
  prod: number;
  strict: boolean;
  label: string;
};
export function tcProjectionFor(
  result: TCResult,
  context: { workDays: number; pointedOrders: Map<string, number> },
): {
  revisit: { total: number | null; daily: number | null };
  tec1: { total: number | null; daily: number | null };
  prod: {
    total: number | null;
    daily: number | null;
    ordersPerDay: number | null;
    meanPoints: number | null;
  };
  days: number;
};
