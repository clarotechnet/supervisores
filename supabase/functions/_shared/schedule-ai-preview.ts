import type { Payload } from "./schedule-operational.ts";
import type { analyzeSchedule } from "./schedule-ai-analysis.ts";

export type AnalysisRule = NonNullable<Parameters<typeof analyzeSchedule>[2]>;
export type PreviewAnalysisInput = {
  city: string;
  sector: string;
  month: string;
  planned: Payload;
  current: Payload;
  rule: AnalysisRule;
};
export class InvalidPreviewInput extends Error {}
const invalid = (): never => {
  throw new InvalidPreviewInput("Prévia inválida para análise.");
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
};
const safeText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max && !/[<>]/.test(value);
const date = (value: unknown): value is string =>
  typeof value === "string" &&
  /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;

function payload(value: unknown, month: string): Payload {
  const row = record(value);
  if (
    !Array.isArray(row["dates"]) ||
    row["dates"].length < 7 ||
    row["dates"].length > 45 ||
    !row["dates"].every(date) ||
    new Set(row["dates"]).size !== row["dates"].length ||
    !Array.isArray(row["people"]) ||
    !row["people"].length ||
    row["people"].length > 500
  )
    return invalid();
  const first = Date.parse(month + "-01T12:00:00Z");
  const [year, m] = month.split("-").map(Number);
  const end = Date.UTC(year!, m!, 0, 12);
  if (
    row["dates"].some(
      (d) =>
        Date.parse(d + "T12:00:00Z") < first - 7 * 86400000 ||
        Date.parse(d + "T12:00:00Z") > end + 7 * 86400000,
    )
  )
    return invalid();
  const dates = row["dates"] as string[];
  const people = row["people"].map((raw) => {
    const p = record(raw);
    if (
      !safeText(p["name"], 120) ||
      !p["name"].trim() ||
      !safeText(p["jobTitle"], 160) ||
      (p["login"] !== undefined && !safeText(p["login"], 120))
    )
      return invalid();
    const codes = record(p["assignments"]);
    if (
      Object.keys(codes).length > 45 ||
      Object.entries(codes).some(([day, code]) => !dates.includes(day) || !safeText(code, 80))
    )
      return invalid();
    return {
      name: p["name"],
      jobTitle: p["jobTitle"],
      assignments: Object.fromEntries(dates.map((day) => [day, String(codes[day] || "")])),
    };
  });
  return {
    dates,
    people,
    codes: [...new Set(people.flatMap((p) => Object.values(p["assignments"])))],
  };
}

/** Bounded, read-only analysis input. Never authorizes generation or publication. */
export function validatePreviewAnalysisInput(value: unknown): PreviewAnalysisInput {
  const row = record(value);
  if (
    typeof row["city"] !== "string" ||
    !/^[a-z0-9-]{2,50}$/.test(row["city"]) ||
    typeof row["sector"] !== "string" ||
    !/^[a-z0-9-]{2,80}$/.test(row["sector"]) ||
    typeof row["month"] !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row["month"])
  )
    return invalid();
  const rawRule = record(row["rule"]);
  const rule: AnalysisRule = { analysisMonth: row["month"] };
  for (const key of [
    "sundayDutyCount",
    "holidayDutyCount",
    "minimumSupervisorDuty",
    "minimumAdesaoControllerDuty",
  ] as const) {
    const v = rawRule[key];
    if (v !== undefined && v !== null && (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 500))
      return invalid();
    if (v === null) {
      if (key === "sundayDutyCount" || key === "holidayDutyCount") rule[key] = null;
      else return invalid();
    } else if (v !== undefined) rule[key] = Number(v);
  }
  if (
    rawRule["holidayWeekdaysOnly"] !== undefined &&
    typeof rawRule["holidayWeekdaysOnly"] !== "boolean"
  )
    return invalid();
  if (
    rawRule["dutyCode"] !== undefined &&
    !["M. 1", "T. 1", "PLANTÃO"].includes(String(rawRule["dutyCode"]))
  )
    return invalid();
  if (rawRule["holidayWeekdaysOnly"] !== undefined)
    rule.holidayWeekdaysOnly = rawRule["holidayWeekdaysOnly"] as boolean;
  if (rawRule["dutyCode"] !== undefined) rule.dutyCode = rawRule["dutyCode"] as string;
  if (rawRule["additionalHolidays"] !== undefined) {
    if (
      !Array.isArray(rawRule["additionalHolidays"]) ||
      rawRule["additionalHolidays"].length > 50 ||
      !rawRule["additionalHolidays"].every((v) => typeof v === "string" && /^\d{2}-\d{2}$/.test(v))
    )
      return invalid();
    rule.additionalHolidays = rawRule["additionalHolidays"];
  }
  if (rawRule["excludedFromDuty"] !== undefined) {
    if (
      !Array.isArray(rawRule["excludedFromDuty"]) ||
      rawRule["excludedFromDuty"].length > 500 ||
      !rawRule["excludedFromDuty"].every((v) => safeText(v, 120))
    )
      return invalid();
    rule.excludedFromDuty = rawRule["excludedFromDuty"];
  }
  if (rawRule["dateDutyOverrides"] !== undefined) {
    const overrides = record(rawRule["dateDutyOverrides"]);
    if (
      Object.keys(overrides).length > 45 ||
      Object.entries(overrides).some(
        ([d, n]) => !date(d) || !Number.isInteger(n) || Number(n) < 0 || Number(n) > 500,
      )
    )
      return invalid();
    rule.dateDutyOverrides = overrides as Record<string, number>;
  }
  if (
    row["city"] === "natal" &&
    row["sector"] === "controle-operacional" &&
    row["month"] === "2026-12"
  )
    rule.transitionStart = "2026-12-06";
  return {
    city: row["city"],
    sector: row["sector"],
    month: row["month"],
    rule,
    planned: payload(row["planned"], row["month"]),
    current: payload(row["current"], row["month"]),
  };
}
