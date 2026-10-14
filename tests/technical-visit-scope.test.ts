import { describe, expect, it } from "vitest";
import { isTechnicalVisitSector, technicalVisitState } from "../src/lib/technical-visit-scope";
import { directoryIndex, type QualityLogin } from "../src/lib/quality-directory";
import type { QualityState } from "../src/lib/quality";

const entry = (login: string, sector: string): QualityLogin => ({
  login,
  sector,
  full_name: login,
  city: "Natal",
  supervisor: "Supervisor",
});
describe("recorte exclusivo do cadastro de Visita técnica", () => {
  it("normaliza acentos, caixa e espaços, mas não admite outros setores", () => {
    for (const value of [
      "Visita técnica",
      "VISITA TECNICA",
      " visita   TÉCNICA ",
      "Visita\u00a0técnica",
    ])
      expect(isTechnicalVisitSector(value)).toBe(true);
    for (const value of ["Adesão/Serviços", "VT", "Visita técnica - apoio", "", null, undefined])
      expect(isTechnicalVisitSector(value)).toBe(false);
  });
  it("filtra pelo login e setor cadastrados, sem adivinhar pelo serviço ou unidade do CSV", () => {
    const records = [
      { login: " z1 ", points: "175", baseUnit: "NTL-DMV", group: "Instalação" },
      { login: "Z2", points: "200", baseUnit: "NTL-DMV_VT", group: "Visita técnica" },
      { login: "Z3", points: "200", baseUnit: "NTL-DMV_VT" },
      { login: "SEM_CADASTRO", points: "200", baseUnit: "NTL-DMV_VT" },
    ];
    const state: QualityState = {
      datasets: { technical_visit: { records }, certification: { records } },
      imports: {},
      registry: {},
    };
    const index = directoryIndex([
      entry("Z1", "Visita técnica"),
      entry("Z2", "Adesão/Serviços"),
      entry("Z3", ""),
    ]);
    const scoped = technicalVisitState(state, index);
    expect(scoped.datasets.technical_visit?.records).toEqual([records[0]]);
    expect(scoped.datasets.technical_visit?.records[0]).toBe(records[0]);
    expect(state.datasets.technical_visit?.records).toBe(records);
    expect(scoped.datasets.certification).toBe(state.datasets.certification);
    expect(state.datasets.technical_visit?.records).toHaveLength(4);
  });
  it("reclassifica o histórico existente quando o cadastro muda, sem reimportação", () => {
    const state: QualityState = {
      datasets: { technical_visit: { records: [{ login: "Z1", points: "150" }] } },
      imports: {},
      registry: {},
    };
    expect(
      technicalVisitState(state, directoryIndex([entry("Z1", "Adesão")])).datasets.technical_visit
        ?.records,
    ).toEqual([]);
    expect(
      technicalVisitState(state, directoryIndex([entry("Z1", "Visita técnica")])).datasets
        .technical_visit?.records,
    ).toHaveLength(1);
    expect(
      technicalVisitState(state, directoryIndex([entry("Z1", "")])).datasets.technical_visit
        ?.records,
    ).toEqual([]);
  });
  it("não inclui nada sem a confirmação do cadastro e preserva um estado sem base", () => {
    const state: QualityState = { datasets: {}, imports: {}, registry: {} };
    expect(technicalVisitState(state, new Map())).toBe(state);
    state.datasets.technical_visit = { records: [{ login: "Z1" }] };
    expect(technicalVisitState(state, new Map()).datasets.technical_visit?.records).toEqual([]);
  });
});
