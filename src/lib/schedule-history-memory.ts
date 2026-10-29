import type { SchedulePerson, ScheduleUpload } from "./types";
import type { ScheduleGenerationRule } from "./schedule-generator-rules";
import { normalizeScheduleEmployeeName } from "./schedule-generator-rules";
import { scheduleCodeKind } from "./schedule-import";
import { scheduleMonthDates } from "./schedule-view";
export type FixedRestEvidence = {
  personKey: string;
  day: number | null;
  week: string[];
  method: "normal-week" | "marked-week" | "unknown";
};
const weekday = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const plus = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const nationalHolidayKeys = [
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
] as const;
export function scheduleIsHoliday(
  date: string,
  rule: Pick<ScheduleGenerationRule, "additionalHolidays">,
) {
  return [...nationalHolidayKeys, ...(rule.additionalHolidays || [])].includes(date.slice(5));
}
export function schedulePersonKey(p: SchedulePerson) {
  return normalizeScheduleEmployeeName(p.login || p.name);
}
const known = (code: string | undefined) =>
  !!code?.trim() && normalizeScheduleEmployeeName(code) !== "SEM INFORMACAO";
const off = (code: string | undefined) => known(code) && scheduleCodeKind(code!) === "off";
const regular = (code: string | undefined) =>
  known(code) &&
  !["BH", "FOLGA SOLICITADA", "FOLGA COMPENSATORIA"].includes(
    normalizeScheduleEmployeeName(code!),
  ) &&
  (off(code) || /^(?:M\.|T\.)\s*[1-4]$/.test(code!.trim()));
/** Uma semana limpa identifica a folga. A semana mais recente reflete mudanças feitas pela gestão. */
export function learnFixedRest(
  person: SchedulePerson,
  month: string,
  rule: ScheduleGenerationRule,
): FixedRestEvidence {
  const source = scheduleMonthDates(month);
  const firstFuture = plus(source.at(-1)!, 1);
  const relevant = [...source, ...Array.from({ length: 7 }, (_, i) => plus(firstFuture, i))];
  const allowed = rule.fixedOffWeekdays || [1, 2, 3, 4, 5, 6];
  const empty: FixedRestEvidence = {
    personKey: schedulePersonKey(person),
    day: null,
    week: [],
    method: "unknown",
  };
  const weeks = relevant
    .filter((d) => weekday(d) === 0)
    .map((d) => Array.from({ length: 7 }, (_, i) => plus(d, i)))
    .filter((w) => w.every((d) => relevant.includes(d)))
    .reverse();
  for (const week of weeks) {
    if (
      week.some((d) => scheduleIsHoliday(d, rule) || !regular(person.assignments[d])) ||
      !off(person.assignments[week[0]!])
    )
      continue;
    const fixed = week.slice(1).filter((d) => off(person.assignments[d]));
    if (fixed.length === 1 && allowed.includes(weekday(fixed[0]!)))
      return { ...empty, day: weekday(fixed[0]!), week, method: "normal-week" };
  }
  // Continuidade explicitamente iniciada na origem: uma única folga marcada
  // junto com trabalho normal pode identificar o padrão, sem usar semanas com afastamentos/feriado.
  const extension = relevant.filter((d) => d >= firstFuture && known(person.assignments[d]));
  const marked = extension.filter((d) => weekday(d) !== 0 && off(person.assignments[d]));
  if (
    marked.length === 1 &&
    extension.some((d) => !off(person.assignments[d])) &&
    extension.every((d) => regular(person.assignments[d]) && !scheduleIsHoliday(d, rule)) &&
    allowed.includes(weekday(marked[0]!))
  )
    return { ...empty, day: weekday(marked[0]!), week: extension, method: "marked-week" };
  return empty;
}
/** Completa somente quantitativos ainda não configurados, a partir de eventos iguais na escala anterior. */
export function learnMissingCoverage(source: ScheduleUpload, catalog: ScheduleGenerationRule) {
  const rule = { ...catalog };
  const learned: string[] = [];
  if (
    !source.payload.people.some(
      (p) => learnFixedRest(p, source.schedule_month.slice(0, 7), rule).method === "normal-week",
    )
  )
    return { rule, learned };
  const dates = scheduleMonthDates(source.schedule_month.slice(0, 7));
  const isWork = (code: string | undefined) => known(code) && scheduleCodeKind(code!) === "work";
  const count = (date: string) =>
    source.payload.people.filter((p) => isWork(p.assignments[date])).length;
  const unambiguous = (events: string[]) => {
    const usable = events.filter((d) =>
      source.payload.people.every((p) => known(p.assignments[d])),
    );
    const counts = [...new Set(usable.map(count))];
    return counts.length === 1 ? counts[0]! : null;
  };
  if (rule.sundayDutyCount === null) {
    const n = unambiguous(dates.filter((d) => weekday(d) === 0 && !scheduleIsHoliday(d, rule)));
    if (n !== null) {
      rule.sundayDutyCount = n;
      learned.push("Cobertura de domingo identificada na escala anterior: " + n + ".");
    }
  }
  if (rule.holidayDutyCount === null) {
    const n = unambiguous(dates.filter((d) => weekday(d) !== 0 && scheduleIsHoliday(d, rule)));
    if (n !== null) {
      rule.holidayDutyCount = n;
      learned.push("Cobertura de feriado identificada na escala anterior: " + n + ".");
    }
  }
  return { rule, learned };
}
