/**
 * Editor não destrutivo de prévias 5x2 de todas as frentes.
 * O Excel referência e o mês 6x1 de novembro nunca são modificados.
 */
import type { ScheduleGeneratedPreview } from "./schedule-generator";
import { scheduleCodeKind } from "./schedule-import";
import { applyVacationContinuationPolicy } from "./schedule-preview-policy";
import { fixedRestSummary } from "./schedule-fixed-rest";
import { CONTROL_DECEMBER_REFERENCE_ID } from "./schedule-control-december-reference";
import { isExcludedFromDuty, normalizeScheduleEmployeeName } from "./schedule-generator-rules";

export type EditablePersonField = "name" | "login" | "jobTitle";
const normalize = normalizeScheduleEmployeeName;
const isEvent = (date: string) =>
  new Date(date + "T12:00:00Z").getUTCDay() === 0 || date.slice(5) === "12-25";
const work = (code: string | undefined) => !!code && scheduleCodeKind(code) === "work";
const plantao = (code: string | undefined) => normalize(code || "") === "PLANTAO";
const supervisor = (title: string) => normalize(title).includes("SUPERVISOR COP");
const adesao = (title: string) => {
  const name = normalize(title);
  return name.includes("CONTROLADOR") && name.includes("ADESAO");
};
function guard(preview: ScheduleGeneratedPreview) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(preview.targetMonth))
    throw Error("Competência da prévia inválida.");
}
function editableDates(preview: ScheduleGeneratedPreview, index: number) {
  return new Set([
    ...preview.payload.dates,
    ...Object.keys(preview.outsideAssignments[index] || {}).filter(
      (date) => date > preview.targetMonth + "-31",
    ),
  ]);
}
function revalidateInitialControlPreview(
  preview: ScheduleGeneratedPreview,
): ScheduleGeneratedPreview {
  guard(preview);
  const issues = preview.blockingIssues.filter(
    (message) =>
      message.includes("sem correspondência no cadastro de novembro") &&
      preview.payload.people.some((p) => message.startsWith(p.name + ":")),
  );
  const warnings = preview.warnings.filter(
    (line) => !line.includes(": semana ") && !line.includes(": folga antecipada de "),
  );
  const coverage: ScheduleGeneratedPreview["eventCoverage"] = [];
  const people = preview.payload.people;
  const rule = preview.rule;
  // O modelo de dezembro admite ajustes em plantões e feriado, mas preserva
  // as quotas declaradas pela gestão até que uma política seja aprovada.
  for (const date of preview.payload.dates.filter(isEvent)) {
    const quota =
      rule.dateDutyOverrides?.[date] ??
      (new Date(date + "T12:00:00Z").getUTCDay() === 0
        ? rule.sundayDutyCount
        : rule.holidayDutyCount);
    const assigned = people.filter((p) => plantao(p.assignments[date]));
    coverage.push({ date, planned: quota, assigned: assigned.length });
    if (quota !== assigned.length)
      issues.push(
        date +
          ": cobertura de plantão " +
          assigned.length +
          "/" +
          (quota ?? "?") +
          " após revisão; conferir substituições.",
      );
    if (assigned.filter((p) => supervisor(p.jobTitle)).length < (rule.minimumSupervisorDuty ?? 0))
      issues.push(date + ": falta supervisor COP entre plantonistas.");
    if (assigned.filter((p) => adesao(p.jobTitle)).length < (rule.minimumAdesaoControllerDuty ?? 0))
      issues.push(date + ": falta controlador de Adesão entre plantonistas.");
    for (const person of assigned)
      if (isExcludedFromDuty(person.name, rule))
        issues.push(date + ": pessoa excluída de plantão: " + person.name);
  }

  for (let i = 0; i < people.length; i++) {
    const p = people[i]!;
    const all = { ...preview.outsideAssignments[i], ...p.assignments };
    for (const day of preview.payload.dates) {
      if (!p.assignments[day]?.trim())
        issues.push(p.name + ": dia " + day + " sem código de escala.");
    }
    for (const day of Object.keys(preview.outsideAssignments[i] || {}).filter(
      (d) => d > preview.targetMonth + "-31",
    )) {
      if (!all[day]?.trim())
        issues.push(p.name + ": dia adicional " + day + " sem código de escala.");
    }
    for (const week of preview.calendarWeeks) {
      // Novembro era 6x1. Férias não contam como folga e tampouco
      // podem gerar uma pendência falsa de seis dias trabalhados.
      if (week[0]! < preview.targetMonth + "-01") continue;
      const codes = week.map((day) => all[day] || "");
      const leaveDays = codes.filter((code) =>
        ["vacation", "certificate", "leave", "absence"].includes(scheduleCodeKind(code)),
      ).length;
      if (leaveDays > 0) {
        warnings.push(
          p.name +
            ": semana " +
            week[0] +
            " a " +
            week[6] +
            " contém " +
            leaveDays +
            " dia(s) de férias/afastamento; conferir com RH.",
        );
        continue;
      }
      const rest = codes.filter((code) => code === "Folga").length;
      const worked = codes.filter((code) => work(code)).length;
      if (rest < 2 || worked > 5)
        issues.push(
          p.name +
            ": referência de dezembro prevê " +
            rest +
            " folga(s) e " +
            worked +
            " dia(s) de trabalho na semana " +
            week[0] +
            " a " +
            week[6] +
            "; confirmar exceção 5x2.",
        );
    }
  }
  const names = new Set<string>();
  const logins = new Set<string>();
  for (const p of people) {
    const n = normalize(p.name);
    if (!n) issues.push("Há colaborador sem nome no rascunho.");
    else if (names.has(n)) issues.push("Nome de colaborador repetido: " + p.name);
    names.add(n);
    const login = normalize(p.login || "");
    if (login && logins.has(login)) issues.push("Login repetido: " + login);
    if (login) logins.add(login);
    if (!p.jobTitle.trim()) issues.push(p.name + ": função não informada.");
  }
  return {
    ...preview,
    blockingIssues: issues,
    warnings,
    eventCoverage: coverage,
    payload: {
      ...preview.payload,
      codes: [...new Set(people.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
  };
}
function clone(preview: ScheduleGeneratedPreview): ScheduleGeneratedPreview {
  return {
    ...preview,
    payload: {
      ...preview.payload,
      people: preview.payload.people.map((p) => ({ ...p, assignments: { ...p.assignments } })),
      codes: [...preview.payload.codes],
    },
    outsideAssignments: preview.outsideAssignments.map((p) => ({ ...p })),
    rule: { ...preview.rule, excludedFromDuty: [...preview.rule.excludedFromDuty] },
    blockingIssues: [...preview.blockingIssues],
    eventCoverage: [...preview.eventCoverage],
    warnings: [...preview.warnings],
  };
}
export function editControlPreviewCode(
  preview: ScheduleGeneratedPreview,
  index: number,
  date: string,
  raw: string,
) {
  guard(preview);
  if (!Number.isInteger(index) || index < 0 || index >= preview.payload.people.length)
    throw Error("Colaborador inválido.");
  if (!editableDates(preview, index).has(date))
    throw Error("Este dia pertence ao histórico ou não está na referência da prévia.");
  const code = raw.trim();
  if (code.length > 80 || /[<>]/.test(code))
    throw Error("Código inválido. Use no máximo 80 caracteres, sem sinais < ou >.");
  const next = clone(preview);
  if (date.startsWith(preview.targetMonth)) next.payload.people[index]!.assignments[date] = code;
  else next.outsideAssignments[index]![date] = code;
  return revalidateControlPreview(next);
}
export function editControlPreviewPerson(
  preview: ScheduleGeneratedPreview,
  index: number,
  field: EditablePersonField,
  value: string,
) {
  guard(preview);
  if (!Number.isInteger(index) || index < 0 || index >= preview.payload.people.length)
    throw Error("Colaborador inválido.");
  if (value.trim().length > 120 || /[<>]/.test(value))
    throw Error("Identificação inválida: máximo 120 caracteres, sem < ou >.");
  const next = clone(preview);
  const oldName = next.payload.people[index]!.name;
  next.payload.people[index]![field] = value.trim();
  if (field === "name" && normalize(oldName) !== normalize(value)) {
    next.rule.excludedFromDuty = next.rule.excludedFromDuty.map((name) =>
      normalize(name) === normalize(oldName) ? value.trim() : name,
    );
  }
  return revalidateControlPreview(next);
}
/** Alteração explícita pela gestão da elegibilidade a plantão automático.
 * Essa decisão é persistida no policy_snapshot de cada nova revisão.
 */
export function editControlPreviewDutyEligibility(
  preview: ScheduleGeneratedPreview,
  index: number,
  canTakeDuty: boolean,
) {
  guard(preview);
  const person = preview.payload.people[index];
  if (!person) throw Error("Colaborador inválido.");
  const next = clone(preview);
  const key = normalize(person.name);
  const excluded = next.rule.excludedFromDuty.filter((name) => normalize(name) !== key);
  next.rule.excludedFromDuty = canTakeDuty ? excluded : [...excluded, person.name];
  return revalidateControlPreview(next);
}
export function addControlPreviewPerson(preview: ScheduleGeneratedPreview) {
  guard(preview);
  if (preview.payload.people.length >= 500) throw Error("Limite de pessoas atingido.");
  const next = clone(preview);
  const number = next.payload.people.length + 1;
  next.payload.people.push({
    name: "NOVO COLABORADOR " + number,
    login: "",
    jobTitle: "",
    assignments: Object.fromEntries(next.payload.dates.map((d) => [d, ""])),
  });
  const extra = Object.keys(next.outsideAssignments[0] || {}).filter(
    (d) => d > preview.targetMonth + "-31",
  );
  next.outsideAssignments.push(Object.fromEntries(extra.map((d) => [d, ""])));
  return revalidateControlPreview(next);
}
export function removeControlPreviewPerson(preview: ScheduleGeneratedPreview, index: number) {
  guard(preview);
  if (index < 0 || index >= preview.payload.people.length || preview.payload.people.length <= 1)
    throw Error("Não é possível remover este colaborador.");
  const next = clone(preview);
  const removedName = next.payload.people[index]!.name;
  next.rule.excludedFromDuty = next.rule.excludedFromDuty.filter(
    (name) => normalize(name) !== normalize(removedName),
  );
  next.payload.people.splice(index, 1);
  next.outsideAssignments.splice(index, 1);
  return revalidateControlPreview(next);
}

/** Valida a proposta editada sem executar novamente o gerador nem trocar escolhas humanas. */
export function revalidateSchedulePreview(
  preview: ScheduleGeneratedPreview,
): ScheduleGeneratedPreview {
  guard(preview);
  preview = applyVacationContinuationPolicy(preview);
  if (preview.referenceSeedId?.startsWith(CONTROL_DECEMBER_REFERENCE_ID.slice(0, -2)))
    return revalidateInitialControlPreview(preview);
  const rule = preview.rule;
  const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
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
    ...(rule.additionalHolidays || []),
  ]);
  const event = (date: string) =>
    weekday(date) === 0 || holidays.has(date.slice(5)) || date in (rule.dateDutyOverrides || {});
  const isDuty = (code: string | undefined) =>
    rule.dutyCode === "PLANTÃO" ? plantao(code) : work(code);
  const dynamic =
    /: (?:apenas \d+ descanso|\d+ dias de trabalho|mais de 6 dias consecutivos|cobertura de plantão|quantidade de plantonistas|faltam? .*plant|falta cobertura|o mês anterior já definiu|plantão herdado|pessoa excluída|intervalo de rodízio|turno de sábado|turno fixo|semana |dia .*sem código)|^(?:Nome de colaborador repetido|Login repetido|Há colaborador sem nome)/;
  const issues = preview.blockingIssues.filter(
    (line) => !dynamic.test(line) && !line.startsWith("Distribuição de folgas fixas:"),
  );
  const warnings = preview.warnings.filter((line) => !line.includes(": semana "));
  const coverage: ScheduleGeneratedPreview["eventCoverage"] = [];
  for (const date of preview.payload.dates.filter(event)) {
    const sunday = weekday(date) === 0;
    const quota =
      rule.dateDutyOverrides?.[date] ??
      (rule.holidayWeekdaysOnly && sunday
        ? 0
        : sunday
          ? rule.sundayDutyCount
          : rule.holidayDutyCount);
    const assigned = preview.payload.people.filter((p) => isDuty(p.assignments[date]));
    coverage.push({ date, planned: quota, assigned: assigned.length });
    if (quota === null) issues.push(date + ": quantidade de plantonistas não configurada.");
    else if (quota !== assigned.length)
      issues.push(
        date +
          ": cobertura de plantão " +
          assigned.length +
          "/" +
          quota +
          " após revisão; conferir substituições.",
      );
    if (assigned.filter((p) => supervisor(p.jobTitle)).length < (rule.minimumSupervisorDuty || 0))
      issues.push(date + ": falta cobertura de supervisor COP.");
    if (assigned.filter((p) => adesao(p.jobTitle)).length < (rule.minimumAdesaoControllerDuty || 0))
      issues.push(date + ": falta cobertura de controlador de Adesão.");
    for (const p of assigned)
      if (isExcludedFromDuty(p.name, rule))
        issues.push(date + ": pessoa excluída de plantão: " + p.name);
  }
  const names = new Set<string>(),
    logins = new Set<string>();
  preview.payload.people.forEach((p, index) => {
    const name = normalize(p.name),
      login = normalize(p.login || "");
    if (!name) issues.push("Há colaborador sem nome no rascunho.");
    else if (names.has(name)) issues.push("Nome de colaborador repetido: " + p.name);
    names.add(name);
    if (login && logins.has(login)) issues.push("Login repetido: " + login);
    if (login) logins.add(login);
    const all = { ...preview.outsideAssignments[index], ...p.assignments };
    const shiftOverride = rule.personShiftOverrides?.[normalize(p.name)];
    let lastDuty = -1000;
    const events = preview.payload.dates.filter(event);
    events.forEach((date, eventIndex) => {
      if (!isDuty(p.assignments[date])) return;
      if (eventIndex - lastDuty <= rule.minimumIntermediateDuties)
        issues.push(p.name + ": intervalo de rodízio insuficiente em " + date + ".");
      lastDuty = eventIndex;
    });
    for (const date of preview.payload.dates) {
      const code = p.assignments[date];
      if (!work(code)) continue;
      if (shiftOverride && code !== shiftOverride)
        issues.push(p.name + ": turno fixo " + shiftOverride + " divergente em " + date + ".");
      else if (weekday(date) === 6 && !event(date) && code !== rule.saturdayShift)
        issues.push(
          p.name + ": turno de sábado deve ser " + rule.saturdayShift + " em " + date + ".",
        );
    }
    for (const date of preview.payload.dates)
      if (!all[date]?.trim()) issues.push(p.name + ": dia " + date + " sem código de escala.");
    for (const week of preview.calendarWeeks) {
      if (week[0]! < preview.targetMonth + "-01" && preview.referenceSeedId) continue;
      const codes = week.map((day) => all[day] || "");
      if (codes.some((code) => !code || code === "Sem informação")) {
        warnings.push(p.name + ": semana " + week[0] + " com histórico/continuidade incompleto.");
        continue;
      }
      if (
        codes.some((code) =>
          ["vacation", "certificate", "leave", "absence"].includes(scheduleCodeKind(code)),
        )
      ) {
        warnings.push(
          p.name + ": semana " + week[0] + " contém férias/afastamento; conferir com RH.",
        );
        continue;
      }
      const rest = codes.filter((code) => scheduleCodeKind(code) === "off").length,
        worked = codes.filter(work).length;
      if (rest < 2)
        issues.push(
          p.name + ": apenas " + rest + " descanso(s) na semana " + week[0] + " a " + week[6],
        );
      if (worked > 5)
        issues.push(
          p.name + ": " + worked + " dias de trabalho na semana " + week[0] + " a " + week[6],
        );
    }
    let consecutive = 0;
    for (const day of [...new Set(preview.calendarWeeks.flat())].sort()) {
      consecutive = work(all[day]) ? consecutive + 1 : 0;
      if (consecutive > 6) {
        issues.push(p.name + ": mais de 6 dias consecutivos até " + day);
        break;
      }
    }
  });
  if (rule.fixedOffDistribution)
    issues.push(
      ...fixedRestSummary(preview.payload.people, preview.targetMonth, rule.fixedOffDistribution)
        .issues,
    );
  return {
    ...preview,
    eventCoverage: coverage,
    blockingIssues: [...new Set(issues)],
    warnings: [...new Set(warnings)],
    payload: {
      ...preview.payload,
      codes: [
        ...new Set(preview.payload.people.flatMap((p) => Object.values(p.assignments))),
      ].sort(),
    },
  };
}
export const revalidateControlPreview = revalidateSchedulePreview;
