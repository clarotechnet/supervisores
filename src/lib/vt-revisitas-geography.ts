import { nameKey } from "./quality-directory";
import { vtCity, type VtCity, type VtClassified, type VtOrder } from "./vt-revisitas";
import geographyJson from "./vt-geography.json";

export type VtGeoPoint = readonly [longitude: number, latitude: number];
export interface VtGeoCity {
  name: string;
  main: boolean;
  point: VtGeoPoint;
  rings: VtGeoPoint[][];
  neighborhoods: [name: string, longitude: number, latitude: number][];
}
// The generator emits coordinate tuples, which JSON module types infer as arrays.
export const vtGeography = geographyJson as unknown as Record<
  VtCity,
  {
    land: VtGeoPoint[][];
    cities: VtGeoCity[];
  }
>;
export const VT_GEOGRAPHY_SOURCE =
  "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/";

function geoKey(text: string) {
  return nameKey(text)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// Aliases found in the import layouts. Only resolve inside the stated municipality.
const aliasesByCity: Record<string, Record<string, string>> = {
  FORTALEZA: {
    "D LUSTOSA": "DOM LUSTOSA",
    "D TORRES": "DIONISIO TORRES",
    "F BRITO": "FARIAS BRITO",
    "JD AMERICA": "JARDIM AMERICA",
    "JD GUANABARA": "JARDIM GUANABARA",
    "O OLIVEIRA": "OLAVO OLIVEIRA",
    "OLAVO DE OLIVEIRA": "OLAVO OLIVEIRA",
    "PAN AMERICANO": "PANAMERICANO",
    "PE ANDRADE": "PADRE ANDRADE",
    "R TEOFILO": "RODOLFO TEOFILO",
    "S GERARDO": "SAO GERARDO",
  },
  NATAL: {
    "C MACIO": "CAPIM MACIO",
    "CID DA ESPERANCA": "CIDADE DA ESPERANCA",
    "CID N": "CIDADE NOVA",
    "D S ROSADO": "DIX SEPT ROSADO",
    "FELIPE CAMARAO": "FILIPE CAMARAO",
    "L NOVA": "LAGOA NOVA",
    "N DESCOBERTA": "NOVA DESCOBERTA",
    "N SRA DA APRESENTACAO": "NOSSA SENHORA DA APRESENTACAO",
    "N SRA DE NAZARE": "NOSSA SENHORA DE NAZARE",
    "P NEGRA": "PONTA NEGRA",
  },
  PARNAMIRIM: {
    "NV PARNAMIRIM": "NOVA PARNAMIRIM",
    "PRQ ARVORES": "PARQUE DAS ARVORES",
    "PRQ DAS NACOES": "PARQUE DAS NACOES",
  },
};
const areaCatalog = new Map<string, { name: string; city: string; point: VtGeoPoint }>(
  Object.values(vtGeography).flatMap((region) =>
    region.cities
      .filter((city) => city.main)
      .flatMap((city) =>
        city.neighborhoods.map(
          ([name, lng, lat]) =>
            [
              `${geoKey(city.name)}:${geoKey(name)}`,
              { name, city: city.name, point: [lng, lat] as VtGeoPoint },
            ] as const,
        ),
      ),
  ),
);

export function vtMapArea(row: Pick<VtOrder, "municipality" | "neighborhood">) {
  const area = geoKey(row.neighborhood);
  if (!area) return null;
  const city = geoKey(row.municipality).replace(/ (?:CE|RN)$/, "");
  const district = aliasesByCity[city]?.[area] ?? area;
  const key = `${city}:${district}`;
  const found = areaCatalog.get(key);
  const useMunicipality = vtCity(row.municipality) === "natal";
  const title = found?.name ?? row.neighborhood;
  return {
    key,
    label: useMunicipality ? `${title} · ${found?.city ?? row.municipality}` : title,
    point: found?.point ?? null,
  };
}

export interface VtHeatArea {
  key: string;
  label: string;
  point: VtGeoPoint | null;
  count: number;
}

export function vtHeatData(rows: readonly VtClassified[]) {
  const byArea = new Map<string, VtHeatArea>();
  let withoutName = 0;
  for (const row of rows) {
    if (!row.revisited) continue;
    const area = vtMapArea(row);
    if (!area) {
      withoutName++;
      continue;
    }
    const old = byArea.get(area.key);
    if (old) old.count++;
    else byArea.set(area.key, { ...area, count: 1 });
  }
  const areas = [...byArea.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"),
  );
  const located = areas.filter(
    (area): area is VtHeatArea & { point: VtGeoPoint } => area.point !== null,
  );
  return {
    areas,
    located,
    withoutName,
    notLocated: withoutName + areas.reduce((sum, area) => sum + (area.point ? 0 : area.count), 0),
  };
}

export type VtHeatData = ReturnType<typeof vtHeatData>;
