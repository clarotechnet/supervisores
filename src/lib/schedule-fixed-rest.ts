import type { SchedulePerson } from "./types";
import type { ScheduleGeneratedPreview } from "./schedule-generator";
import { scheduleCodeKind } from "./schedule-import.ts";

type RestRule = {
  fixedOffDistribution?: Readonly<Record<number, number>>;
  defaultShift: string;
  saturdayShift: string;
  additionalHolidays?: readonly string[];
};
const dayOf = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
const move = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const kind = (code: string | undefined) => scheduleCodeKind(code || "");
const datesOf = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return Array.from(
    { length: new Date(Date.UTC(year!, m!, 0)).getUTCDate() },
    (_, i) => month + "-" + String(i + 1).padStart(2, "0"),
  );
};
const holidays = new Set([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
]);
function protectedMonth(person: SchedulePerson, dates: string[]) {
  return dates.every(
    (d) =>
      !!person.assignments[d] &&
      ["certificate", "vacation", "leave"].includes(kind(person.assignments[d])),
  );
}
function fixedDay(person: SchedulePerson, dates: string[]) {
  const counts = [1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    count: dates.filter((d) => dayOf(d) === day && kind(person.assignments[d]) === "off").length,
  }));
  counts.sort((a, b) => b.count - a.count || a.day - b.day);
  return counts[0]?.count ? counts[0].day : null;
}
export function fixedRestSummary(
  people: SchedulePerson[],
  month: string,
  targets: Readonly<Record<number, number>>,
) {
  const dates = datesOf(month);
  const active = people.filter((p) => !protectedMonth(p, dates));
  const counts: Record<number, number> = {};
  for (const p of active) {
    const day = fixedDay(p, dates);
    if (day !== null) counts[day] = (counts[day] || 0) + 1;
  }
  const expected = Object.values(targets).reduce((a, b) => a + b, 0);
  const issues: string[] = [];
  if (active.length !== expected)
    issues.push(
      "Distribuição de folgas fixas: as metas somam " +
        expected +
        ", mas há " +
        active.length +
        " pessoas no rodízio (" +
        (people.length - active.length) +
        " afastadas no mês). Revise a diferença sem retirar colaboradores nem liberar plantões proibidos.",
    );
  if (Object.entries(targets).some(([d, n]) => (counts[Number(d)] || 0) !== n))
    issues.push(
      "Distribuição de folgas fixas: quantidades por dia ainda divergem das metas; confira a revisão.",
    );
  return {
    counts,
    expected,
    active: active.length,
    protectedCount: people.length - active.length,
    issues,
  };
}
export function balanceFixedRests(
  people: SchedulePerson[],
  month: string,
  rule: RestRule,
  originalOutside: Record<string, string>[] = [],
  locked: Array<Readonly<Record<string, string>>> = [],
) {
  const dates = datesOf(month),
    first = dates[0]!,
    last = dates.at(-1)!;
  const result = people.map((p) => ({ ...p, assignments: { ...p.assignments } }));
  const outside = people.map((_, i) => ({ ...originalOutside[i] }));
  const targets = rule.fixedOffDistribution;
  if (!targets) return { people: result, outsideAssignments: outside };
  const eligible = people
    .map((p, i) => ({ index: i, old: fixedDay(p, dates) }))
    .filter((p) => !protectedMonth(people[p.index]!, dates));
  const assigned = new Map<number, number>();
  const targetDays = Object.keys(targets)
    .map(Number)
    .sort((a, b) => a - b);
  for (const day of targetDays)
    eligible
      .filter((p) => p.old === day)
      .slice(0, targets[day] || 0)
      .forEach((p) => assigned.set(p.index, day));
  for (const day of targetDays) {
    const need = (targets[day] || 0) - [...assigned.values()].filter((d) => d === day).length;
    eligible
      .filter((p) => !assigned.has(p.index))
      .slice(0, need)
      .forEach((p) => assigned.set(p.index, day));
  }
  const holiday = (d: string) =>
    holidays.has(d.slice(5)) || !!rule.additionalHolidays?.includes(d.slice(5));
  const event = (d: string) => dayOf(d) === 0 || holiday(d);
  const nextDays: string[] = [];
  for (let d = move(last, 1); dayOf(move(d, -1)) !== 6; d = move(d, 1)) nextDays.push(d);
  for (let index = 0; index < result.length; index++) {
    const person = result[index]!,
      original = people[index]!;
    const old = fixedDay(original, dates),
      fixed = assigned.get(index) ?? old;
    const all = { ...outside[index], ...person.assignments };
    const protectedAll = protectedMonth(original, dates);
    for (const d of nextDays) {
      if (all[d]) continue;
      // AT sem retorno confirmado continua; férias não ganham datas por inferência.
      all[d] =
        protectedAll && kind(original.assignments[last]) === "certificate"
          ? original.assignments[last]!
          : event(d) || dayOf(d) === fixed
            ? "Folga"
            : dayOf(d) === 6
              ? rule.saturdayShift
              : rule.defaultShift;
    }
    for (const d of [...dates, ...nextDays]) {
      if (old === fixed || locked[index]?.[d] || protectedAll || event(d)) continue;
      if (!["off", "work"].includes(kind(all[d]))) continue;
      if (dayOf(d) === fixed) all[d] = "Folga";
      else if (old !== fixed && dayOf(d) === old && kind(all[d]) === "off")
        all[d] = dayOf(d) === 6 ? rule.saturdayShift : rule.defaultShift;
    }
    for (let sunday = move(first, -dayOf(first)); sunday <= last; sunday = move(sunday, 7)) {
      if (sunday < first) continue;
      const week = Array.from({ length: 7 }, (_, i) => move(sunday, i));
      if (
        week.some(
          (d) => !all[d] || ["vacation", "certificate", "leave", "absence"].includes(kind(all[d])),
        )
      )
        continue;
      while (week.filter((d) => kind(all[d]) === "off").length < 2) {
        const candidate = week.find(
          (d) => !event(d) && !locked[index]?.[d] && kind(all[d]) === "work",
        );
        if (!candidate) break;
        all[candidate] = "Folga";
      }
    }
    person.assignments = Object.fromEntries(dates.map((d) => [d, all[d] || ""]));
    outside[index] = Object.fromEntries(Object.entries(all).filter(([d]) => !dates.includes(d)));
  }
  return { people: result, outsideAssignments: outside };
}
export function applyFixedRestDistribution(
  preview: ScheduleGeneratedPreview,
  sourcePeople: SchedulePerson[] = [],
): ScheduleGeneratedPreview {
  if (!preview.rule.fixedOffDistribution) return preview;
  const identity = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  const locked = preview.payload.people.map(
    (p) =>
      sourcePeople.find(
        (s) =>
          (p.login && s.login && identity(p.login) === identity(s.login)) ||
          identity(s.name) === identity(p.name),
      )?.assignments || {},
  );
  const balanced = balanceFixedRests(
    preview.payload.people,
    preview.targetMonth,
    preview.rule,
    preview.outsideAssignments,
    locked,
  );
  return {
    ...preview,
    outsideAssignments: balanced.outsideAssignments,
    payload: { ...preview.payload, people: balanced.people },
  };
}
