import { describe, expect, it } from "vitest";
import {
  isExcludedTechnicalVisitService,
  nonTechnicalVisitState,
  technicalVisitState,
} from "../src/lib/technical-visit-scope";
import { directoryIndex, hydrateQuality } from "../src/lib/quality-directory";
import { parseTC } from "../src/lib/quality-import";
import { aggregate } from "../src/lib/quality-math";
import type { QualityState } from "../src/lib/quality";
import { buildQualitySlides } from "../src/lib/quality-slides";
import { emptyQualityFilters } from "../src/lib/quality-scope";

const excluded = [
  "Mudanca de Endereco",
  "Instalacao",
  "Mudanca de Pacote",
  "INST GPON - INST CABO",
  "Troca de Equipamento Streaming",
];
const directory = [
  {
    login: "VT",
    full_name: "Técnico VT",
    city: "Natal",
    sector: "Visita técnica",
    supervisor: "Equipe VT",
  },
  {
    login: "EXCLUDED",
    full_name: "Somente serviços excluídos",
    city: "Recife",
    sector: "Visita técnica",
    supervisor: "Equipe excluída",
  },
  {
    login: "QQ",
    full_name: "Técnico QQ",
    city: "Natal",
    sector: "Adesão/Serviços",
    supervisor: "Equipe QQ",
  },
];
const index = directoryIndex(directory);
const csv = (rows: string[][]) =>
  [
    [
      "LOGIN_TECNICO",
      "QT_REVISITA",
      "TOTAL_OS_TEC1_PADRAO",
      "QTD_TOTAL_OS_TEC1",
      "QTDE_PONTOS",
      "FIM_TRABALHO",
      "DATA_NOTA",
      "NM_MUNICIPIO",
      "SUBCLUSTER",
      "GRUPO_ORDEM_SERVICO",
      "TIPO_JOB",
      "UF",
      "WORKORDER",
      "TIPO_SERVICO",
    ],
    ...rows,
  ]
    .map((row) => row.join(";"))
    .join("\n");
const line = (service: string, login = "VT", wo = service) => [
  login,
  "1",
  "0",
  "1000",
  "900",
  "06/11/2026 08:00:00",
  "16/11/2026",
  "Natal",
  "Natal",
  "Visita técnica",
  "1",
  "RN",
  wo,
  service,
];
const records = () =>
  parseTC(
    csv([
      [
        "VT",
        "0",
        "95",
        "100",
        "200",
        "05/11/2026 08:00:00",
        "15/11/2026",
        "Natal",
        "Natal",
        "Instalação",
        "1",
        "RN",
        "VALID-A",
        "Visita Tecnica",
      ],
      [
        "VT",
        "0",
        "95",
        "100",
        "100",
        "07/11/2026 08:00:00",
        "17/11/2026",
        "Natal",
        "Natal",
        "Instalação",
        "1",
        "RN",
        "VALID-B",
        "Reparo",
      ],
      ...excluded.map((service) => line(service)),
      line("Instalação", "EXCLUDED", "EXCLUDED-ONLY"),
      ...excluded.map((service) => line(service, "QQ", `QQ-${service}`)),
    ]),
    "base.csv",
  );
const stateFor = (): QualityState => ({
  datasets: {
    technical_visit: { records: records(), files: ["base.csv"] },
    certification: { records: records() },
    quebra: { records: [{ lt: "QQ" }] },
  },
  imports: {},
  registry: {},
});

describe("exclusões de TIPO_SERVICO somente no Técnico Certificado da VT", () => {
  it.each(excluded)("ignora %s mesmo com login cadastrado como VT", (service) => {
    expect(isExcludedTechnicalVisitService(service)).toBe(true);
  });
  it.each([
    "  mudança  de endereço  ",
    "INSTALAÇÃO",
    "Mudança de Pacote",
    "inst gpon-inst cabo",
    "INST GPON – INST CABO",
    " troca de equipamento streaming ",
  ])("normaliza apenas caixa, acentos, espaços e hífen: %s", (service) => {
    expect(isExcludedTechnicalVisitService(service)).toBe(true);
  });
  it.each([
    "Visita Tecnica",
    "Reparo",
    "Vistoria de Instalacao",
    "INSTALACAO ADICIONAL",
    "Troca de Equipamento",
    "Mudanca de Endereco - Vistoria",
    "",
    null,
    undefined,
  ])("não amplia a exclusão para outros serviços ou campos ausentes: %s", (service) => {
    expect(isExcludedTechnicalVisitService(service)).toBe(false);
  });
  it("usa o campo da coluna TIPO_SERVICO e não GRUPO_ORDEM_SERVICO, TIPO_JOB ou unidade", () => {
    const state = stateFor();
    const scoped = technicalVisitState(state, index);
    expect(scoped.datasets.technical_visit!.records.map((row) => row["wo"])).toEqual([
      "VALID-A",
      "VALID-B",
    ]);
    expect(scoped.datasets.technical_visit!.records[0]!["group"]).toBe("Instalação");
  });
  it("remove WOs, revisitas, TEC1, pontos e dias dos serviços excluídos, sem alterar os valores válidos", () => {
    const hydrated = hydrateQuality(
      technicalVisitState(stateFor(), index),
      directory,
      "technical_visit",
    );
    const [result] = aggregate(hydrated.tc);
    expect(result).toMatchObject({
      loginText: "VT",
      os: 2,
      tnum: 190,
      tden: 200,
      points: 300,
      prod: 150,
      revisit: 0,
      tec1: 0.95,
    });
    expect([...result!.days].sort()).toEqual(["2026-11-05", "2026-11-07"]);
  });
  it("aplica aos registros já salvos sem mutação, reimportação ou descarte da base original", () => {
    const state = stateFor();
    const before = JSON.stringify(state);
    const scoped = technicalVisitState(state, index);
    expect(scoped.datasets.technical_visit!.records[0]).toBe(
      state.datasets.technical_visit!.records[0],
    );
    expect(scoped.datasets.technical_visit!["files"]).toBe(
      state.datasets.technical_visit!["files"],
    );
    expect(scoped.datasets.certification).toBe(state.datasets.certification);
    expect(scoped.datasets.quebra).toBe(state.datasets.quebra);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.datasets.technical_visit!.records).toHaveLength(13);
  });
  it("não altera a regra de QQ e Certificação para os mesmos serviços", () => {
    const state = stateFor();
    const scoped = nonTechnicalVisitState(state, index);
    expect(scoped.datasets.certification!.records.map((row) => row["service"])).toEqual(excluded);
    expect(scoped.datasets.technical_visit).toBe(state.datasets.technical_visit);
    expect(scoped.datasets.quebra).toBe(state.datasets.quebra);
  });
  it("não cria slides ou equipes de VT compostas somente por serviços excluídos", () => {
    const hydrated = hydrateQuality(
      technicalVisitState(stateFor(), index),
      directory,
      "technical_visit",
    );
    const slides = buildQualitySlides(
      [],
      hydrated.tc,
      index,
      {
        mode: "tc",
        filters: emptyQualityFilters(),
        front: "ND",
        tcView: "result",
        expanded: false,
      },
      true,
    );
    expect(slides.map((slide) => slide.supervisor)).toEqual(["Equipe VT"]);
  });
  it("mantém serviços ausentes/vazios e aceita TIPO_SERVICO explícito em registros legados", () => {
    const state: QualityState = {
      datasets: {
        technical_visit: {
          records: [
            { login: "VT", service: "" },
            { login: "VT" },
            { login: "VT", TIPO_SERVICO: "Instalacao" },
            { login: "VT", service: "Reparo", group: "Instalacao" },
          ],
        },
      },
      imports: {},
      registry: {},
    };
    expect(technicalVisitState(state, index).datasets.technical_visit!.records).toEqual([
      { login: "VT", service: "" },
      { login: "VT" },
      { login: "VT", service: "Reparo", group: "Instalacao" },
    ]);
  });
});
