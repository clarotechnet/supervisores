import { rnDecemberReference, isInitialRnDecember } from "./schedule-rn-december-reference";
import { revalidateSchedulePreview } from "./schedule-preview-editor";
import type { SchedulePayload, SchedulePerson, ScheduleUpload } from "./types";
import { scheduleCodeKind } from "./schedule-import";
import {
  learnFixedRest,
  learnMissingCoverage,
  type FixedRestEvidence,
} from "./schedule-history-memory";
import { scheduleMonthDates } from "./schedule-view";
import type { InheritedSchedulePerson } from "./schedule-continuity";
import {
  CONTROL_DECEMBER_REFERENCE_ID,
  controlDecemberReference,
} from "./schedule-control-december-reference";
import {
  getScheduleGenerationRule,
  scheduleRuleForMonth,
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
  referenceSeedId?: string;
  fixedRestPolicy?: "preserve-history" | "initial-distribution";
  fixedRestEvidence?: FixedRestEvidence[];
  inheritedAssignments?: InheritedSchedulePerson[];
  generationDecision?: {
    mode: "ai" | "rules";
    selectedOption: string;
    summary: string;
    sourceId: string;
    sourceUpdatedAt: string;
  };
  calendarWeeks: string[][];
  // Dias fora da competência: mês anterior é histórico imutável; próximo mês é provisório.
  outsideAssignments: Record<string, string>[];
}

const OFF = "Folga";
const nationalHolidays = new Set([
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
  const start = moveDate(first, -weekday(first));
  const weeks: string[][] = [];
  for (let sunday = start; sunday <= last; sunday = moveDate(sunday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => moveDate(sunday, index)));
  }
  return weeks;
}
const nameKey = (person: SchedulePerson) =>
  normalizeScheduleEmployeeName(person.login || person.name);
const isWork = (code: string | undefined) =>
  !!code &&
  normalizeScheduleEmployeeName(code) !== "SEM INFORMACAO" &&
  scheduleCodeKind(code) === "work";
// Férias e afastamentos não são folgas de descanso semanal.
const isOff = (code: string | undefined) => !!code && scheduleCodeKind(code) === "off";

function historicalFixedDay(
  person: SchedulePerson,
  month: string,
  position: number,
  rule: ScheduleGenerationRule,
): { day: number; confident: boolean } {
  const evidence = learnFixedRest(person, month, rule);
  const allowed = rule.fixedOffWeekdays?.length ? rule.fixedOffWeekdays : [1, 2, 3, 4, 5, 6];
  return {
    day: evidence.day ?? allowed[position % allowed.length]!,
    confident: evidence.day !== null,
  };
}

function isControlSupervisor(person: SchedulePerson) {
  return normalizeScheduleEmployeeName(person.jobTitle).includes("SUPERVISOR COP");
}
function isControlAdesao(person: SchedulePerson) {
  return (
    normalizeScheduleEmployeeName(person.jobTitle).includes("CONTROLADOR") &&
    normalizeScheduleEmployeeName(person.jobTitle).includes("ADESAO")
  );
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

/**
 * Primeira escala 5x2 do Controle: dezembro NÃO deriva folgas fixas de
 * novembro (6x1). Reproduz a referência enviada pela gestão, inclusive
 * seus plantões e ajustes de 01–04/01/2027, sem correções silenciosas.
 */
export function isInitialControlDecember(city: string, sector: string, month: string) {
  return (
    city === "natal" &&
    (sector === "controle-operacional" || sector === "controle") &&
    month.slice(0, 7) === "2026-12"
  );
}

export function generateInitialControlDecemberPreview(
  source: ScheduleUpload,
): ScheduleGeneratedPreview {
  if (!isInitialControlDecember(source.city, source.sector, "2026-12"))
    throw new Error("A referência inicial é exclusiva de Controle RN em dezembro/2026.");
  if (source.schedule_month.slice(0, 7) !== "2026-11")
    throw new Error("O cadastro-base para dezembro deve ser de novembro/2026.");

  const rule = getScheduleGenerationRule("natal", "controle-operacional")!;
  const month = "2026-12";
  const dates = scheduleMonthDates(month);
  const weeks = scheduleCalendarWeeks(month);
  const warnings: string[] = [
    "Primeira escala 5x2: referência Excel de dezembro/2026; novembro era 6x1 e NÃO foi usado para inferir folgas.",
    "Folgas e plantões do modelo são uma proposta editável. Confirme as exceções com a gestão antes de aprovar.",
    "Na primeira semana (29/11 a 05/12), os dias de novembro pertencem ao regime anterior 6x1; revisar a transição com o RH.",
  ];
  const blockingIssues: string[] = [];
  const inputByName = new Map(
    source.payload.people.map((p) => [normalizeScheduleEmployeeName(p.name), p]),
  );
  const data = controlDecemberReference();
  const expectedNames = new Set(data.map((p) => normalizeScheduleEmployeeName(p.name)));
  for (const prev of source.payload.people) {
    if (!expectedNames.has(normalizeScheduleEmployeeName(prev.name))) {
      warnings.push(
        prev.name +
          ": está em novembro, mas não consta no modelo de dezembro; confirmar movimentação de pessoal.",
      );
    }
  }
  const outPeople: SchedulePerson[] = [];
  const outsideAssignments: Record<string, string>[] = [];
  for (const reference of data) {
    const previous = inputByName.get(normalizeScheduleEmployeeName(reference.name));
    if (!previous) {
      blockingIssues.push(
        reference.name +
          ": sem correspondência no cadastro de novembro; vincular login antes de aprovar.",
      );
    }
    const december = Object.fromEntries(
      dates.map((day) => [day, reference.assignments[day] || ""]),
    );
    outPeople.push({
      name: reference.name,
      login: previous?.login ?? "",
      jobTitle: reference.jobTitle,
      assignments: december,
    });
    const beyond = Object.fromEntries(
      Object.entries(reference.assignments).filter(([day]) => day > "2026-12-31"),
    );
    outsideAssignments.push({
      "2026-11-29": previous?.assignments["2026-11-29"] || "Sem informação",
      "2026-11-30": previous?.assignments["2026-11-30"] || "Sem informação",
      ...beyond,
    });
    if (!previous?.assignments["2026-11-30"]) {
      warnings.push(
        reference.name +
          ": histórico de 30/11 não encontrado (sem impacto na proposta de dezembro).",
      );
    }
    const wasAway = previous?.assignments["2026-11-30"] || "";
    if (
      ["AT", "Férias", "Ferias"].includes(wasAway) &&
      !["AT", "Férias", "Ferias"].includes(reference.assignments["2026-12-01"] || "")
    ) {
      warnings.push(
        reference.name +
          ": novembro termina com " +
          wasAway +
          ", mas o modelo de dezembro prevê trabalho; confirmar data efetiva de retorno.",
      );
    }
  }
  const eventCoverage: ScheduleGeneratedPreview["eventCoverage"] = [];
  for (const date of dates.filter((d) => weekday(d) === 0 || dateIsHoliday(d, rule))) {
    const quota =
      rule.dateDutyOverrides?.[date] ??
      (weekday(date) === 0 ? rule.sundayDutyCount : rule.holidayDutyCount);
    const assigned = outPeople.filter(
      (p) => normalizeScheduleEmployeeName(p.assignments[date] || "") === "PLANTAO",
    );
    eventCoverage.push({ date, planned: quota, assigned: assigned.length });
    if (quota !== assigned.length) {
      blockingIssues.push(
        date + ": modelo possui " + assigned.length + " plantonistas; meta " + String(quota) + ".",
      );
    }
    if (
      (rule.minimumSupervisorDuty ?? 0) > 0 &&
      assigned.filter((p) => isControlSupervisor(p)).length < rule.minimumSupervisorDuty!
    ) {
      blockingIssues.push(date + ": modelo não possui a cobertura mínima de supervisor COP.");
    }
    if (
      (rule.minimumAdesaoControllerDuty ?? 0) > 0 &&
      assigned.filter((p) => isControlAdesao(p)).length < rule.minimumAdesaoControllerDuty!
    ) {
      blockingIssues.push(date + ": modelo não possui controlador de Adesão no plantão.");
    }
    for (const p of assigned) {
      if (isExcludedFromDuty(p.name, rule)) {
        blockingIssues.push(date + ": plantonista excluído no modelo: " + p.name);
      }
    }
  }
  // Atestados e férias não são folgas. Uma semana que inclua esses
  // afastamentos não deve gerar bloqueio automático de 5x2; exija revisão
  // de jornada pelo RH. Plantão de domingo pertence à semana domingo–sábado.
  for (let i = 0; i < outPeople.length; i++) {
    const person = outPeople[i]!;
    const full = { ...outsideAssignments[i], ...person.assignments };
    for (const week of weeks) {
      if (week[0]! < "2026-12-01") continue;
      const values = week.map((day) => full[day] || "");
      const leaveDays = values.filter((code) =>
        ["vacation", "certificate", "leave", "absence"].includes(scheduleCodeKind(code)),
      ).length;
      if (leaveDays > 0) {
        warnings.push(
          person.name +
            ": semana " +
            week[0] +
            " a " +
            week[6] +
            " contém " +
            leaveDays +
            " dia(s) de férias/afastamento; avaliar jornada e descanso separadamente.",
        );
        continue;
      }
      const rests = values.filter((code) => code === "Folga").length;
      const work = values.filter((code) => isWork(code)).length;
      if (rests < 2 || work > 5) {
        blockingIssues.push(
          person.name +
            ": referência de dezembro prevê " +
            rests +
            " folga(s) e " +
            work +
            " dia(s) de trabalho na semana " +
            week[0] +
            " a " +
            week[6] +
            "; confirmar exceção 5x2.",
        );
      }
    }
  }
  warnings.push(
    "Os dias 01–04/01/2027 estão preservados conforme o Excel, mas poderão ser editados na escala operacional.",
  );
  warnings.push("Conferir horas efetivas, intervalos, acordos coletivos e exceções com RH.");
  return {
    rule,
    sourceMonth: "2026-11",
    targetMonth: "2026-12",
    referenceSeedId: CONTROL_DECEMBER_REFERENCE_ID,
    calendarWeeks: weeks,
    outsideAssignments,
    eventCoverage,
    warnings,
    blockingIssues,
    payload: {
      dates,
      people: outPeople,
      codes: [...new Set(outPeople.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
  };
}

/** Geração determinística: IA nunca autoriza publicação nem inventa quantitativos. */
export function generateSchedulePreview(
  source: ScheduleUpload,
  targetMonth: string,
  options: {
    tieBreakSeed?: number;
    previousRule?: Partial<ScheduleGenerationRule> | undefined;
  } = {},
): ScheduleGeneratedPreview {
  const catalogRule = getScheduleGenerationRule(source.city, source.sector);
  if (!catalogRule) throw new Error("Não há regra cadastrada para esta cidade e frente.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth.slice(0, 7))) {
    throw new Error("Informe uma competência válida no formato AAAA-MM.");
  }
  const target = targetMonth.slice(0, 7);
  const inherited = {
    ...catalogRule,
    excludedFromDuty: options.previousRule?.excludedFromDuty ?? catalogRule.excludedFromDuty,
    personShiftOverrides: {
      ...catalogRule.personShiftOverrides,
      ...options.previousRule?.personShiftOverrides,
    },
  };
  if (inherited.sundayDutyCount === null && Number.isInteger(options.previousRule?.sundayDutyCount))
    inherited.sundayDutyCount = options.previousRule!.sundayDutyCount!;
  if (
    inherited.holidayDutyCount === null &&
    Number.isInteger(options.previousRule?.holidayDutyCount)
  )
    inherited.holidayDutyCount = options.previousRule!.holidayDutyCount!;
  const learnedCoverage = learnMissingCoverage(source, inherited);
  const rule = scheduleRuleForMonth(learnedCoverage.rule, target);
  const src = source.schedule_month.slice(0, 7);
  if (src !== getPreviousMonth(target)) {
    throw new Error("A base da geração deve ser exatamente o mês anterior.");
  }
  const dates = scheduleMonthDates(target);
  const sourceDates = scheduleMonthDates(src);
  const calendarWeeks = scheduleCalendarWeeks(target);
  const warnings: string[] = [...learnedCoverage.learned];
  const blockingIssues: string[] = [];
  const fixedRestEvidence: FixedRestEvidence[] = [];

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
    // Se a planilha anterior já contém o início da semana do próximo mês,
    // o último status explícito dessa extensão prevalece sobre 31/12.
    const futureDates = dates.filter(
      (day) =>
        typeof person.assignments[day] === "string" && person.assignments[day]!.trim() !== "",
    );
    const lastKnownStatus = futureDates.length
      ? person.assignments[futureDates.at(-1)!] || ""
      : lastStatus;
    // Férias do mês anterior não definem a programação do próximo mês.
    // Somente AT continua protegido até uma marcação explícita de retorno.
    const protectedStatus =
      scheduleCodeKind(lastKnownStatus) === "certificate" ? lastKnownStatus : null;
    if (
      scheduleCodeKind(lastStatus) === "vacation" ||
      scheduleCodeKind(lastKnownStatus) === "vacation"
    ) {
      warnings.push(
        person.name +
          ": férias anteriores não prorrogadas. Dias ainda não marcados seguem a escala normal e as folgas de referência; datas explícitas do novo mês são preservadas.",
      );
    }
    if (
      ["certificate", "vacation"].includes(scheduleCodeKind(lastStatus)) &&
      !protectedStatus &&
      futureDates.length &&
      scheduleCodeKind(lastKnownStatus) !== "vacation"
    ) {
      warnings.push(
        person.name +
          ": retorno/alteração de " +
          lastStatus +
          " identificado nos primeiros dias da competência; conferir no histórico operacional.",
      );
    }
    if (protectedStatus) {
      warnings.push(
        person.name +
          ": " +
          protectedStatus +
          " no último dia da origem; confirmar continuidade para o mês de destino.",
      );
      blockingIssues.push(
        person.name +
          ": confirmar datas de " +
          protectedStatus +
          " antes de publicar a nova escala.",
      );
    }
    const shiftOverride = rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)];
    const shift = shiftOverride || rule.defaultShift;
    const evidence = learnFixedRest(person, src, rule);
    fixedRestEvidence.push(evidence);
    const inferred = historicalFixedDay(person, src, index, rule);
    const fixed = inferred.day;
    if (!inferred.confident && !protectedStatus) {
      blockingIssues.push(
        person.name +
          ": folga fixa não identificada no mês anterior; confirmar dia antes de aprovar.",
      );
    }
    const inheritedDays = new Set(
      calendarWeeks
        .flat()
        .filter(
          (date) =>
            typeof person.assignments[date] === "string" && person.assignments[date]!.trim() !== "",
        ),
    );
    const assignments = Object.fromEntries(
      dates.map((date) => {
        // Toda marcação explícita da origem é imutável, inclusive sua extensão.
        if (inheritedDays.has(date)) return [date, person.assignments[date]!];
        if (protectedStatus) return [date, protectedStatus];
        if (weekday(date) === 0 || weekday(date) === fixed || dateIsHoliday(date, rule)) {
          return [date, OFF];
        }
        return [date, weekday(date) === 6 ? shiftOverride || rule.saturdayShift : shift];
      }),
    );
    return {
      ...person,
      assignments,
      source: person,
      fixed,
      dutyCount: 0,
      lastEventIndex: -1000,
      protectedStatus,
      assignedDutyDays: new Set<string>(),
      inheritedDays,
    };
  });

  const sourceEvents = sourceDates.filter(
    (date) => weekday(date) === 0 || dateIsHoliday(date, rule),
  );
  const targetEvents = dates.filter(
    (date) =>
      weekday(date) === 0 ||
      dateIsHoliday(date, rule) ||
      Object.prototype.hasOwnProperty.call(rule.dateDutyOverrides || {}, date),
  );

  // Recupera última posição em que trabalhou em um domingo ou feriado.
  people.forEach((person) =>
    sourceEvents.forEach((date, idx) => {
      if (isWork(person.source.assignments[date])) {
        person.lastEventIndex = idx;
      }
    }),
  );

  const orderedKeys = people.map(nameKey).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const order = new Map(orderedKeys.map((key, index) => [key, index]));
  const tieRank = (p: SchedulePerson) =>
    ((order.get(nameKey(p)) || 0) + (options.tieBreakSeed || 0) * 7) % Math.max(people.length, 1);
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
        ? normalizeScheduleEmployeeName(code) === "PLANTAO"
        : isWork(code);
    });
    if (inherited.length > quota) {
      blockingIssues.push(
        date +
          ": o mês anterior já definiu " +
          inherited.length +
          " plantões, acima da demanda " +
          quota +
          ".",
      );
    }
    const assigned = [...inherited];
    for (const person of inherited) {
      if (isExcludedFromDuty(person.name, rule)) {
        blockingIssues.push(date + ": plantão herdado de colaborador excluído: " + person.name);
      }
    }
    const candidates = people.filter(
      (p) =>
        !p.protectedStatus &&
        // Feriado não autoriza transferir silenciosamente a folga fixa.
        (weekday(date) === 0 || weekday(date) !== p.fixed) &&
        (!rule.dutyRequiresLogin || !!p.login?.trim()) &&
        !p.inheritedDays.has(date) &&
        !isExcludedFromDuty(p.name, rule) &&
        !p.assignments[date]?.startsWith("Férias") &&
        (weekday(date) !== 0 ||
          moveDate(date, -1) >= dates[0]! ||
          isOff(p.source.assignments[moveDate(date, -1)])) &&
        absoluteIndex - p.lastEventIndex > rule.minimumIntermediateDuties,
    );
    candidates.sort(
      (a, b) =>
        a.dutyCount - b.dutyCount ||
        a.lastEventIndex - b.lastEventIndex ||
        tieRank(a) - tieRank(b) ||
        nameKey(a).localeCompare(nameKey(b), "pt-BR"),
    );
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
        person.assignments[date] =
          rule.dutyCode ||
          rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)] ||
          rule.defaultShift;
      }
      person.lastEventIndex = absoluteIndex;
      person.dutyCount++;
      person.assignedDutyDays.add(date);
      // A compensação é resolvida no MESMO período domingo–sábado
      // depois da distribuição de todos os plantões, não no sábado anterior
      // (que pertence a outra semana e mascarava faltas de folga).
    }
    if (assigned.length < quota) {
      blockingIssues.push(
        date + ": cobertura insuficiente (" + assigned.length + "/" + quota + ").",
      );
    }
    if (
      rule.minimumSupervisorDuty &&
      assigned.filter(isControlSupervisor).length < rule.minimumSupervisorDuty
    ) {
      blockingIssues.push(date + ": falta supervisor COP entre os plantonistas.");
    }
    if (
      rule.minimumAdesaoControllerDuty &&
      assigned.filter(isControlAdesao).length < rule.minimumAdesaoControllerDuty
    ) {
      blockingIssues.push(date + ": falta controlador de Adesão entre os plantonistas.");
    }
    eventCoverage.push({ date, planned: quota, assigned: assigned.length });
  }

  // Projeta o calendário inteiro da primeira à última semana (domingo a sábado).
  // Nunca modifica dias já ocorridos no mês-base; janeiro é apenas uma simulação
  // quando a semana de dezembro termina depois da virada do mês.
  const firstDate = dates[0]!;
  const lastDate = dates.at(-1)!;
  const calendarDates = calendarWeeks.flat();
  const outsideAssignments = people.map((person) =>
    Object.fromEntries(
      calendarDates
        .filter((day) => day < firstDate || day > lastDate)
        .map((day) => {
          if (person.inheritedDays.has(day)) return [day, person.source.assignments[day]!];
          if (day < firstDate) {
            const historical = person.source.assignments[day] || "Sem informação";
            if (historical === "Sem informação") {
              blockingIssues.push(person.name + ": falta histórico em " + day);
            }
            return [day, historical];
          }
          if (person.protectedStatus) return [day, person.protectedStatus];
          const override = rule.personShiftOverrides?.[normalizeScheduleEmployeeName(person.name)];
          const shift = override || rule.defaultShift;
          const code =
            weekday(day) === 0 || weekday(day) === person.fixed || dateIsHoliday(day, rule)
              ? OFF
              : weekday(day) === 6
                ? override || rule.saturdayShift
                : shift;
          return [day, code];
        }),
    ),
  );
  // A última semana da competência pode depender de descanso no próximo mês.
  // Esses dias aparecem claramente como provisórios na prévia.
  for (let index = 0; index < people.length; index++) {
    const person = people[index]!;
    if (person.protectedStatus) continue;
    const full = { ...outsideAssignments[index], ...person.assignments };
    for (const week of calendarWeeks) {
      if (
        week.some((day) =>
          ["vacation", "certificate", "leave", "absence"].includes(
            scheduleCodeKind(full[day] || ""),
          ),
        )
      ) {
        warnings.push(
          person.name +
            ": semana " +
            week[0] +
            " contém férias/afastamento explícito; revisar jornada separadamente.",
        );
        continue;
      }
      const countRest = () => week.filter((day) => isOff(full[day])).length;
      while (countRest() < 2) {
        // Primeiro ajusta somente a competência a ser gerada, depois os
        // dias futuros provisórios. Nunca altera o histórico já importado.
        const candidates = week.filter(
          (day) =>
            day >= firstDate &&
            isWork(full[day]) &&
            !person.assignedDutyDays.has(day) &&
            !person.inheritedDays.has(day),
        );
        candidates.sort((a, b) => {
          const coverage = (day: string) => people.filter((p) => isWork(p.assignments[day])).length;
          // Se o domingo virou PLANTÃO, primeiro considera segunda-feira
          // ou o dia posterior mais próximo, DENTRO da mesma semana.
          const dutyDates = [...person.assignedDutyDays].filter((day) => week.includes(day));
          const compensationRank = (day: string) =>
            dutyDates.length
              ? Math.min(
                  ...dutyDates.map((event) => {
                    const distance = Math.round(
                      (Date.parse(day + "T12:00:00Z") - Date.parse(event + "T12:00:00Z")) /
                        86400000,
                    );
                    return distance > 0 ? distance : 12 + Math.abs(distance);
                  }),
                )
              : 100;
          return (
            (a <= lastDate ? 0 : 1) - (b <= lastDate ? 0 : 1) ||
            compensationRank(a) - compensationRank(b) ||
            coverage(b) - coverage(a) ||
            a.localeCompare(b)
          );
        });
        const chosen = candidates[0];
        if (!chosen) break;
        full[chosen] = OFF;
        if (chosen <= lastDate) person.assignments[chosen] = OFF;
        else outsideAssignments[index]![chosen] = OFF;
      }
      const rest = countRest();
      if (rest < 2) {
        blockingIssues.push(
          person.name + ": apenas " + rest + " descanso(s) na semana " + week[0] + " a " + week[6],
        );
      }
      const worked = week.filter((day) => isWork(full[day])).length;
      if (worked > 5) {
        blockingIssues.push(
          person.name + ": " + worked + " dias de trabalho na semana " + week[0] + " a " + week[6],
        );
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
    warnings.push(
      "Os dias do mês seguinte são provisórios: confirme-os ao gerar a próxima competência.",
    );
  }
  warnings.push("Conferir horas efetivas, intervalos, legislação e CCT com RH.");

  const outPeople: SchedulePerson[] = people.map(
    ({
      source: _source,
      fixed: _fixed,
      dutyCount: _count,
      lastEventIndex: _index,
      protectedStatus: _protected,
      assignedDutyDays: _duties,
      inheritedDays: _inherited,
      ...person
    }) => person,
  );
  const result: ScheduleGeneratedPreview = {
    rule,
    inheritedAssignments: people.map((p) => ({
      name: p.name,
      ...(p.login !== undefined ? { login: p.login } : {}),
      assignments: Object.fromEntries(
        [...p.inheritedDays].map((day) => [day, p.source.assignments[day]!]),
      ),
    })),
    fixedRestPolicy: "preserve-history",
    fixedRestEvidence,
    sourceMonth: src,
    targetMonth: target,
    eventCoverage,
    calendarWeeks,
    outsideAssignments,
    warnings,
    blockingIssues,
    payload: {
      dates,
      people: outPeople,
      codes: [...new Set(outPeople.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
  };
  const inheritedTargetDays = [...new Set(people.flatMap((p) => [...p.inheritedDays]))]
    .filter((d) => d >= firstDate)
    .sort();
  if (inheritedTargetDays.length)
    result.warnings.push(
      "Continuidade preservada da aba " +
        source.source_sheet +
        ": marcações já preenchidas até " +
        inheritedTargetDays.at(-1) +
        " estão bloqueadas. Conflitos nesses dias devem ser conferidos na escala anterior, sem remanejamento automático.",
    );
  return revalidateSchedulePreview(result);
}

/** Dezembro RN inicia no modelo fornecido, sem recalcular a proposta a partir do 6x1. */
export function generateInitialRnDecemberPreview(source: ScheduleUpload): ScheduleGeneratedPreview {
  if (
    !isInitialRnDecember(source.city, source.sector, "2026-12") ||
    source.schedule_month.slice(0, 7) !== "2026-11"
  )
    throw Error("Modelo inicial RN exclusivo de dezembro/2026 com base em novembro.");
  const generated = generateSchedulePreview(source, "2026-12");
  const reference = rnDecemberReference(source.sector)!;
  const byName = new Map(
    source.payload.people.map((p) => [normalizeScheduleEmployeeName(p.name), p]),
  );
  const outside = reference.map((p) => {
    const previous = byName.get(normalizeScheduleEmployeeName(p.name));
    const generatedIndex = generated.payload.people.findIndex(
      (item) => normalizeScheduleEmployeeName(item.name) === normalizeScheduleEmployeeName(p.name),
    );
    const defaults = generated.outsideAssignments[generatedIndex] || {};
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(p.assignments).filter(([day, code]) => day > "2026-12-31" && !!code),
      ),
      ...Object.fromEntries(
        generated.calendarWeeks
          .flat()
          .filter((day) => day < "2026-12-01")
          .map((day) => [day, previous?.assignments[day] || "Sem informação"]),
      ),
    };
  });
  return revalidateSchedulePreview({
    ...generated,
    referenceSeedId: "rn-2026-12-5x2-v2",
    fixedRestPolicy: "initial-distribution",
    fixedRestEvidence: [],
    blockingIssues: [],
    warnings: [
      "Modelo inicial de dezembro/2026 fornecido pela gestão. Revise antes de aprovar.",
      "Dias anteriores são histórico 6x1; a transição exige revisão. Os dias futuros são provisórios.",
    ],
    outsideAssignments: outside,
    payload: {
      dates: generated.payload.dates,
      codes: [],
      people: reference.map((p) => ({
        ...p,
        jobTitle: p.jobTitle || byName.get(normalizeScheduleEmployeeName(p.name))?.jobTitle || "",
        assignments: Object.fromEntries(
          generated.payload.dates.map((day) => [day, p.assignments[day] || ""]),
        ),
      })),
    },
  });
}
