import type { Tables } from "@/integrations/supabase/types";

export type QuarkPerson = Tables<"quark_people">;
export type QuarkDirectory = Tables<"quark_people_directory">;
export type QuarkHome = Tables<"quark_home_locations">;
export type QuarkDay = Tables<"quark_daily_records">;
export type QuarkPunch = Tables<"quark_punches">;
export type QuarkSyncRun = Tables<"quark_sync_runs">;

export interface QuarkPersonView extends QuarkPerson {
  directory: QuarkDirectory | null;
  home: QuarkHome | null;
}

export interface QuarkOccurrence {
  key: string;
  person: QuarkPersonView;
  date: string;
  type: "absence" | "incomplete" | "short-break" | "late" | "extra";
  label: string;
  detail: string;
}

export interface ClosingPeriod {
  startDate: string;
  endDate: string;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentClosingPeriod(reference = new Date()): ClosingPeriod {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 26, 12);
  if (reference.getDate() < 26) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12);
  return { startDate: dateKey(start), endDate: dateKey(end) };
}

export function formatMinutes(value: number): string {
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(Math.round(value));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function personKey(person: Pick<QuarkPerson, "unit_id" | "collaborator_id">): string {
  return `${person.unit_id}:${person.collaborator_id}`;
}

export function mergeQuarkPeople(
  people: QuarkPerson[],
  directories: QuarkDirectory[],
  homes: QuarkHome[],
): QuarkPersonView[] {
  const directoryByPerson = new Map(directories.map((row) => [personKey(row), row]));
  const homeByPerson = new Map(homes.map((row) => [personKey(row), row]));
  return people.map((person) => ({
    ...person,
    directory: directoryByPerson.get(personKey(person)) ?? null,
    home: homeByPerson.get(personKey(person)) ?? null,
  }));
}

export function resolvePersonCity(person: QuarkPersonView): string {
  return person.directory?.city || person.unit_city;
}

export function resolvePersonSector(person: QuarkPersonView): string {
  return person.directory?.sector || person.api_sector || "Sem setor";
}

function timeMinutes(value: string | null): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function buildOccurrences(
  people: QuarkPersonView[],
  days: QuarkDay[],
  punches: QuarkPunch[],
): QuarkOccurrence[] {
  const peopleByKey = new Map(people.map((person) => [personKey(person), person]));
  const punchesByDay = new Map<string, QuarkPunch[]>();
  for (const punch of punches) {
    const key = `${personKey(punch)}:${punch.work_date}`;
    const current = punchesByDay.get(key) ?? [];
    current.push(punch);
    punchesByDay.set(key, current);
  }

  const occurrences: QuarkOccurrence[] = [];
  for (const day of days) {
    const person = peopleByKey.get(personKey(day));
    if (!person) continue;
    const base = `${personKey(day)}:${day.work_date}`;
    const dayPunches = (punchesByDay.get(base) ?? []).sort((a, b) =>
      (a.punch_time ?? "").localeCompare(b.punch_time ?? ""),
    );
    if (day.absence_minutes > 0) {
      occurrences.push({
        key: `${base}:absence`,
        person,
        date: day.work_date,
        type: "absence",
        label: "Ausência",
        detail: formatMinutes(day.absence_minutes),
      });
    }
    if (day.late_minutes > 0) {
      occurrences.push({
        key: `${base}:late`,
        person,
        date: day.work_date,
        type: "late",
        label: "Atraso",
        detail: formatMinutes(day.late_minutes),
      });
    }
    const extra = day.normal_extra_minutes + day.night_extra_minutes + day.extra_100_minutes;
    if (extra > 120) {
      occurrences.push({
        key: `${base}:extra`,
        person,
        date: day.work_date,
        type: "extra",
        label: "Mais de 2h extras",
        detail: formatMinutes(extra),
      });
    }
    if (
      !day.is_day_off &&
      day.scheduled_minutes > 0 &&
      dayPunches.length > 0 &&
      dayPunches.length < 4
    ) {
      occurrences.push({
        key: `${base}:incomplete`,
        person,
        date: day.work_date,
        type: "incomplete",
        label: "Batidas incompletas",
        detail: `${dayPunches.length} registro${dayPunches.length === 1 ? "" : "s"}`,
      });
    }
    if (dayPunches.length >= 4) {
      const exit = timeMinutes(dayPunches[1]?.punch_time ?? null);
      const back = timeMinutes(dayPunches[2]?.punch_time ?? null);
      if (exit !== null && back !== null && back >= exit && back - exit < 60) {
        occurrences.push({
          key: `${base}:short-break`,
          person,
          date: day.work_date,
          type: "short-break",
          label: "Intervalo menor que 1h",
          detail: `${back - exit} min`,
        });
      }
    }
  }
  return occurrences.sort((a, b) => b.date.localeCompare(a.date));
}

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface QuarkLocationSummary {
  person: QuarkPersonView;
  punches: number;
  nearHome: number;
  outsideHome: number;
  noReference: number;
  averageDistanceMeters: number | null;
  maxDistanceMeters: number | null;
  mainLocation: string;
  mainLocationCount: number;
}

export function buildLocationSummaries(
  people: QuarkPersonView[],
  punches: QuarkPunch[],
  homeRadiusMeters = 200,
): QuarkLocationSummary[] {
  const peopleByKey = new Map(people.map((person) => [personKey(person), person]));
  const summaries = new Map<
    string,
    QuarkLocationSummary & {
      distanceSum: number;
      distanceCount: number;
      locations: Map<string, number>;
    }
  >();

  for (const punch of punches) {
    const person = peopleByKey.get(personKey(punch));
    if (!person) continue;
    const key = personKey(person);
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        person,
        punches: 0,
        nearHome: 0,
        outsideHome: 0,
        noReference: 0,
        averageDistanceMeters: null,
        maxDistanceMeters: null,
        mainLocation: "",
        mainLocationCount: 0,
        distanceSum: 0,
        distanceCount: 0,
        locations: new Map(),
      };
      summaries.set(key, summary);
    }

    summary.punches += 1;
    const location = punch.location?.trim() || "Local não informado";
    summary.locations.set(location, (summary.locations.get(location) ?? 0) + 1);

    if (!person.home || punch.latitude === null || punch.longitude === null) {
      summary.noReference += 1;
      continue;
    }

    const meters = distanceMeters(
      punch.latitude,
      punch.longitude,
      person.home.latitude,
      person.home.longitude,
    );
    summary.distanceSum += meters;
    summary.distanceCount += 1;
    summary.maxDistanceMeters =
      summary.maxDistanceMeters === null ? meters : Math.max(summary.maxDistanceMeters, meters);
    if (meters <= homeRadiusMeters) summary.nearHome += 1;
    else summary.outsideHome += 1;
  }

  return [...summaries.values()]
    .map((summary) => {
      const [mainLocation, mainLocationCount] = [...summary.locations.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
      )[0] ?? ["", 0];
      return {
        person: summary.person,
        punches: summary.punches,
        nearHome: summary.nearHome,
        outsideHome: summary.outsideHome,
        noReference: summary.noReference,
        averageDistanceMeters: summary.distanceCount
          ? Math.round(summary.distanceSum / summary.distanceCount)
          : null,
        maxDistanceMeters:
          summary.maxDistanceMeters === null ? null : Math.round(summary.maxDistanceMeters),
        mainLocation,
        mainLocationCount,
      };
    })
    .sort(
      (a, b) =>
        b.outsideHome - a.outsideHome ||
        b.nearHome - a.nearHome ||
        a.person.full_name.localeCompare(b.person.full_name, "pt-BR"),
    );
}
