import type { SchedulePerson } from "./types";
import { scheduleCodeKind } from "./schedule-import";

export function scheduleMonthDates(month: string): string[] {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0, 12).getDate();
  return Array.from(
    { length: dayCount },
    (_, index) => `${month.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`,
  );
}

// Keep selections that also exist in the next city/sector/month.
export function reconcileScheduleSelection(names: string[], people: SchedulePerson[]): string[] {
  const available = new Set(people.map((person) => person.name));
  const retained = names.filter((name) => available.has(name));
  return retained.length ? retained : people[0] ? [people[0].name] : [];
}

export function scheduleDayTotals(people: SchedulePerson[], dates: string[]) {
  return dates.map((date) => {
    let work = 0;
    let off = 0;
    for (const person of people) {
      const code = person.assignments[date]?.trim();
      if (!code) continue;
      const kind = scheduleCodeKind(code);
      if (kind === "work") work += 1;
      if (kind === "off") off += 1;
    }
    return { date, work, off };
  });
}

export function compactScheduleCode(code: string): string {
  if (!code.trim()) return "—";
  const kind = scheduleCodeKind(code);
  if (kind === "off") return "F";
  if (kind === "vacation") return "Fé";
  if (kind === "leave") return "L";
  return code.trim().replace(/^t\.?\s*(\d+)$/i, "T$1");
}

export const SCHEDULE_KIND_STYLE = {
  work: "border-primary/30 bg-primary/10 text-primary",
  off: "border-border bg-secondary text-muted-foreground",
  vacation: "border-warning/40 bg-warning-soft text-warning-foreground",
  leave: "border-navy/20 bg-navy/10 text-navy",
} as const;
