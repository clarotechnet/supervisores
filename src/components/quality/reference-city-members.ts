import { norm, presentationCityLabel } from "../../lib/quality-math";

/** Return the actual stored city values belonging to the displayed city group. */
export function referenceCityMembers(label: string, available: readonly string[]): string[] {
  const group = norm(presentationCityLabel(label)).replace(/\s+/g, " ");
  if (!group) return [];
  return [...new Set(available)].filter(
    (city) => norm(presentationCityLabel(city)).replace(/\s+/g, " ") === group,
  );
}
