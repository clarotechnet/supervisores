import { nameKey, normalizeLogin, type QualityLogin } from "./quality-directory";
import type { QualityState } from "./quality";

export function isTechnicalVisitSector(sector: unknown): boolean {
  return nameKey(sector) === "VISITA TECNICA";
}

function technicalVisitServiceKey(service: unknown): string {
  return nameKey(service)
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s*-\s*/g, " - ");
}

const EXCLUDED_TECHNICAL_VISIT_SERVICES = new Set(
  [
    "MUDANCA DE ENDERECO",
    "INSTALACAO",
    "MUDANCA DE PACOTE",
    "INST GPON - INST CABO",
    "TROCA DE EQUIPAMENTO STREAMING",
    "Adequacao MDU GPON",
  ].map(technicalVisitServiceKey),
);

/** Exact TIPO_SERVICO exclusions, independent of the login's registered VT sector. */
export function isExcludedTechnicalVisitService(service: unknown): boolean {
  return EXCLUDED_TECHNICAL_VISIT_SERVICES.has(technicalVisitServiceKey(service));
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
        records: dataset.records.filter(
          (record) =>
            isTechnicalVisitSector(index.get(normalizeLogin(record["login"]))?.sector) &&
            !isExcludedTechnicalVisitService(record["service"] ?? record["TIPO_SERVICO"]),
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
