/** Deterministic guardrails for an optional AI reviewer. No external services, no writes. */
import type { Payload, Person } from "./schedule-operational.ts";
export type Candidate = {
  key: string;
  name: string;
  role: string;
  currentCode: string;
  workDays: number;
  restDays: number;
  score: number;
  compensation?: { date: string; currentCode: string };
  reason?: string;
};
export type RestOption = { date: string; currentCode: string; reason: string; score: number };
export type ScheduleIssue = {
  id: string;
  date: string;
  kind: "coverage" | "role" | "weekly";
  severity: "high" | "review";
  title: string;
  detail: string;
  affected: string[];
  candidates: Candidate[];
  candidateNotes?: string[];
  restOptions?: RestOption[];
};
export type ScheduleAnalysis = { issues: ScheduleIssue[]; inspectedWeeks: number; notes: string[] };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const kind = (c: string): "off" | "work" | "protected" | "absence" | "unknown" => {
  const code = norm(c);
  if (!code || code === "SEM INFORMACAO") return "unknown";
  if (["F", "BH"].includes(code) || code.includes("FOLGA")) return "off";
  if (
    code === "AT" ||
    code.startsWith("ATEST") ||
    code === "FE" ||
    code.includes("FERIAS") ||
    code.includes("AFAST") ||
    code.includes("LICENCA") ||
    code === "L"
  )
    return "protected";
  if (code.includes("FALTA")) return "absence";
  return "work";
};
const weekdays = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
const plus = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const role = (job: string) => {
  const r = norm(job);
  if (/\bSUPERVISOR\s+COP\b/.test(r)) return "supervisor";
  if (r.includes("CONTROLADOR") && r.includes("ADESAO")) return "adesao";
  if (r.includes("CONTROLADOR")) return "controlador";
  return "outro";
};
function weeks(dates: string[]) {
  const set = new Set(dates);
  return dates
    .filter((d) => weekdays(d) === 0)
    .map((d) => Array.from({ length: 7 }, (_, i) => plus(d, i)))
    .filter((w) => w.every((d) => set.has(d)));
}
function keyOf(person: Person, index: number) {
  return "C" + String(index + 1);
}
export type AnalysisRule = {
  sundayDutyCount?: number | null;
  holidayDutyCount?: number | null;
  additionalHolidays?: string[];
  dateDutyOverrides?: Record<string, number>;
  minimumSupervisorDuty?: number;
  minimumAdesaoControllerDuty?: number;
  minimumIntermediateDuties?: number;
  transitionStart?: string;
  excludedFromDuty?: readonly string[];
  holidayWeekdaysOnly?: boolean;
  dutyCode?: string;
  analysisMonth?: string;
  allowRestCompensation?: boolean;
  fixedOffByName?: Record<string, number>;
};
const isEvent = (date: string, rule?: AnalysisRule) =>
  weekdays(date) === 0 ||
  [
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
    ...(rule?.additionalHolidays || []),
  ].includes(date.slice(5)) ||
  Object.hasOwn(rule?.dateDutyOverrides || {}, date);
function consecutiveSafe(person: Person, changes: Record<string, string>) {
  let count = 0;
  let previous = "";
  for (const day of Object.keys(person.assignments).sort()) {
    if (previous && day !== plus(previous, 1)) count = 0;
    count = kind(changes[day] ?? person.assignments[day] ?? "") === "work" ? count + 1 : 0;
    if (count > 6) return false;
    previous = day;
  }
  return true;
}
function candidates(
  date: string,
  everyone: Person[],
  affected: Person[],
  rule?: AnalysisRule,
  requiredRole = "",
): Pick<ScheduleIssue, "candidates" | "candidateNotes"> {
  const sunday = plus(date, -weekdays(date));
  const week = Array.from({ length: 7 }, (_, i) => plus(sunday, i));
  const absRole = requiredRole || (affected.length === 1 ? role(affected[0]!.jobTitle) : "");
  const rejected = new Map<string, number>();
  const reject = (reason: string): Candidate[] => {
    rejected.set(reason, (rejected.get(reason) || 0) + 1);
    return [];
  };
  const result = everyone
    .flatMap((person, index): Candidate[] => {
      const r = role(person.jobTitle);
      if (absRole && absRole !== "outro" && r !== absRole) return [];
      const code = person.assignments[date] || "";
      if (!["F", "FOLGA"].includes(norm(code)) || affected.includes(person)) return [];
      if (rule?.excludedFromDuty?.some((name) => norm(name) === norm(person.name)))
        return reject("Excluído(s) do rodízio");
      if (
        week.some(
          (d) =>
            !Object.hasOwn(person.assignments, d) ||
            kind(person.assignments[d] || "") === "unknown",
        )
      )
        return reject("Semana com dados incompletos");
      if (week.some((d) => ["protected", "absence"].includes(kind(person.assignments[d] || ""))))
        return reject("Semana com afastamento ou ausência a revisar");
      const fixed = rule?.fixedOffByName?.[norm(person.name)];
      const sameWeekday = Object.keys(person.assignments).filter(
        (d) => d !== date && weekdays(d) === weekdays(date),
      );
      // Domingo é a folga habitual do rodízio; não é a folga fixa de segunda a sábado.
      const likelyFixed =
        weekdays(date) !== 0 &&
        sameWeekday.length >= 3 &&
        sameWeekday.filter((d) => kind(person.assignments[d] || "") === "off").length /
          sameWeekday.length >=
          0.75;
      if (weekdays(date) === fixed || (fixed === undefined && likelyFixed))
        return reject("Folga fixa nessa data");
      const events = Object.keys(person.assignments)
        .filter((d) => isEvent(d, rule))
        .sort();
      const eventIndex = events.indexOf(date);
      const minimum = rule?.minimumIntermediateDuties || 0;
      if (
        minimum > 0 &&
        events.some(
          (d, i) =>
            d !== date &&
            (rule?.dutyCode === "PLANTÃO"
              ? norm(person.assignments[d] || "") === "PLANTAO"
              : kind(person.assignments[d] || "") === "work") &&
            Math.abs(i - eventIndex) <= minimum,
        )
      )
        return reject("Intervalo de rodízio insuficiente");
      const rest = week.filter((d) => kind(person.assignments[d] || "") === "off").length;
      const worked = week.filter((d) => kind(person.assignments[d] || "") === "work").length;
      let compensation: Candidate["compensation"];
      if (rest < 3 || worked >= 5) {
        if (!rule?.allowRestCompensation || rest < 2 || worked > 5)
          return reject("Sem margem de descanso para o plantão");
        const options = week
          .filter(
            (d) =>
              d !== date &&
              (!rule.analysisMonth || d.startsWith(rule.analysisMonth + "-")) &&
              !isEvent(d, rule) &&
              /^(?:M\.|T\.)\s*[1-4]$/.test((person.assignments[d] || "").trim()) &&
              everyone.some(
                (p) =>
                  p !== person &&
                  kind(p.assignments[d] || "") === "work" &&
                  (!["supervisor", "adesao"].includes(r) || role(p.jobTitle) === r),
              ) &&
              consecutiveSafe(person, { [date]: "PLANTÃO", [d]: "Folga" }),
          )
          .sort((a, b) => Number(a < date) - Number(b < date) || a.localeCompare(b));
        if (!options.length) return reject("Sem compensação viável na mesma semana e competência");
        compensation = { date: options[0]!, currentCode: person.assignments[options[0]!]! };
      }
      const changes = {
        [date]: "PLANTÃO",
        ...(compensation ? { [compensation.date]: "Folga" } : {}),
      };
      if (!consecutiveSafe(person, changes))
        return reject("Sequência de trabalho acima de seis dias");
      const finalRest = rest - 1 + (compensation ? 1 : 0);
      const finalWork = worked + 1 - (compensation ? 1 : 0);
      if (finalRest < 2 || finalWork > 5) return reject("Descanso semanal insuficiente");
      return [
        {
          key: keyOf(person, index),
          name: person.name,
          role: person.jobTitle,
          currentCode: code,
          restDays: rest,
          workDays: worked,
          score: (r === absRole ? 4 : 0) + Math.min(rest, 4) * 2 - worked - (compensation ? 2 : 0),
          ...(compensation ? { compensation } : {}),
          reason: compensation
            ? "Com folga compensatória em " +
              compensation.date.slice(8, 10) +
              "/" +
              compensation.date.slice(5, 7) +
              ", mantém " +
              finalRest +
              " folgas e " +
              finalWork +
              " dias de trabalho na semana."
            : "Após o plantão, mantém " +
              finalRest +
              " folgas e " +
              finalWork +
              " dias de trabalho na semana.",
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5);
  return {
    candidates: result,
    candidateNotes: result.length
      ? []
      : [...rejected].map(([reason, count]) => reason + ": " + count + "."),
  };
}
export function analyzeSchedule(
  planned: Payload,
  current: Payload,
  rule?: AnalysisRule,
): ScheduleAnalysis {
  const dates = [...new Set(current.dates)].sort();
  const valid =
    dates.length >= 7 && dates.length <= 45 && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!valid || current.people.length > 500 || current.people.length === 0)
    throw Error("Formato da escala inválido para análise.");
  const fullWeeks = weeks(dates);
  const issues: ScheduleIssue[] = [];
  const notes: string[] = [];
  const plannedMap = new Map(planned.people.map((p) => [norm(p.name), p]));
  const holiday = new Set([
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
    ...(rule?.additionalHolidays || []),
  ]);
  dates.forEach((date) => {
    if (rule?.analysisMonth && !date.startsWith(rule.analysisMonth + "-")) return;
    const isHoliday = holiday.has(date.slice(5));
    const event = isHoliday || weekdays(date) === 0 || date in (rule?.dateDutyOverrides || {});
    const onDuty = (code: string) =>
      kind(code) === "work" &&
      (rule?.dutyCode === "PLANTÃO" ? norm(code) === "PLANTAO" : event || norm(code) === "PLANTAO");
    const missing = current.people.filter((p) => {
      const old = plannedMap.get(norm(p.name));
      return (
        old &&
        kind(old.assignments[date] || "") === "work" &&
        ["protected", "absence", "off"].includes(kind(p.assignments[date] || ""))
      );
    });
    const plannedOnDuty = planned.people.filter((p) => onDuty(p.assignments[date] || ""));
    const currentOnDuty = current.people.filter((p) => onDuty(p.assignments[date] || ""));
    const plannedCount = plannedOnDuty.length;
    const requestedQuota =
      rule?.dateDutyOverrides?.[date] ??
      (weekdays(date) === 0
        ? rule?.holidayWeekdaysOnly
          ? 0
          : rule?.sundayDutyCount
        : isHoliday
          ? rule?.holidayDutyCount
          : null);
    const need = event ? Math.max(plannedCount, requestedQuota ?? 0) : 0;
    const shortage = event ? Math.max(0, need - currentOnDuty.length) : missing.length;
    if (shortage > 0 && missing.length > 0) {
      issues.push({
        id: "coverage:" + date,
        date,
        kind: "coverage",
        severity: "high",
        title: event ? "Plantão com cobertura reduzida" : "Ausência em dia de trabalho",
        detail: event
          ? "Previstos " +
            need +
            " profissionais; atualmente " +
            currentOnDuty.length +
            ". Verifique compensação e reposição."
          : missing.length + " ausência(s)/alteração(ões) em dias originalmente trabalhados.",
        affected: missing.map((p) => p.name),
        ...candidates(date, current.people, missing, rule),
      });
    } else if (event && currentOnDuty.length < need) {
      issues.push({
        id: "coverage:" + date,
        date,
        kind: "coverage",
        severity: "high",
        title: "Plantão abaixo do planejamento",
        detail: "Mínimo de referência: " + need + "; atual: " + currentOnDuty.length + ".",
        affected: [],
        ...candidates(date, current.people, [], rule),
      });
    }
    if (event && need > 0) {
      const needs = [
        { min: rule?.minimumSupervisorDuty || 0, role: "supervisor", label: "supervisor COP" },
        {
          min: rule?.minimumAdesaoControllerDuty || 0,
          role: "adesao",
          label: "controlador de Adesão",
        },
      ];
      for (const r of needs) {
        if (!r.min) continue;
        const actual = currentOnDuty.filter((p) => role(p.jobTitle) === r.role).length;
        if (actual < r.min) {
          issues.push({
            id: "role:" + date + ":" + r.role,
            date,
            kind: "role",
            severity: "high",
            title: "Cobertura de função insuficiente",
            detail: "Plantão exige " + r.min + " " + r.label + "(es), porém há " + actual + ".",
            affected: [],
            ...candidates(
              date,
              current.people,
              plannedOnDuty.filter((p) => role(p.jobTitle) === r.role),
              rule,
              r.role,
            ),
          });
        }
      }
    }
  });
  for (const week of fullWeeks) {
    // 30/11/2026 still belongs to the 6x1 month; don't call it a 5x2 violation.
    if (rule?.transitionStart && week[0]! < rule.transitionStart) continue;
    for (const person of current.people) {
      if (week.some((d) => kind(person.assignments[d] || "") === "unknown")) {
        notes.push(
          person.name + ": semana " + week[0] + " com histórico ou continuidade incompleto.",
        );
        continue;
      }
      // Férias, atestados e ausências não contam como Folga, tampouco
      // geram falso bloqueio de 5x2. A cobertura é tratada separadamente.
      if (week.some((d) => ["protected", "absence"].includes(kind(person.assignments[d] || ""))))
        continue;
      const off = week.filter((d) => kind(person.assignments[d] || "") === "off").length;
      const worked = week.filter((d) => kind(person.assignments[d] || "") === "work").length;
      if (off < 2 || worked > 5) {
        issues.push({
          id: "weekly:" + week[0] + ":" + keyOf(person, current.people.indexOf(person)),
          date: week[0]!,
          kind: "weekly",
          severity: "review",
          title: "Semana 5x2 precisa de revisão",
          detail:
            person.name +
            ": " +
            worked +
            " dia(s) trabalhados, " +
            off +
            " folga(s) de " +
            week[0] +
            " a " +
            week[6] +
            ". Atestado/ausência não é folga e exige avaliação separada.",
          affected: [person.name],
          candidates: [],
          restOptions: week
            .flatMap((day) => {
              const code = person.assignments[day] || "";
              // Rest options are workdays that can be converted to the SECOND rest.
              // Never propose removing mandatory duty, AT, leave, absence, or the
              // already chosen first rest day.
              if (kind(code) !== "work" || norm(code) === "PLANTAO") return [];
              if (weekdays(day) === 0 || holiday.has(day.slice(5))) return [];
              const peopleAtWork = current.people.filter(
                (p) => kind(p.assignments[day] || "") === "work",
              ).length;
              if (peopleAtWork <= 1) return [];
              const score = weekdays(day) === 6 ? 2 : weekdays(day) === 1 ? 3 : 5;
              return [
                {
                  date: day,
                  currentCode: code,
                  reason: "Possível segunda folga; validar cobertura e dia fixo com a gestão.",
                  score,
                },
              ];
            })
            .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
            .slice(0, 5),
        });
      }
    }
  }
  if (fullWeeks.length === 0)
    notes.push("Sem semanas completas domingo–sábado: análise 5x2 parcial.");
  if (issues.length === 0)
    notes.push("Nenhuma divergência básica encontrada; horas e CCT ainda exigem revisão.");
  if (issues.length > 100) notes.push("Exibidas somente as primeiras 100 pendências.");
  notes.push(
    "Candidatos são apenas possibilidades matemáticas; validar função, folga fixa, jornada, CCT e cobertura antes de remanejar.",
  );
  return { issues: issues.slice(0, 100), inspectedWeeks: fullWeeks.length, notes };
}
