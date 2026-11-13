import { describe, expect, it } from "vitest";
import { aggregate, parseCsvCompact } from "../src/lib/quality-math";
import { hydrateQuality, emptyQualityLogin, directoryIndex } from "../src/lib/quality-directory";
import { qualityTCRecordCity, qualityCity, emptyQualityFilters } from "../src/lib/quality-scope";
import { buildQualitySlides } from "../src/lib/quality-slides";
import { referenceCityMembers } from "../src/components/quality/reference-city-members";

const rows = parseCsvCompact(
  [
    "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO",
    "Z1;0;100;100;180;05/11/2026 08:00:00;15/11/2026;Recife;Recife;Instalação;1;PE;REC-1;JCR-DMV",
    "Z1;1;80;100;80;06/11/2026 08:00:00;16/11/2026;GOIANIA;Recife;Instalação;1;PE;GOI-1;JCR-DMV",
    "Z2;0;100;100;200;05/11/2026 08:00:00;15/11/2026;GOIANIA;Recife;Instalação;1;PE;GOI-2;JCR-DMV",
  ].join("\n"),
  "fixture.csv",
);
const directory = ["Z1", "Z2"].map((login) => ({
  ...emptyQualityLogin(),
  login,
  full_name: `Técnico ${login}`,
  city: "Recife",
  supervisor: "Equipe A",
}));
const index = directoryIndex(directory);

describe("município do atendimento no Técnico Certificado de QQ", () => {
  it("preserva GOIANIA do CSV mesmo na mesma UF, unidade, subcluster e login de Recife", () => {
    const before = structuredClone(rows);
    const tc = hydrateQuality(
      { datasets: { certification: { records: rows } }, registry: {}, imports: {} },
      directory,
    ).tc;
    const displayed = tc.map((row) => ({
      ...row,
      city: qualityTCRecordCity(row.login, row.city, index),
    }));
    expect(displayed.map((row) => row.city)).toEqual(["Recife", "GOIANIA", "GOIANIA"]);
    const recife = displayed.filter((row) => row.city === "Recife");
    expect(aggregate(recife)[0]).toMatchObject({
      os: 1,
      points: 180,
      prod: 180,
      revisit: 0,
      tec1: 1,
    });
    expect(aggregate(displayed.filter((row) => row.city === "GOIANIA"))).toHaveLength(2);
    expect(rows).toEqual(before);
    expect(directory.every((person) => person.city === "Recife")).toBe(true);
  });
  it("só usa a cidade do cadastro como fallback de município ausente", () => {
    for (const city of ["", " ", "-", "-1", "-3", "N/A"])
      expect(qualityTCRecordCity("z1", city, index)).toBe("Recife");
    expect(qualityTCRecordCity("Z1", " GOIANIA ", index)).toBe("GOIANIA");
    expect(qualityTCRecordCity("SEM-CADASTRO", "GOIANIA", index)).toBe("GOIANIA");
  });
  it("mantém a precedência existente do cadastro em VT e QQ de quebras", () => {
    expect(qualityTCRecordCity("Z1", "GOIANIA", index, true)).toBe("Recife");
    expect(qualityCity("Z1", "GOIANIA", index)).toBe("Recife");
  });
  it("gera slides separados e permite selecionar as variantes do município sem misturar Recife", () => {
    const snapshot = {
      mode: "tc" as const,
      filters: emptyQualityFilters(),
      front: "ND",
      tcView: "result" as const,
      expanded: false,
    };
    expect(buildQualitySlides([], rows, index, snapshot).map((slide) => slide.city)).toEqual([
      "GOIANIA",
      "Recife",
    ]);
    expect(buildQualitySlides([], rows, index, snapshot, true).map((slide) => slide.city)).toEqual([
      "Recife",
    ]);
    expect(referenceCityMembers("GOIANIA", ["Recife", "GOIANIA", "Goiânia", "Fortaleza"])).toEqual([
      "GOIANIA",
      "Goiânia",
    ]);
  });
});
