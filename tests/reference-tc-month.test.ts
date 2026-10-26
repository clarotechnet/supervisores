import { describe, expect, it } from "vitest";
import { referenceTCMonth } from "../src/components/quality/reference-tc-month";
import { aggregate, applyStatus, parseCsvCompact } from "../src/lib/quality-math";
import { prepareTCProjection } from "../src/lib/quality-projection";

describe("competência de referência do Técnico Certificado", () => {
  const available = ["2026-09", "2026-10", "2026-11"];
  it("respeita outubro mesmo quando já existe novembro na base", () => {
    expect(referenceTCMonth(available, ["2026-10"])).toBe("2026-10");
  });
  it("usa a última competência selecionada quando há vários meses", () => {
    expect(referenceTCMonth(available, ["2026-10", "2026-09"])).toBe("2026-10");
  });
  it("mantém o mês mais recente da base quando todos os meses estão liberados", () => {
    expect(referenceTCMonth(available, [])).toBe("2026-11");
  });
  it("não substitui a competência selecionada por novembro quando outro filtro a esvazia", () => {
    expect(referenceTCMonth(["2026-11"], ["2026-10"])).toBe("2026-10");
    expect(referenceTCMonth([], ["2026-10"])).toBe("2026-10");
  });
  it("ordena corretamente na virada de ano sem modificar as seleções", () => {
    const available = Object.freeze(["2027-01", "2026-12"]);
    const selected = Object.freeze(["2026-12", "2026-10"]);
    expect(referenceTCMonth(available, selected)).toBe("2026-12");
    expect(referenceTCMonth(available, [])).toBe("2027-01");
    expect(selected).toEqual(["2026-12", "2026-10"]);
  });
  it("retorna vazio para uma base vazia sem seleção", () => {
    expect(referenceTCMonth([], [])).toBe("");
  });
  it("preserva o ciclo por DATA_NOTA e a defasagem do fechamento, sem recortar de 1 a 31", () => {
    const csv = [
      "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO",
      "Z1;0;95;100;180;21/09/2026 08:00:00;01/10/2026;Fortaleza;Fortaleza;Instalação;1;CE;OUT-INICIO;FTZ-DMV_01",
      "Z1;0;95;100;180;20/10/2026 08:00:00;30/10/2026;Fortaleza;Fortaleza;Instalação;1;CE;OUT-FIM;FTZ-DMV_01",
      "Z1;1;1;10;10;22/10/2026 08:00:00;01/11/2026;Fortaleza;Fortaleza;Instalação;1;CE;NOV-INICIO;FTZ-DMV_01",
    ].join("\n");
    const rows = parseCsvCompact(csv, "fixture.csv");
    const key = (row: (typeof rows)[number]) => `${row.year}-${String(row.month).padStart(2, "0")}`;
    const month = referenceTCMonth(rows.map(key), ["2026-10"]);
    const current = rows.filter((row) => key(row) === month);
    expect(current.map((row) => row.wo)).toEqual(["OUT-INICIO", "OUT-FIM"]);
    expect(current.map((row) => row.day)).toEqual(["2026-09-21", "2026-10-20"]);
    const results = aggregate(current);
    applyStatus(results);
    expect(results[0]).toMatchObject({ os: 2, prod: 180, tec1: 0.95, revisit: 0, status: true });
    const projection = prepareTCProjection(rows, current, month);
    expect(projection).toMatchObject({
      month: "2026-10",
      lag: 10,
      loaded: "2026-10-20",
      suggestedEnd: "2026-10-21",
      workDays: 1,
    });
    expect(
      prepareTCProjection(rows, current, month, { end: "2026-10-22", workDays: 2 }),
    ).toMatchObject({ end: "2026-10-22", workDays: 2 });
  });
});
