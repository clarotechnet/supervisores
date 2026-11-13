import {
  mergeQuarkPeople,
  type QuarkPerson,
  type QuarkHome,
  type QuarkDirectory,
  type QuarkPunch,
} from "../../src/lib/quark";

const timestamp = "2026-11-01T00:00:00Z";
export const locationPerson: QuarkPerson = {
  unit_id: 1,
  collaborator_id: "42",
  unit_name: "DMV - RECIFE",
  unit_city: "Recife",
  full_name: "Pessoa de Teste",
  registration: "ZTESTE",
  job_title: "Técnico",
  job_link_title: null,
  api_sector: "Campo",
  admission_date: null,
  is_active: true,
  is_esocial: false,
  first_seen_at: timestamp,
  last_seen_at: timestamp,
  updated_at: timestamp,
};
export const locationHome: QuarkHome = {
  unit_id: 1,
  collaborator_id: "42",
  address: "Rua de Teste, 10",
  latitude: -8.06,
  longitude: -34.89,
  city: "Recife",
  state: "PE",
  postal_code: "",
  neighborhood: "",
  updated_by: null,
  created_at: timestamp,
  updated_at: timestamp,
};
export const locationDirectory: QuarkDirectory = {
  unit_id: 1,
  collaborator_id: "42",
  city: "Recife",
  sector: "Campo",
  supervisor: "Supervisor de Teste",
  created_at: timestamp,
  updated_at: timestamp,
  updated_by: null,
};
export const [locationPersonView] = mergeQuarkPeople(
  [locationPerson],
  [locationDirectory],
  [locationHome],
);
export const locationPunches: QuarkPunch[] = ["2026-10-29", "2026-11-03"].flatMap((date) =>
  ["08:00:00", "12:00:00", "13:00:00", "17:00:00", "18:00:00"].map((time, index) => ({
    point_id: `${date}-${index + 1}`,
    unit_id: 1,
    collaborator_id: "42",
    work_date: date,
    punch_time: time,
    punched_at: null,
    latitude:
      index === 3 ? null : index === 1 || (index === 2 && date === "2026-11-03") ? -8.08 : -8.06,
    longitude: -34.89,
    location: `Local da ${index + 1}ª batida`,
    observation: null,
    record_type: null,
    is_offline: false,
    is_out_of_tolerance: false,
    is_active: true,
    updated_at: timestamp,
  })),
);

/** Three nearby records on different dates, numbered 3, 1 and 3 in their original days. */
export const nearSelectionPunches: QuarkPunch[] = [
  { date: "2026-10-28", nearPosition: 3 },
  { date: "2026-11-03", nearPosition: 1 },
  { date: "2026-11-07", nearPosition: 3 },
].flatMap(({ date, nearPosition }) =>
  locationPunches.slice(0, 5).map((punch, index) => ({
    ...punch,
    point_id: `${date}-${index + 1}`,
    work_date: date,
    latitude: index === 3 ? null : index + 1 === nearPosition ? locationHome.latitude : -8.08,
  })),
);
