import { type TCRecord } from "./quality-math";
const DAY = 86400000;
export type TCProjectionPlans = Record<
  string,
  { reference?: string; end?: string; workDays?: number }
>;
export function prepareTCProjection(
  all: TCRecord[],
  current: TCRecord[],
  month: string,
  plan: { reference?: string; end?: string; workDays?: number } = {},
) {
  const rows = all.filter((r) => `${r.year}-${String(r.month).padStart(2, "0")}` === month),
    lags = new Map<number, number>();
  for (const row of rows) {
    const m = String(row.noteAt).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const note = m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : NaN;
    const lag = (note - Date.parse(row.day)) / DAY;
    if (Number.isInteger(lag) && lag >= 0 && lag <= 60) lags.set(lag, (lags.get(lag) ?? 0) + 1);
  }
  const lag = [...lags].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  const loaded =
    [...(current.length ? current : rows)]
      .map((r) => r.day)
      .sort()
      .at(-1) ?? "";
  const [year, mo] = month.split("-").map(Number);
  const suggestedEnd = month
    ? new Date(Date.UTC(year!, mo!, 0) - lag * DAY).toISOString().slice(0, 10)
    : "";
  const reference = plan.reference && plan.reference >= loaded ? plan.reference : loaded,
    end = plan.end || suggestedEnd;
  const calendarDays =
    reference && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(reference)) / DAY)) : 0;
  const workDays = plan.workDays == null ? calendarDays : Math.min(plan.workDays, calendarDays);
  const pointedOrders = new Map<string, number>();
  for (const row of current)
    if (
      row.points !== "" &&
      row.points != null &&
      Number.isFinite(Number(String(row.points).replace(",", ".")))
    )
      pointedOrders.set(row.login, (pointedOrders.get(row.login) ?? 0) + 1);
  return {
    month,
    lag,
    loaded,
    reference,
    end,
    suggestedEnd,
    calendarDays,
    workDays,
    pointedOrders,
  };
}
