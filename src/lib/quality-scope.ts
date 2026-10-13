import { norm, presentationCityLabel } from "./quality-math";
import { normalizeLogin, type QualityLogin } from "./quality-directory";

// The supplied workbook uses the base DMV unit for Adesão. ADM, VT, MDU
// and unknown suffixes are separate businesses, never an implicit QQ default.
export function isQQAdhesionUnit(unit: string): boolean {
  return /^[A-Z]{3}-DMV(?:_\d+)?$/.test(norm(unit));
}
export function qqUnitPass(unit: string, selected: readonly string[]): boolean {
  return selected.length ? selected.includes(unit) : isQQAdhesionUnit(unit);
}
export function qualityCity(login: string, city: string, index: Map<string, QualityLogin>): string {
  return presentationCityLabel(index.get(normalizeLogin(login))?.city || city);
}

export type QualityMode = "qq" | "general" | "tc" | "logins";
export interface QualityFilters {
  units: string[];
  cities: string[];
  sectors: string[];
  supervisors: string[];
  months: string[];
  clusters: string[];
  weeks: string[];
  ufs: string[];
  subclusters: string[];
  groups: string[];
  jobs: string[];
  search: string;
  start: string;
  end: string;
}
export const emptyQualityFilters = (): QualityFilters => ({
  units: [],
  cities: [],
  sectors: [],
  supervisors: [],
  months: [],
  clusters: [],
  weeks: [],
  ufs: [],
  subclusters: [],
  groups: [],
  jobs: [],
  search: "",
  start: "",
  end: "",
});
export function qualityPeriodPass(month: string, day: string, filters: QualityFilters): boolean {
  return (
    (!filters.months.length || filters.months.includes(month)) &&
    (!filters.start || day >= filters.start) &&
    (!filters.end || day <= filters.end)
  );
}
