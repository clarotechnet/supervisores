/** Shared pure logic for editable operational sheets. */
export type Person = {
  name: string;
  login?: string;
  jobTitle: string;
  assignments: Record<string, string>;
};
export type Payload = { dates: string[]; codes: string[]; people: Person[] };
export type OperationalChange = {
  employee_key: string;
  employee_name: string;
  duty_date: string;
  planned_code: string;
  previous_code: string;
  current_code: string;
};
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
// The November 6x1 import may contain the SAME legacy "login" for all
// employees (e.g. 47). A name is unique and immutable within a given sheet.
export const employeeKey = (p: Pick<Person, "name" | "login">) => "NOME:" + normal(p.name);
export function operationalFromDraft(
  payload: Payload,
  calendarWeeks: string[][] = [],
  outsideAssignments: Record<string, string>[] = [],
): Payload {
  const baseDates = [
    ...new Set(calendarWeeks.length ? calendarWeeks.flat() : payload.dates),
  ].sort();
  const last = baseDates.at(-1) || "";
  // Mantém dias extras explicitamente preenchidos na referência (ex.: 04/01),
  // além da semana fechada em 03/01. Nunca inventa dias futuros.
  const maxExtra = last
    ? new Date(Date.parse(last + "T12:00:00Z") + 7 * 86400000).toISOString().slice(0, 10)
    : "";
  const extraDates = outsideAssignments.flatMap((person) =>
    Object.keys(person).filter((day) => day > last && day <= maxExtra),
  );
  const dates = [...new Set([...baseDates, ...extraDates])].sort();
  if (dates.length < 7 || dates.length > 42 || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
    throw Error("Calendário semanal inválido.");
  if (!payload.people.length || payload.people.length > 500)
    throw Error("Quantidade de pessoas inválida.");
  const keys = new Set<string>();
  const loginCounts = new Map<string, number>();
  for (const p of payload.people) {
    const login = normal(p.login || "");
    if (login) loginCounts.set(login, (loginCounts.get(login) || 0) + 1);
  }
  const people = payload.people.map((p, i) => {
    const key = employeeKey(p);
    if (!p.name.trim() || keys.has(key)) throw Error("Identificação duplicada ou ausente.");
    keys.add(key);
    const login = normal(p.login || "");
    return {
      ...p,
      // Never publish a duplicate legacy ID as if it identified a person.
      login: login && loginCounts.get(login) === 1 ? p.login || "" : "",
      assignments: Object.fromEntries(
        dates.map((d) => [d, String(p.assignments[d] ?? outsideAssignments[i]?.[d] ?? "")]),
      ),
    };
  });
  return {
    dates,
    people,
    codes: [...new Set(people.flatMap((p) => Object.values(p.assignments)))].sort(),
  };
}
const weekdayAbbr = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
export function displayDateHeader(date: string): string {
  return (
    date.slice(8, 10) +
    "/" +
    date.slice(5, 7) +
    " " +
    weekdayAbbr[new Date(date + "T12:00:00Z").getUTCDay()]
  );
}
export function operationalFormattedValues(p: Payload): string[][] {
  const values = operationalValues(p);
  values[0] = values[0]!.map((cell, i) => (i < 3 ? cell : displayDateHeader(p.dates[i - 3]!)));
  return values;
}
export function operationalValues(p: Payload): string[][] {
  return [
    ["COLABORADOR", "LOGIN", "FUNÇÃO", ...p.dates],
    ...p.people.map((person) => [
      person.name,
      person.login || "",
      person.jobTitle,
      ...p.dates.map((date) => person.assignments[date] ?? ""),
    ]),
  ];
}
export function parseUpdatedSheet(
  rows: unknown[][],
  planned: Payload,
  previous: Payload,
  functionAliases = false,
): { payload: Payload; changes: OperationalChange[] } {
  if (rows.length !== planned.people.length + 1)
    throw Error("Linhas de colaboradores alteradas no Sheets.");
  const expected = operationalValues(planned)[0]!,
    header = rows[0] || [];
  if (
    header.length !== expected.length ||
    expected.some(
      (x, i) =>
        header[i] !== x && (i < 3 || header[i] !== displayDateHeader(planned.dates[i - 3]!)),
    )
  )
    throw Error("Cabeçalho ou datas alterados no Sheets.");
  const changes: OperationalChange[] = [];
  const people = planned.people.map((p, i) => {
    const row = rows[i + 1] || [];
    const actualFunction = typeof row[2] === "string" ? row[2].trim() : "";
    const compatibleFunction =
      functionAliases &&
      typeof row[2] === "string" &&
      normal(actualFunction)
        .replace(/\s+/g, " ")
        .replace(/\bFTA\b/g, "FTZ") ===
        normal(p.jobTitle)
          .replace(/\s+/g, " ")
          .replace(/\bFTA\b/g, "FTZ");
    if (
      row[0] !== p.name ||
      (row[1] || "") !== (p.login || "") ||
      ((row[2] || "") !== p.jobTitle && !compatibleFunction)
    )
      throw Error("Identificação alterada: " + p.name + ". Edite só os dias.");
    const previousPerson = previous.people.find((x) => employeeKey(x) === employeeKey(p));
    if (!previousPerson) throw Error("Colaborador não encontrado: " + p.name);
    const assignments: Record<string, string> = {};
    planned.dates.forEach((date, j) => {
      const raw = row[j + 3];
      if (raw != null && typeof raw !== "string")
        throw Error("Use texto, não fórmulas: " + p.name + " / " + date);
      const value = typeof raw === "string" ? raw.trim() : "";
      if (value.length > 80 || /[<>]/.test(value))
        throw Error("Código inválido: " + p.name + " / " + date);
      assignments[date] = value;
      const prior = previousPerson.assignments[date] ?? "";
      if (prior !== value)
        changes.push({
          employee_key: employeeKey(p),
          employee_name: p.name,
          duty_date: date,
          planned_code: p.assignments[date] ?? "",
          previous_code: prior,
          current_code: value,
        });
    });
    return { ...p, jobTitle: functionAliases ? actualFunction : p.jobTitle, assignments };
  });
  return {
    payload: {
      dates: [...planned.dates],
      people,
      codes: [...new Set(people.flatMap((p) => Object.values(p.assignments)))].sort(),
    },
    changes,
  };
}
