import { describe, expect, it } from "vitest";
import {
  isTechnicalVisitSector,
  nonTechnicalVisitState,
  technicalVisitState,
} from "../src/lib/technical-visit-scope";
import { directoryIndex, type QualityLogin } from "../src/lib/quality-directory";
import type { QualityState } from "../src/lib/quality";

const entry = (login: string, sector: string): QualityLogin => ({
  login,
  sector,
  full_name: login,
  city: "Natal",
  supervisor: "Supervisor",
});

describe("TC de QQ e Certificação sem os logins de Visita técnica", () => {
  it("exclui VT pelo cadastro e mantém outros setores, setor vazio e logins pendentes", () => {
    const records = [
      { login: " z1 ", points: "175", baseUnit: "NTL-DMV" },
      { login: "Z2", points: "127", baseUnit: "NTL-DMV_VT" },
      { login: "Z3", points: "150", baseUnit: "NTL-DMV_VT" },
      { login: "SEM_CADASTRO", points: "200", baseUnit: "NTL-DMV_VT" },
    ];
    const state: QualityState = {
      datasets: {
        certification: { records, files: ["base.csv"] },
        technical_visit: { records },
        quebra: { records: [{ lt: "Z1" }] },
      },
      imports: {},
      registry: {},
    };
    const index = directoryIndex([
      entry("Z1", " visita   TÉCNICA "),
      entry("Z2", "ADESÃO/SERVIÇOS"),
      entry("Z3", ""),
    ]);
    const scoped = nonTechnicalVisitState(state, index);
    expect(scoped.datasets.certification?.records).toEqual(records.slice(1));
    expect(scoped.datasets.certification?.records[0]).toBe(records[1]);
    expect(scoped.datasets.certification?.["files"]).toBe(state.datasets.certification?.["files"]);
    expect(scoped.datasets.quebra).toBe(state.datasets.quebra);
    expect(scoped.datasets.technical_visit).toBe(state.datasets.technical_visit);
    expect(scoped.imports).toBe(state.imports);
    expect(scoped.registry).toBe(state.registry);
    expect(state.datasets.certification?.records).toBe(records);
    expect(state.datasets.certification?.records).toHaveLength(4);
  });
  it("reclassifica os dois recortes sem modificar a base completa nem misturar suas importações", () => {
    const state: QualityState = {
      datasets: {
        certification: { records: [{ login: "Z1", points: "127", wo: "OS-ADESAO" }] },
        technical_visit: { records: [{ login: "Z1", points: "175", wo: "OS-VT" }] },
      },
      imports: {},
      registry: {},
    };
    const before = JSON.stringify(state);
    const vt = directoryIndex([entry("Z1", "Visita técnica")]);
    const other = directoryIndex([entry("Z1", "Adesão/Serviços")]);
    expect(nonTechnicalVisitState(state, vt).datasets.certification?.records).toEqual([]);
    expect(technicalVisitState(state, vt).datasets.technical_visit?.records).toEqual([
      { login: "Z1", points: "175", wo: "OS-VT" },
    ]);
    expect(nonTechnicalVisitState(state, other).datasets.certification?.records).toEqual([
      { login: "Z1", points: "127", wo: "OS-ADESAO" },
    ]);
    expect(technicalVisitState(state, other).datasets.technical_visit?.records).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("não cria uma base ausente nem exclui logins sem setor conhecido", () => {
    const state: QualityState = { datasets: {}, imports: {}, registry: {} };
    expect(nonTechnicalVisitState(state, new Map())).toBe(state);
    state.datasets.certification = { records: [{ login: "Z1", points: "127" }] };
    expect(nonTechnicalVisitState(state, new Map()).datasets.certification?.records).toEqual(
      state.datasets.certification.records,
    );
  });
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
