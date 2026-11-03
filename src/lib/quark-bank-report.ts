import { personKey, type QuarkDay, type QuarkPersonView } from "./quark";

export type QuarkBankScope =
  "positive" | "negative" | "alerts" | "people" | "top-positive" | "top-negative";

export const quarkBankScopeLabels: Record<QuarkBankScope, string> = {
  positive: "Horas positivas",
  negative: "Horas negativas",
  alerts: "Alertas acima de 2h/dia",
  people: "Colaboradores analisados",
  "top-positive": "Top 10 positivos",
  "top-negative": "Top 10 negativos",
};

export interface QuarkBankRow {
  person: QuarkPersonView;
  latest: QuarkDay;
  balance: number;
  extras: number;
}

export interface QuarkBankAlert {
  row: QuarkBankRow;
  day: QuarkDay;
  extras: number;
}

export function quarkDailyExtras(day: QuarkDay): number {
  return day.normal_extra_minutes + day.night_extra_minutes + day.extra_100_minutes;
}

// Callers supply the same authorized people and period-filtered days used by the page.
// Bank balance is a sum of daily movements, never the last day's snapshot.
export function buildQuarkBankReport(people: QuarkPersonView[], days: QuarkDay[]) {
  const peopleByKey = new Map(people.map((person) => [personKey(person), person]));
  const rowsByKey = new Map<string, QuarkBankRow>();
  for (const day of days) {
    const key = personKey(day);
    const person = peopleByKey.get(key);
    if (!person) continue;
    const row = rowsByKey.get(key) ?? { person, latest: day, balance: 0, extras: 0 };
    row.balance += day.bank_balance_minutes;
    row.extras += quarkDailyExtras(day);
    if (day.work_date > row.latest.work_date) row.latest = day;
    rowsByKey.set(key, row);
  }
  const rows = people.flatMap((person) => {
    const row = rowsByKey.get(personKey(person));
    return row ? [row] : [];
  });
  const byName = (a: QuarkBankRow, b: QuarkBankRow) =>
    a.person.full_name.localeCompare(b.person.full_name, "pt-BR") ||
    personKey(a.person).localeCompare(personKey(b.person));
  const positive = rows
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance || byName(a, b));
  const negative = rows
    .filter((row) => row.balance < 0)
    .sort((a, b) => a.balance - b.balance || byName(a, b));
  const alerts: QuarkBankAlert[] = days
    .flatMap((day) => {
      const row = rowsByKey.get(personKey(day));
      const extras = quarkDailyExtras(day);
      return row && extras > 120 ? [{ row, day, extras }] : [];
    })
    .sort(
      (a, b) =>
        b.day.work_date.localeCompare(a.day.work_date) ||
        b.extras - a.extras ||
        byName(a.row, b.row),
    );
  return {
    rows,
    positive,
    negative,
    alerts,
    totalPositiveMinutes: positive.reduce((sum, row) => sum + row.balance, 0),
    totalNegativeMinutes: negative.reduce((sum, row) => sum + row.balance, 0),
  };
}

export type QuarkBankReport = ReturnType<typeof buildQuarkBankReport>;

export function quarkBankRowsForScope(report: QuarkBankReport, scope: QuarkBankScope | null) {
  switch (scope) {
    case "positive":
      return report.positive;
    case "negative":
      return report.negative;
    case "top-positive":
      return report.positive.slice(0, 10);
    case "top-negative":
      return report.negative.slice(0, 10);
    // Alerts are daily records, not a list of employees' whole-period records.
    case "alerts":
      return [];
    default:
      return report.rows;
  }
}
