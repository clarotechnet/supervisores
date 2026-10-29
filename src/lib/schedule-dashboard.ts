import type { SchedulePerson } from "./types";
import { scheduleCodeKind } from "./schedule-import";
import { scheduleMonthDates } from "./schedule-view";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function scheduleRoleDetails(role: string) {
  const r = normalize(role);
  const kind =
    !r || /^[\d\W]+$/.test(r)
      ? "Função não informada"
      : /^controlador[a]?\b/.test(r)
        ? "Controlador"
        : /^supervisor[a]?\s+cop\b/.test(r)
          ? "Supervisor COP"
          : /^supervisor[a]?\s+(?:de\s+)?campo\b/.test(r)
            ? "Supervisor de campo"
            : /^coordenador[a]?\b/.test(r)
              ? "Coordenador"
              : /^analista\b/.test(r)
                ? "Analista"
                : /^multiplicador[a]?\b/.test(r)
                  ? "Multiplicador"
                  : role.split("(")[0]!.trim();
  const area = /adesao|\bads\b/.test(r)
    ? "Adesão"
    : /construcao|\bconst\b|\bmdu\b/.test(r)
      ? "Construção / MDU"
      : /desc|desconexao/.test(r)
        ? "Desconexão"
        : /imperium/.test(r)
          ? "Imperium"
          : /manut|\bvt\b/.test(r)
            ? "Manutenção / VT"
            : "Outras áreas";
  const bases = [...new Set(role.toUpperCase().match(/\b(?:FTZ|FTA|NTL|RCF|MSRO|PNM)\b/g) || [])];
  return { kind, area, bases: bases.length ? bases : ["Sem base informada"] };
}
export function filterScheduleTeam(
  people: SchedulePerson[],
  query: string,
  kind = "",
  area = "",
  base = "",
) {
  const search = normalize(query);
  return people.filter((p) => {
    const details = scheduleRoleDetails(p.jobTitle);
    return (
      (!search || normalize([p.name, p.login, p.jobTitle].join(" ")).includes(search)) &&
      (!kind || details.kind === kind) &&
      (!area || details.area === area) &&
      (!base || details.bases.includes(base))
    );
  });
}
export function isMarkedScheduleDuty(code: string) {
  return /^(p|plantao)$/.test(normalize(code));
}
export function schedulePersonStats(person: SchedulePerson, month: string) {
  const dates = scheduleMonthDates(month);
  const count = (kind: string) =>
    dates.filter(
      (day) =>
        person.assignments[day]?.trim() && scheduleCodeKind(person.assignments[day]!) === kind,
    ).length;
  const dutyDates = dates.filter((day) => isMarkedScheduleDuty(person.assignments[day] || ""));
  return {
    duty: dutyDates.length,
    dutyDates,
    work: count("work"),
    off: count("off"),
    vacation: count("vacation"),
    absence: count("absence"),
    certificate: count("certificate"),
    leave: count("leave"),
  };
}
export function schedulePreviousDate(month: string) {
  const [year = 0, number = 1] = month.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, 0)).toISOString().slice(0, 10);
}
export function scheduleVisibleDates(month: string, available: string[]) {
  const previous = schedulePreviousDate(month),
    dates = scheduleMonthDates(month);
  return available.includes(previous) ? [previous, ...dates] : dates;
}
export function scheduleTeamCsv(people: SchedulePerson[], month: string) {
  const rows = [
    ["Data", "Nome", "Login", "Função", "Código"],
    ...people.flatMap((p) =>
      scheduleMonthDates(month).map((day) => [
        day,
        p.name,
        p.login || "",
        p.jobTitle,
        p.assignments[day] || "",
      ]),
    ),
  ];
  // Quote every value and neutralize formulas when the CSV is opened in a spreadsheet.
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((raw) => '"' + (/^[=+@-]/.test(raw) ? "'" + raw : raw).replace(/"/g, '""') + '"')
          .join(";"),
      )
      .join("\r\n")
  );
}
