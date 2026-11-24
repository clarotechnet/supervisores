import { scheduleCodeKind } from "./schedule-import";
import { scheduleMonthDates } from "./schedule-view";
import type { ScheduleUpload } from "./types";

export const TOA_HEADERS = [
  "Nº",
  "Cidade",
  "Estado",
  "LOGIN",
  "Nome",
  "Nome do Bucket",
  "ÁREAPADRÃO",
  "CEP",
  "ESCALA",
] as const;

export const TOA_PERSON_SHIFT = "ESCALA PADRÃO DO TÉCNICO";
const ADESAO_DESCONEXAO_SHIFT = "0800-1720 ALMOÇO 13-14";

export interface ToaProfile {
  name: string;
  login: string;
  city: string;
  state: string;
  bucket: string;
  area: string;
  cep: string;
  shift: string;
}

export interface ToaShiftRule {
  code: string;
  shift: string;
  area?: string;
}

export interface ToaCatalog {
  profiles: ToaProfile[];
  rules?: { city: string; sector: string; values: ToaShiftRule[] };
}

export interface ToaCompiledPerson extends ToaProfile {
  marks: string[];
  matched: boolean;
}

const CITIES: Record<string, { label: string; state: string; municipalities: string[] }> = {
  NATAL: { label: "NATAL", state: "RN", municipalities: ["NATAL", "PARNAMIRIM"] },
  MOSSORO: { label: "MOSSORÓ", state: "RN", municipalities: ["MOSSORO"] },
  FORTALEZA: { label: "FORTALEZA", state: "CE", municipalities: ["FORTALEZA"] },
  RECIFE: { label: "RECIFE", state: "PE", municipalities: ["RECIFE"] },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ");
}

function headerKey(value: unknown) {
  return normalized(value).replace(/[^A-Z0-9]/g, "");
}

export function scheduleToaDefaultShift(sector: string) {
  return ["ADESAO", "ADESAOSERVICO", "DESCONEXAO"].includes(headerKey(sector))
    ? ADESAO_DESCONEXAO_SHIFT
    : "";
}

const PROFILE_HEADERS: Record<keyof ToaProfile, string[]> = {
  name: ["NOME", "TECNICO", "COLABORADOR"],
  login: ["LOGIN"],
  city: ["CIDADE", "MUNICIPIO"],
  state: ["ESTADO", "UF"],
  bucket: ["NOMEDOBUCKET", "BUCKET"],
  area: ["AREAPADRAO", "AREA"],
  cep: ["CEP"],
  shift: ["ESCALA", "ESCALAPADRAO", "TURNOPADRAO"],
};

/** Reads only cadastro fields; the supplied days, phones and skills are never reused. */
export function parseToaProfiles(matrix: unknown[][]): ToaProfile[] {
  const header = matrix.slice(0, 20).findIndex((row) => {
    const keys = row.map(headerKey);
    return keys.includes("LOGIN") && PROFILE_HEADERS.name.some((name) => keys.includes(name));
  });
  if (header < 0) return [];
  const keys = matrix[header]!.map(headerKey);
  const columns = (Object.entries(PROFILE_HEADERS) as [keyof ToaProfile, string[]][]).map(
    ([field, labels]) => [field, keys.findIndex((key) => labels.includes(key))] as const,
  );
  return matrix.slice(header + 1).flatMap((row) => {
    const profile = Object.fromEntries(
      columns.map(([field, column]) => [field, text(row[column])]),
    ) as unknown as ToaProfile;
    profile.login = normalized(profile.login);
    return profile.name && profile.login ? [profile] : [];
  });
}

function uniqueProfiles(profiles: ToaProfile[], key: (row: ToaProfile) => string) {
  const map = new Map<string, ToaProfile | null>();
  for (const profile of profiles) {
    const id = key(profile);
    const first = map.get(id);
    if (!map.has(id)) map.set(id, profile);
    else if (first && JSON.stringify(first) !== JSON.stringify(profile)) map.set(id, null);
  }
  return map;
}

function isShift(value: string) {
  return /\bT?\s*(?:[01]?\d|2[0-3]):?[0-5]\d\s*(?:[-–—]|às|a)\s*(?:[01]?\d|2[0-3]):?[0-5]\d\b/i.test(
    value,
  );
}

function defaultToaRule(city: string, sector: string, code: string): ToaShiftRule | undefined {
  const kind = scheduleCodeKind(code);
  const status = {
    off: normalized(code) === "BH" ? "BH" : "FOLGA",
    vacation: "FÉRIAS",
    leave: "LICENÇA",
    absence: "FALTA",
    certificate: "ATESTADO",
    work: "",
  }[kind];
  if (status) return { code, shift: status };
  if (isShift(code)) return { code, shift: code };
  const mark = headerKey(code);
  if (city === "NATAL" && sector === "VT") {
    const shift = new Map([
      ["M1", "07:40-16:00 ALMOÇO 12-13"],
      ["T1", "08:12-18:00 ALMOÇO 13-14"],
      ["T2", "10:00-19:48 ALMOÇO 13-14"],
    ]).get(mark);
    if (shift) return { code, shift };
  }
  if (city === "NATAL" && ["ADESAOSERVICO", "INSTALACAO", "ADESAO"].includes(sector)) {
    if (mark === "T2") return { code, shift: "08:00-12:00" };
    if (mark === "T5")
      return {
        code,
        shift: TOA_PERSON_SHIFT,
        area: "NTL-AREA01_NTL-AREA02_NTL-AREA03_PWM-AREA01_DMV",
      };
  }
  if (
    mark === "M1" ||
    mark === "T1" ||
    (city === "NATAL" && sector === "DESCONEXAO" && mark === "M2")
  ) {
    return { code, shift: TOA_PERSON_SHIFT };
  }
  return undefined;
}

function datesForToa(schedule: ScheduleUpload) {
  const dates = scheduleMonthDates(schedule.schedule_month);
  const last = dates.at(-1);
  if (!last) return dates;
  const next = new Date(Date.parse(`${last}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (
    schedule.payload.dates.includes(next) ||
    schedule.payload.people.some((person) => text(person.assignments[next]))
  ) {
    dates.push(next);
  }
  return dates;
}

export function buildScheduleToa(
  schedule: ScheduleUpload,
  catalog?: ToaCatalog,
  defaultShift = scheduleToaDefaultShift(schedule.sector),
  defaultBucket = "",
) {
  const dates = datesForToa(schedule);
  const bucketFallback = text(defaultBucket);
  const defaultCity = normalized(schedule.city);
  const front = headerKey(schedule.sector);
  const frontShift = scheduleToaDefaultShift(schedule.sector);
  const city = CITIES[defaultCity];
  const custom = catalog?.rules;
  const catalogMatchesScope =
    !custom || (normalized(custom.city) === defaultCity && headerKey(custom.sector) === front);
  const profiles = (catalogMatchesScope ? (catalog?.profiles ?? []) : []).filter(
    (row) => !row.city || (city?.municipalities ?? [defaultCity]).includes(normalized(row.city)),
  );
  const byLogin = uniqueProfiles(profiles, (p) => normalized(p.login));
  const byName = uniqueProfiles(profiles, (p) => normalized(p.name));
  const assignedLogins = new Set(schedule.payload.people.map((person) => normalized(person.login)));
  const rosterNames = new Map<string, number>();
  for (const person of schedule.payload.people) {
    const name = normalized(person.name);
    rosterNames.set(name, (rosterNames.get(name) ?? 0) + 1);
  }
  const people: ToaCompiledPerson[] = schedule.payload.people.map((person) => {
    const login = normalized(person.login);
    const name = normalized(person.name);
    const suggested = login
      ? byLogin.get(login)
      : rosterNames.get(name) === 1
        ? byName.get(name)
        : null;
    const profile = suggested && (login || !assignedLogins.has(suggested.login)) ? suggested : null;
    const marks = dates.map((date) => text(person.assignments[date]));
    const outputLogin = login || profile?.login || "";
    const shift = profile?.shift || text(defaultShift);
    assignedLogins.add(outputLogin);
    return {
      name: person.name,
      login: outputLogin,
      city: profile?.city ? text(profile.city).toUpperCase() : (city?.label ?? defaultCity),
      state: city?.state ?? normalized(profile?.state),
      bucket: text(profile?.bucket) || bucketFallback,
      area: profile?.area ?? "",
      cep: profile?.cep ?? "",
      shift:
        frontShift && normalized(shift).replace(/:/g, "") === normalized(frontShift)
          ? frontShift
          : shift,
      marks,
      matched: !!profile,
    };
  });

  const customRules =
    custom && catalogMatchesScope
      ? new Map(custom.values.map((rule) => [normalized(rule.code), rule]))
      : new Map<string, ToaShiftRule>();
  const inputCodes = [...new Set(people.flatMap((person) => person.marks).filter(Boolean))];
  const rules = inputCodes.map((code) => {
    const customRule = customRules.get(normalized(code));
    return customRule?.shift
      ? { ...customRule, code }
      : (defaultToaRule(defaultCity, front, code) ?? { code, shift: "" });
  });
  const rulesByCode = new Map(rules.map((rule) => [rule.code, rule]));
  const missingShifts = rules.filter((rule) => !rule.shift).map((rule) => rule.code);
  const missingProfiles = people.filter(
    (person) =>
      !person.login ||
      !person.state ||
      !person.bucket ||
      !person.area ||
      !person.cep ||
      (!person.shift &&
        person.marks.some((code) => rulesByCode.get(code)?.shift === TOA_PERSON_SHIFT)),
  ).length;
  const loginCount = new Set(people.filter((p) => p.login).map((p) => p.login)).size;
  const duplicateLogins = people.filter((p) => p.login).length - loginCount;
  return {
    dates,
    people,
    rules,
    missingShifts,
    missingProfiles,
    duplicateLogins,
    catalogMatchesScope,
    matchedProfiles: people.filter((person) => person.matched).length,
    needsReview: !!(missingProfiles || missingShifts.length || duplicateLogins),
  };
}

export type ScheduleToaPlan = ReturnType<typeof buildScheduleToa>;
