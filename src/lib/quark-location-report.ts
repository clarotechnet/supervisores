import {
  buildLocationSummaries,
  distanceMeters,
  personKey,
  resolvePersonCity,
  resolvePersonSector,
  type QuarkPersonView,
  type QuarkPunch,
} from "./quark";

export interface QuarkNearPunch {
  person: QuarkPersonView;
  punch: QuarkPunch;
  distanceMeters: number;
}

export interface QuarkNearHomeRank {
  person: QuarkPersonView;
  nearPunches: number;
  nearDays: number;
  validPunches: number;
  nearRate: number;
  lastNearDate: string;
  nearestDistanceMeters: number;
}

export interface QuarkNearHomeReport {
  ranking: QuarkNearHomeRank[];
  details: QuarkNearPunch[];
}

/** Uses the same Haversine calculation and inclusive radius as Localizações. */
export function buildQuarkNearHomeReport(
  people: QuarkPersonView[],
  punches: QuarkPunch[],
  radiusMeters: number,
): QuarkNearHomeReport {
  const summaries = buildLocationSummaries(people, punches, radiusMeters);
  const peopleByKey = new Map(people.map((person) => [personKey(person), person]));
  const details: QuarkNearPunch[] = [];
  const daysByPerson = new Map<string, Set<string>>();
  const lastDateByPerson = new Map<string, string>();
  const nearestByPerson = new Map<string, number>();

  for (const punch of punches) {
    const person = peopleByKey.get(personKey(punch));
    if (!person?.home || punch.latitude === null || punch.longitude === null) continue;
    const meters = distanceMeters(
      punch.latitude,
      punch.longitude,
      person.home.latitude,
      person.home.longitude,
    );
    if (!Number.isFinite(meters) || meters > radiusMeters) continue;
    const key = personKey(person);
    details.push({ person, punch, distanceMeters: meters });
    const dates = daysByPerson.get(key) ?? new Set<string>();
    dates.add(punch.work_date);
    daysByPerson.set(key, dates);
    const previous = lastDateByPerson.get(key);
    if (!previous || punch.work_date > previous) lastDateByPerson.set(key, punch.work_date);
    nearestByPerson.set(key, Math.min(nearestByPerson.get(key) ?? Infinity, meters));
  }

  details.sort(
    (a, b) =>
      b.punch.work_date.localeCompare(a.punch.work_date) ||
      (b.punch.punch_time ?? "").localeCompare(a.punch.punch_time ?? "") ||
      a.person.full_name.localeCompare(b.person.full_name, "pt-BR"),
  );

  const ranking: QuarkNearHomeRank[] = summaries
    .filter((item) => item.nearHome > 0)
    .map((item) => {
      const key = personKey(item.person);
      const validPunches = item.nearHome + item.outsideHome;
      return {
        person: item.person,
        nearPunches: item.nearHome,
        nearDays: daysByPerson.get(key)?.size ?? 0,
        validPunches,
        nearRate: validPunches ? (item.nearHome / validPunches) * 100 : 0,
        lastNearDate: lastDateByPerson.get(key) ?? "",
        nearestDistanceMeters: nearestByPerson.get(key) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.nearPunches - a.nearPunches ||
        b.nearDays - a.nearDays ||
        b.nearRate - a.nearRate ||
        a.person.full_name.localeCompare(b.person.full_name, "pt-BR"),
    );
  return { ranking, details };
}

/**
 * Number visible punches within each calendar day, starting again from 1
 * when the date changes. The map and its table share this function.
 */
export function numberedQuarkPunchesByDay(punches: QuarkPunch[]): Map<string, number> {
  const result = new Map<string, number>();
  const perDay = new Map<string, number>();
  const sorted = [...punches].sort(
    (a, b) =>
      a.work_date.localeCompare(b.work_date) ||
      (a.punch_time ?? "").localeCompare(b.punch_time ?? "") ||
      a.point_id.localeCompare(b.point_id),
  );
  for (const punch of sorted) {
    const dateKey = `${punch.unit_id}:${punch.collaborator_id}:${punch.work_date}`;
    const number = (perDay.get(dateKey) ?? 0) + 1;
    perDay.set(dateKey, number);
    result.set(punch.point_id, number);
  }
  return result;
}
