import { describe, expect, it } from "vitest";
import { aggregate, parseCsvCompact } from "../src/lib/quality-math";
import {
  referenceTCClosing,
  referenceTCRecordMonth,
  referenceTCPeriodDescription,
} from "../src/components/quality/reference-tc-period";

const csv = [
  "LOGIN_TECNICO;QT_REVISITA;TOTAL_OS_TEC1_PADRAO;QTD_TOTAL_OS_TEC1;QTDE_PONTOS;FIM_TRABALHO;DATA_NOTA;NM_MUNICIPIO;SUBCLUSTER;GRUPO_ORDEM_SERVICO;TIPO_JOB;UF;WORKORDER;UNIDADE_NEGOCIO",
  "Z1;1;0;1;500;20/10/2026 23:59:59;30/10/2026;Recife;Recife;Instalação;1;PE;ANTES;JCR-DMV",
  "Z1;0;1;1;150;21/10/2026 00:00:00;31/10/2026;Recife;Recife;Instalação;1;PE;INICIO;JCR-DMV",
  "Z1;0;1;1;180;22/10/2026 08:00:00;01/11/2026;Recife;Recife;Instalação;1;PE;MEIO;JCR-DMV",
  "Z1;0;1;1;210;21/11/2026 23:59:59;01/12/2026;Recife;Recife;Instalação;1;PE;FIM;JCR-DMV",
  "Z1;1;0;1;900;22/11/2026 00:00:00;02/12/2026;Recife;Recife;Instalação;1;PE;DEPOIS;JCR-DMV",
].join("\n");

describe("fechamento confirmado de novembro/2026 somente no TC do QQ", () => {
  it("inclui 21/10 e 21/11 inteiros, exclui os dias vizinhos e mantém as fórmulas", () => {
    const rows = parseCsvCompact(csv, "sintetico.csv");
    const before = structuredClone(rows);
    const selected = rows.filter((row) => referenceTCRecordMonth(row) === "2026-11");
    expect(selected.map((row) => row.wo)).toEqual(["INICIO", "MEIO", "FIM"]);
    expect(aggregate(selected)[0]).toMatchObject({
      os: 3,
      points: 540,
      prod: 180,
      tnum: 3,
      tden: 3,
      tec1: 1,
      revisit: 0,
    });
    expect(aggregate(selected)[0]!.days.size).toBe(3);
    expect(rows).toEqual(before);
    expect(rows[1]!.month).toBe(10);
    expect(rows[3]!.month).toBe(12);
  });
  it("não duplica as bordas entre meses nem na seleção de vários meses", () => {
    const rows = parseCsvCompact(csv, "sintetico.csv");
    expect(rows.map((row) => referenceTCRecordMonth(row))).toEqual([
      "2026-10",
      "2026-11",
      "2026-11",
      "2026-11",
      "2026-12",
    ]);
    const periods = ["2026-10", "2026-11", "2026-12"];
    expect(
      periods.flatMap((month) => rows.filter((row) => referenceTCRecordMonth(row) === month)),
    ).toHaveLength(rows.length);
    expect(rows.filter((row) => periods.includes(referenceTCRecordMonth(row)))).toHaveLength(
      rows.length,
    );
  });
  it("mantém a VT exatamente por DATA_NOTA e sem fechamento especial", () => {
    const rows = parseCsvCompact(csv, "sintetico.csv");
    expect(rows.map((row) => referenceTCRecordMonth(row, true))).toEqual([
      "2026-10",
      "2026-10",
      "2026-11",
      "2026-12",
      "2026-12",
    ]);
    expect(referenceTCClosing("2026-11", true)).toBeUndefined();
    expect(referenceTCPeriodDescription(true)).not.toContain("21/10");
  });
  it("não cria regras não solicitadas para outros meses ou anos", () => {
    expect(referenceTCClosing("2026-11")).toEqual({ start: "2026-10-21", end: "2026-11-21" });
    for (const month of ["2026-09", "2026-10", "2026-12", "2027-01", "2027-11"])
      expect(referenceTCClosing(month)).toBeUndefined();
    expect(referenceTCRecordMonth({ year: 2027, month: 11, day: "2027-10-22" })).toBe("2027-11");
    expect(referenceTCRecordMonth({ year: 2026, month: 10, day: "2026-09-21" })).toBe("2026-10");
  });
  it("não deixa DATA_NOTA em novembro incluir trabalho fora do intervalo confirmado", () => {
    expect(referenceTCRecordMonth({ year: 2026, month: 11, day: "2026-10-20" })).toBe("2026-10");
    expect(referenceTCRecordMonth({ year: 2026, month: 11, day: "2026-11-22" })).toBe("2026-12");
  });
  it("usa FIM_TRABALHO como fallback e não inventa data para registros inválidos", () => {
    expect(
      referenceTCRecordMonth({ year: 2026, month: 10, day: "", finish: "21/10/2026 00:00:00" }),
    ).toBe("2026-11");
    for (const day of ["", "2026-11-31", "data inválida"])
      expect(referenceTCRecordMonth({ year: 2026, month: 11, day })).toBe("");
    expect(referenceTCRecordMonth({ year: 2026, month: 11, day: "" }, true)).toBe("2026-11");
  });
});
