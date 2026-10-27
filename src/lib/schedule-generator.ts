import type { SchedulePayload, SchedulePerson, ScheduleUpload } from "./types";
import { scheduleCodeKind } from "./schedule-import";
import { scheduleMonthDates } from "./schedule-view";
import {
  getScheduleGenerationRule,
  isExcludedFromDuty,
  normalizeScheduleEmployeeName,
  type ScheduleGenerationRule,
} from "./schedule-generator-rules";

export interface ScheduleGeneratedPreview {
  payload: SchedulePayload;
  rule: ScheduleGenerationRule;
  eventCoverage: Array<{ date: string; planned: number | null; assigned: number }>;
  warnings: string[];
  blockingIssues: string[];
  sourceMonth: string;
  targetMonth: string;
}

const OFF = "Folga";
const nationalHolidays = new Set([
  "01-01", "04-21", "05-01", "09-07", "10-12",
  "11-02", "11-15", "11-20", "12-25",
]);
const iso = (day: string) => day.slice(5, 10);
const weekday = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
const nameKey = (person: SchedulePerson) =>
  normalizeScheduleEmployeeName(person.login || person.name);
const isWork = (code: string | undefined) => !!code && scheduleCodeKind(code) === "work";
const isOff = (code: string | undefined) =>
  !!code && (code === "Folga" || scheduleCodeKind(code) === "vacation");

function historicalFixedDay(person: SchedulePerson, month: string, position: number): number {
  const counts = [2, 3, 4].map((day) => ({
    day,
    n: scheduleMonthDates(month).filter((date) =>
      weekday(date) === day && person.assignments[date] === OFF).length,
  }));
  counts.sort((a, b) => b.n - a.n || a.day - b.day);
  return counts[0]!.n >= 2 ? counts[0]!.day : [2, 3, 4][position % 3]!;
}

function dateIsHoliday(date: string, rule: ScheduleGenerationRule) {
  const md = iso(date);
  return nationalHolidays.has(md) || !!rule.additionalHolidays?.includes(md);
}

function getPreviousMonth(month: string): string {
  const [year, m] = month.slice(0, 7).split("-").map(Number);
  const prev = new Date(Date.UTC(year!, m! - 2, 1));
  return String(prev.getUTCFullYear()) + "-" + String(prev.getUTCMonth() + 1).padStart(2, "0");
}

function compSaturday(date: string, available: readonly string[]): string | null {
  const day = weekday(date);
  const dateObject = new Date(date + "T12:00:00Z");
  // Folga no sábado anterior para domingo, ou no sábado imediatamente após feriado útil.
  const delta = day === 0 ? -1 : day === 6 ? 7 : (6 - day + 7) % 7;
  dateObject.setUTCDate(dateObject.getUTCDate() + delta);
  const result = dateObject.toISOString().slice(0, 10);
  return available.includes(result) ? result : null;
}

/** Geração determinística: IA nunca autoriza publicação nem inventa quantitativos. */
export function generateSchedulePreview(
  source: ScheduleUpload,
  targetMonth: string,
): ScheduleGeneratedPreview {
  const rule = getScheduleGenerationRule(source.city, source.sector);
  if (!rule) throw new Error("Não há regra cadastrada para esta cidade e frente.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth.slice(0, 7))) {
    throw new Error("Informe uma competência válida no formato AAAA-MM.");
  }
  const target = targetMonth.slice(0, 7);
  const src = source.schedule_month.slice(0, 7);
  if (src === target) throw new Error("Selecione um mês diferente do período de origem.");
  const dates = scheduleMonthDates(target);
  const sourceDates = scheduleMonthDates(src);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];

  if (src !== getPreviousMonth(target)) {
    warnings.push("Use preferencialmente o mês anterior como base para preservar o rodízio.");
  }
  if (rule.requiresRoleBasedCoverage) {
    blockingIssues.push("Controle RN: informar cobertura por cidade/função antes da publicação.");
  }

  type GeneratedPerson = SchedulePerson & {
    source: SchedulePerson;
    fixed: number;
    dutyCount: number;
    lastEventIndex: number;
    protectedStatus: string | null;
  };
  const people: GeneratedPerson[] = source.payload.people.map((person, index) => {
    const lastStatus = person.assignments[sourceDates.at(-1) || ""] || "";
    const protectedStatus = ["AT", "Férias"].includes(lastStatus) ? lastStatus : null;
    if (protectedStatus) {
      warnings.push(person.name + ": " + protectedStatus +
        " no último dia da origem; confirmar continuidade para o mês de destino.");
      blockingIssues.push(person.name + ": confirmar datas de " + protectedStatus +
        " antes de publicar a nova escala.");
    }
    const shiftOverride =
      rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)];
    const shift = shiftOverride || rule.defaultShift;
    const fixed = historicalFixedDay(person, src, index);
    const assignments = Object.fromEntries(dates.map((date) => {
      if (protectedStatus) return [date, protectedStatus];
      if (weekday(date) === 0 || weekday(date) === fixed || dateIsHoliday(date, rule)) {
        return [date, OFF];
      }
      return [date, weekday(date) === 6 ? (shiftOverride || rule.saturdayShift) : shift];
    }));
    return {
      ...person, assignments, source: person, fixed,
      dutyCount: 0, lastEventIndex: -1000, protectedStatus,
    };
  });

  const sourceEvents = sourceDates.filter((date) =>
    weekday(date) === 0 || dateIsHoliday(date, rule));
  const targetEvents = dates.filter((date) =>
    weekday(date) === 0 || dateIsHoliday(date, rule) ||
    Object.prototype.hasOwnProperty.call(rule.dateDutyOverrides || {}, date));

  // Recupera última posição em que trabalhou em um domingo ou feriado.
  people.forEach((person) => sourceEvents.forEach((date, idx) => {
    if (isWork(person.source.assignments[date])) {
      person.lastEventIndex = idx;
    }
  }));

  const eventCoverage: ScheduleGeneratedPreview["eventCoverage"] = [];
  for (let idx = 0; idx < targetEvents.length; idx += 1) {
    const date = targetEvents[idx]!;
    const isSunday = weekday(date) === 0;
    let quota = isSunday ? rule.sundayDutyCount : rule.holidayDutyCount;
    if (rule.holidayWeekdaysOnly && isSunday) quota = 0;
    quota = rule.dateDutyOverrides?.[date] ?? quota;
    if (quota === null) {
      blockingIssues.push(date + ": quantidade de plantonistas não configurada.");
      eventCoverage.push({ date, planned: null, assigned: 0 });
      continue;
    }
    if (quota === 0) {
      eventCoverage.push({ date, planned: 0, assigned: 0 });
      continue;
    }
    const absoluteIndex = sourceEvents.length + idx;
    const candidates = people.filter((p) =>
      !p.protectedStatus &&
      !isExcludedFromDuty(p.name, rule) &&
      !p.assignments[date]?.startsWith("Férias") &&
      absoluteIndex - p.lastEventIndex > rule.minimumIntermediateDuties);
    candidates.sort((a, b) =>
      a.dutyCount - b.dutyCount ||
      a.lastEventIndex - b.lastEventIndex ||
      nameKey(a).localeCompare(nameKey(b), "pt-BR"));
    const assigned = candidates.slice(0, quota);
    for (const person of assigned) {
      person.assignments[date] =
        rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)] ||
        rule.defaultShift;
      person.lastEventIndex = absoluteIndex;
      person.dutyCount++;
      const saturday = compSaturday(date, dates);
      if (saturday) person.assignments[saturday] = OFF;
      else warnings.push(person.name + ": sábado de compensação fora da competência em " + date);
    }
    if (assigned.length < quota) {
      blockingIssues.push(date + ": cobertura insuficiente (" +
        assigned.length + "/" + quota + ").");
    }
    eventCoverage.push({ date, planned: quota, assigned: assigned.length });
  }

  // Verifica apenas semanas inteiramente contidas no mês; fronteiras exigem o mês vizinho.
  const firstMonday = dates.findIndex((d) => weekday(d) === 1);
  for (const person of people) {
    if (person.protectedStatus) continue;
    for (let i = firstMonday; i >= 0 && i + 6 < dates.length; i += 7) {
      const week = dates.slice(i, i + 7);
      const rest = week.filter((day) => isOff(person.assignments[day])).length;
      if (rest < 2) blockingIssues.push(person.name + ": apenas " +
        rest + " folga(s) na semana de " + week[0]);
    }
    let consecutive = 0;
    for (const date of dates) {
      consecutive = isWork(person.assignments[date]) ? consecutive + 1 : 0;
      if (consecutive > 6) {
        blockingIssues.push(person.name + ": mais de 6 dias seguidos até " + date);
        break;
      }
    }
  }
  warnings.push("Conferir horas de jornada, intervalos, legislação e CCT com RH.");
  warnings.push("Conferir as semanas que atravessam a virada do mês.");

  const outPeople: SchedulePerson[] = people.map(
    ({ source: _source, fixed: _fixed, dutyCount: _count,
      lastEventIndex: _index, protectedStatus: _protected, ...person }) => person,
  );
  return {
    rule, sourceMonth: src, targetMonth: target, eventCoverage,
    warnings, blockingIssues,
    payload: {
      dates, people: outPeople,
      codes: [...new Set(outPeople.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
  };
}
