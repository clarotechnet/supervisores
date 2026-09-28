import { describe, expect, it } from "vitest";
import {
  buildLocationSummaries,
  currentClosingPeriod,
  distanceMeters,
  formatMinutes,
  mergeQuarkPeople,
  personKey,
  type QuarkHome,
  type QuarkPerson,
  type QuarkPunch,
} from "../src/lib/quark";
import { normalizeQuarkPersonName } from "../src/lib/quark-directory-import";

const person: QuarkPerson = {
  unit_id: 1,
  collaborator_id: "2",
  unit_name: "Unidade Natal",
  unit_city: "Natal",
  full_name: "Pessoa Teste",
  registration: null,
  job_title: null,
  job_link_title: null,
  api_sector: "Operacional",
  admission_date: null,
  is_active: true,
  is_esocial: false,
  first_seen_at: "2026-09-01T00:00:00Z",
  last_seen_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("ciclo Quark", () => {
  it("usa o fechamento do dia 26 ao dia 25", () => {
    expect(currentClosingPeriod(new Date(2026, 8, 24, 12))).toEqual({
      startDate: "2026-08-26",
      endDate: "2026-09-25",
    });
    expect(currentClosingPeriod(new Date(2026, 8, 26, 12))).toEqual({
      startDate: "2026-09-26",
      endDate: "2026-10-25",
    });
  });

  it("formata saldo positivo e negativo", () => {
    expect(formatMinutes(125)).toBe("02:05");
    expect(formatMinutes(-65)).toBe("−01:05");
  });
});

describe("associações administrativas", () => {
  it("combina moradia sem alterar o cadastro recebido da API", () => {
    const home: QuarkHome = {
      unit_id: 1,
      collaborator_id: "2",
      address: "Endereço de teste",
      latitude: -5.8,
      longitude: -35.2,
      city: "Natal",
      state: "RN",
      postal_code: "",
      neighborhood: "",
      updated_by: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };
    const [merged] = mergeQuarkPeople([person], [], [home]);
    expect(personKey(merged!)).toBe("1:2");
    expect(merged?.home?.city).toBe("Natal");
    expect(merged?.full_name).toBe(person.full_name);
  });

  it("calcula distância geográfica em metros", () => {
    expect(distanceMeters(-5.8, -35.2, -5.8, -35.2)).toBe(0);
    expect(distanceMeters(-5.8, -35.2, -5.801, -35.2)).toBeGreaterThan(100);
  });
});

describe("importação da base técnica", () => {
  it("normaliza nomes para associação segura com o cadastro Quark", () => {
    expect(normalizeQuarkPersonName("  José   da Silva ")).toBe("JOSE DA SILVA");
    expect(normalizeQuarkPersonName("Ádria-Lorena")).toBe("ADRIA LORENA");
  });
});

describe("resumo de localização", () => {
  it("separa batidas próximas, fora do raio e sem referência", () => {
    const home: QuarkHome = {
      unit_id: 1,
      collaborator_id: "2",
      address: "Endereço de teste",
      latitude: -5.8,
      longitude: -35.2,
      city: "Natal",
      state: "RN",
      postal_code: "",
      neighborhood: "",
      updated_by: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };
    const [personView] = mergeQuarkPeople([person], [], [home]);
    const base: Omit<QuarkPunch, "point_id" | "latitude" | "longitude" | "location"> = {
      unit_id: 1,
      collaborator_id: "2",
      work_date: "2026-09-24",
      punched_at: null,
      punch_time: "08:00:00",
      observation: null,
      record_type: null,
      is_offline: false,
      is_out_of_tolerance: false,
      is_active: true,
      updated_at: "2026-09-24T12:00:00Z",
    };
    const punches: QuarkPunch[] = [
      { ...base, point_id: "1", latitude: -5.8, longitude: -35.2, location: "Casa" },
      { ...base, point_id: "2", latitude: -5.81, longitude: -35.2, location: "Cliente" },
      { ...base, point_id: "3", latitude: null, longitude: null, location: null },
    ];
    const [summary] = buildLocationSummaries([personView!], punches, 200);
    expect(summary?.nearHome).toBe(1);
    expect(summary?.outsideHome).toBe(1);
    expect(summary?.noReference).toBe(1);
    expect(summary?.punches).toBe(3);
  });
});
