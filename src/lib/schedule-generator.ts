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
  calendarWeeks: string[][];
  // Dias fora da competência: mês anterior é histórico imutável; próximo mês é provisório.
  outsideAssignments: Record<string, string>[];
}

const OFF = "Folga";
const nationalHolidays = new Set([
  "01-01", "04-21", "05-01", "09-07", "10-12",
  "11-02", "11-15", "11-20", "12-25",
]);
const iso = (day: string) => day.slice(5, 10);
const weekday = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
const moveDate = (day: string, amount: number) => {
  const value = new Date(day + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

export function scheduleCalendarWeeks(month: string): string[][] {
  const dates = scheduleMonthDates(month);
  const first = dates[0]!;
  const last = dates.at(-1)!;
  const start = moveDate(first, -(weekday(first) + 6) % 7);
  const weeks: string[][] = [];
  for (let monday = start; monday <= last; monday = moveDate(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => moveDate(monday, index)));
  }
  return weeks;
}
const nameKey = (person: SchedulePerson) =>
  normalizeScheduleEmployeeName(person.login || person.name);
const isWork = (code: string | undefined) => !!code && scheduleCodeKind(code) === "work";
const isOff = (code: string | undefined) =>
  !!code && (code === "Folga" || scheduleCodeKind(code) === "vacation");

function historicalFixedDay(
  person: SchedulePerson, month: string, position: number,
  rule: ScheduleGenerationRule,
): { day: number; confident: boolean } {
  const allowed = rule.fixedOffWeekdays?.length ? rule.fixedOffWeekdays : [2, 3, 4];
  const counts = allowed.map((day) => ({
    day,
    n: scheduleMonthDates(month).filter((date) =>
      weekday(date) === day && person.assignments[date] === OFF).length,
  }));
  counts.sort((a, b) => b.n - a.n || a.day - b.day);
  const confident = (counts[0]?.n ?? 0) >= 2;
  return {
    day: confident ? counts[0]!.day : allowed[position % allowed.length]!,
    confident,
  };
}

function isControlSupervisor(person: SchedulePerson) {
  return normalizeScheduleEmployeeName(person.jobTitle).includes("SUPERVISOR COP");
}
function isControlAdesao(person: SchedulePerson) {
  return normalizeScheduleEmployeeName(person.jobTitle).includes("CONTROLADOR") &&
    normalizeScheduleEmployeeName(person.jobTitle).includes("ADESAO");
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
  if (src !== getPreviousMonth(target)) {
    throw new Error("A base da geração deve ser exatamente o mês anterior.");
  }
  const dates = scheduleMonthDates(target);
  const sourceDates = scheduleMonthDates(src);
  const calendarWeeks = scheduleCalendarWeeks(target);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];

  if (rule.requiresRoleBasedCoverage) {
    blockingIssues.push("Controle RN: informar cobertura por cidade/função antes da publicação.");
  }

  type GeneratedPerson = SchedulePerson & {
    source: SchedulePerson;
    fixed: number;
    dutyCount: number;
    lastEventIndex: number;
    protectedStatus: string | null;
    assignedDutyDays: Set<string>;
    inheritedDays: Set<string>;
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
    const inferred = historicalFixedDay(person, src, index, rule);
    const fixed = inferred.day;
    if (!inferred.confident && rule.fixedOffWeekdays) {
      blockingIssues.push(person.name +
        ": folga fixa não identificada no mês anterior; confirmar dia antes de aprovar.");
    }
    const inheritedDays = new Set(dates.filter((date) =>
      typeof person.assignments[date] === "string" && person.assignments[date]!.trim() !== ""));
    const assignments = Object.fromEntries(dates.map((date) => {
      // O modelo importado inclui 01–03/01. Esses dias não podem ser substituídos.
      if (inheritedDays.has(date)) return [date, person.assignments[date]!];
      if (protectedStatus) return [date, protectedStatus];
      if (weekday(date) === 0 || weekday(date) === fixed || dateIsHoliday(date, rule)) {
        return [date, OFF];
      }
      return [date, weekday(date) === 6 ? (shiftOverride || rule.saturdayShift) : shift];
    }));
    return {
      ...person, assignments, source: person, fixed,
      dutyCount: 0, lastEventIndex: -1000, protectedStatus,
      assignedDutyDays: new Set<string>(),
      inheritedDays,
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
    const inherited = people.filter((person) => {
      if (!person.inheritedDays.has(date)) return false;
      const code = person.assignments[date] || "";
      return rule.dutyCode === "PLANTÃO"
        ? normalizeScheduleEmployeeName(code) === "PLANTAO" : isWork(code);
    });
    if (inherited.length > quota) {
      blockingIssues.push(date + ": o mês anterior já definiu " +
        inherited.length + " plantões, acima da demanda " + quota + ".");
    }
    const assigned = [...inherited];
    for (const person of inherited) {
      if (isExcludedFromDuty(person.name, rule)) {
        blockingIssues.push(date + ": plantão herdado de colaborador excluído: " + person.name);
      }
    }
    const candidates = people.filter((p) =>
      !p.protectedStatus &&
      !p.inheritedDays.has(date) &&
      !isExcludedFromDuty(p.name, rule) &&
      !p.assignments[date]?.startsWith("Férias") &&
      (weekday(date) !== 0 || moveDate(date, -1) >= dates[0]! ||
        isOff(p.source.assignments[moveDate(date, -1)])) &&
      absoluteIndex - p.lastEventIndex > rule.minimumIntermediateDuties);
    candidates.sort((a, b) =>
      a.dutyCount - b.dutyCount ||
      a.lastEventIndex - b.lastEventIndex ||
      nameKey(a).localeCompare(nameKey(b), "pt-BR"));
    const assignRequired = (
      minimum: number | undefined,
      predicate: (person: SchedulePerson) => boolean,
      label: string,
    ) => {
      if (!minimum) return;
      while (assigned.filter(predicate).length < minimum && assigned.length < quota) {
        const next = candidates.find((p) => !assigned.includes(p) && predicate(p));
        if (!next) {
          blockingIssues.push(date + ": falta cobertura de " + label + ".");
          break;
        }
        assigned.push(next);
      }
    };
    assignRequired(rule.minimumSupervisorDuty, isControlSupervisor, "supervisor COP");
    assignRequired(rule.minimumAdesaoControllerDuty, isControlAdesao, "controlador de Adesão");
    for (const person of candidates) {
      if (assigned.length >= quota) break;
      if (!assigned.includes(person)) assigned.push(person);
    }
    for (const person of assigned) {
      if (!person.inheritedDays.has(date)) {
        person.assignments[date] = rule.dutyCode ||
          rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)] ||
          rule.defaultShift;
      }
      person.lastEventIndex = absoluteIndex;
      person.dutyCount++;
      person.assignedDutyDays.add(date);
      const saturday = compSaturday(date, dates);
      if (saturday) {
        if (person.inheritedDays.has(saturday)) {
          if (!isOff(person.assignments[saturday])) {
            blockingIssues.push(person.name + ": sábado " + saturday +
              " já está definido como trabalho no mês anterior.");
          }
        } else person.assignments[saturday] = OFF;
      } else if (weekday(date) === 0) {
        const previousSaturday = moveDate(date, -1);
        if (previousSaturday < dates[0]!) {
          const actual = person.source.assignments[previousSaturday];
          if (!isOff(actual)) blockingIssues.push(person.name + ": sábado anterior (" +
            previousSaturday + ") não foi folga; revisão necessária.");
        }
      } else warnings.push(person.name + ": compensação após " + date +
        " exige conferir o próximo mês.");
    }
    if (assigned.length < quota) {
      blockingIssues.push(date + ": cobertura insuficiente (" +
        assigned.length + "/" + quota + ").");
    }
    if (rule.minimumSupervisorDuty &&
      assigned.filter(isControlSupervisor).length < rule.minimumSupervisorDuty) {
      blockingIssues.push(date + ": falta supervisor COP entre os plantonistas.");
    }
    if (rule.minimumAdesaoControllerDuty &&
      assigned.filter(isControlAdesao).length < rule.minimumAdesaoControllerDuty) {
      blockingIssues.push(date + ": falta controlador de Adesão entre os plantonistas.");
    }
    eventCoverage.push({ date, planned: quota, assigned: assigned.length });
  }

  // Projeta o calendário inteiro da primeira à última semana (segunda a domingo).
  // Nunca modifica dias já ocorridos no mês-base; janeiro é apenas uma simulação
  // quando a semana de dezembro termina depois da virada do mês.
  const firstDate = dates[0]!;
  const lastDate = dates.at(-1)!;
  const calendarDates = calendarWeeks.flat();
  const outsideAssignments = people.map((person) => Object.fromEntries(
    calendarDates.filter((day) => day < firstDate || day > lastDate)
      .map((day) => {
        if (day < firstDate) {
          const historical = person.source.assignments[day] || "Sem informação";
          if (historical === "Sem informação") {
            blockingIssues.push(person.name + ": falta histórico em " + day);
          }
          return [day, historical];
        }
        if (person.protectedStatus) return [day, person.protectedStatus];
        const override = rule.personShiftOverrides?.[
          normalizeScheduleEmployeeName(person.name)
        ];
        const shift = override || rule.defaultShift;
        const code = weekday(day) === 0 || weekday(day) === person.fixed ||
          dateIsHoliday(day, rule)
          ? OFF
          : weekday(day) === 6 ? (override || rule.saturdayShift) : shift;
        return [day, code];
      }),
  ));
  // O último domingo da competência pode depender de descanso em janeiro.
  // Esses dias aparecem claramente como provisórios na prévia.
  for (let index = 0; index < people.length; index++) {
    const person = people[index]!;
    if (person.protectedStatus) continue;
    const full = { ...outsideAssignments[index], ...person.assignments };
    for (const week of calendarWeeks) {
      const countRest = () => week.filter((day) => isOff(full[day])).length;
      while (countRest() < 2) {
        // Primeiro ajusta somente a competência a ser gerada, depois os
        // dias futuros provisórios. Nunca altera o histórico já importado.
        const candidates = week.filter((day) =>
          day >= firstDate &&
          isWork(full[day]) &&
          !person.assignedDutyDays.has(day) &&
          !person.inheritedDays.has(day));
        candidates.sort((a, b) => {
          const coverage = (day: string) => people.filter((p) =>
            isWork(p.assignments[day])).length;
          const inMonthA = a <= lastDate ? 0 : 1;
          const inMonthB = b <= lastDate ? 0 : 1;
          return inMonthA - inMonthB ||
            coverage(b) - coverage(a) || a.localeCompare(b);
        });
        const chosen = candidates[0];
        if (!chosen) break;
        full[chosen] = OFF;
        if (chosen <= lastDate) person.assignments[chosen] = OFF;
        else outsideAssignments[index]![chosen] = OFF;
      }
      const rest = countRest();
      if (rest < 2) {
        blockingIssues.push(person.name + ": apenas " + rest +
          " descanso(s) na semana " + week[0] + " a " + week[6]);
      }
      const worked = week.filter((day) => isWork(full[day])).length;
      if (worked > 5) {
        blockingIssues.push(person.name + ": " + worked +
          " dias de trabalho na semana " + week[0] + " a " + week[6]);
      }
    }
    let consecutive = 0;
    for (const day of calendarDates) {
      consecutive = isWork(full[day]) ? consecutive + 1 : 0;
      if (consecutive > 6) {
        blockingIssues.push(person.name + ": mais de 6 dias consecutivos até " + day);
        break;
      }
    }
  }
  if (calendarDates.at(-1)! > lastDate) {
    warnings.push("Os dias do mês seguinte são provisórios: confirme-os ao gerar a próxima competência.");
  }
  warnings.push("Conferir horas efetivas, intervalos, legislação e CCT com RH.");

  const outPeople: SchedulePerson[] = people.map(
    ({ source: _source, fixed: _fixed, dutyCount: _count,
      lastEventIndex: _index, protectedStatus: _protected,
      assignedDutyDays: _duties, inheritedDays: _inherited, ...person }) => person,
  );
  return {
    rule, sourceMonth: src, targetMonth: target, eventCoverage,
    calendarWeeks, outsideAssignments,
    warnings, blockingIssues,
    payload: {
      dates, people: outPeople,
      codes: [...new Set(outPeople.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
  };
}
