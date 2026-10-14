import { nameKey, normalizeLogin, type QualityLogin } from "./quality-directory";
import type { QualityState } from "./quality";

export function isTechnicalVisitSector(sector: unknown): boolean {
  return nameKey(sector) === "VISITA TECNICA";
}

/** View-only selection. Imports/cache retain the complete, original dataset. */
export function technicalVisitState(
  state: QualityState,
  index: Map<string, QualityLogin>,
): QualityState {
  const dataset = state.datasets.technical_visit;
  if (!dataset) return state;
  return {
    ...state,
    datasets: {
      ...state.datasets,
      technical_visit: {
        ...dataset,
        records: dataset.records.filter((record) =>
          isTechnicalVisitSector(index.get(normalizeLogin(record["login"]))?.sector),
        ),
      },
    },
  };
}

/** Standard TC excludes registered VT; unknown/empty sectors remain reviewable. */
export function nonTechnicalVisitState(
  state: QualityState,
  index: Map<string, QualityLogin>,
): QualityState {
  const dataset = state.datasets.certification;
  if (!dataset) return state;
  return {
    ...state,
    datasets: {
      ...state.datasets,
      certification: {
        ...dataset,
        records: dataset.records.filter(
          (record) => !isTechnicalVisitSector(index.get(normalizeLogin(record["login"]))?.sector),
        ),
      },
    },
  };
}
