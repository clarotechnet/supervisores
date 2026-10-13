import { describe, expect, it } from "vitest";
import type { QualityKind, QualityRecord } from "../src/lib/quality";
import { mergeQualityRecords, qualitySnapshotChanged } from "../src/lib/quality-merge";

function days(start: string, end: string): string[] {
  const result: string[] = [];
  for (let d = Date.parse(start); d <= Date.parse(end); d += 86400000)
    result.push(new Date(d).toISOString().slice(0, 10));
  return result;
}
function rows(kind: QualityKind, start: string, end: string, corrected = false): QualityRecord[] {
  return days(start, end).map((day) =>
    kind === "quebra"
      ? {
          d: day,
          lt: "Z1",
          un: "NTL-DMV",
          f: "ND",
          os: `OS-${day}`,
          wo: `WO-${day}`,
          b: corrected && day === "2026-09-25" ? 0 : 1,
          c: { TEC1: 1 },
        }
      : {
          login: "Z1",
          wo: `WO-${day}`,
          finish: `${day.split("-").reverse().join("/")} 08:00:00`,
          day,
          month: Number(day.slice(5, 7)),
          year: 2026,
          points: corrected && day === "2026-09-25" ? "140" : "127",
          file: "origem.csv",
        },
  );
}
for (const kind of ["quebra", "certification", "technical_visit"] as const) {
  describe(`${kind}: importações incrementais com períodos sobrepostos`, () => {
    it("preserva agosto, atualiza setembro e adiciona outubro até 20/10", () => {
      const initial = mergeQualityRecords(kind, [], rows(kind, "2026-08-22", "2026-10-05"));
      expect(initial.records).toHaveLength(45);
      const second = mergeQualityRecords(
        kind,
        initial.records,
        rows(kind, "2026-09-21", "2026-10-13", true),
      );
      expect(second.report).toMatchObject({
        added: 8,
        updated: 1,
        unchanged: 14,
        total: 53,
        start: "2026-08-22",
        end: "2026-10-13",
      });
      const third = mergeQualityRecords(
        kind,
        second.records,
        rows(kind, "2026-09-21", "2026-10-20", true),
      );
      expect(third.report).toMatchObject({
        added: 7,
        updated: 0,
        unchanged: 23,
        total: 60,
        start: "2026-08-22",
        end: "2026-10-20",
      });
      const corrected = third.records.find(
        (r) => (kind === "quebra" ? r["d"] : r["day"]) === "2026-09-25",
      );
      expect(corrected?.[kind === "quebra" ? "b" : "points"]).toBe(kind === "quebra" ? 0 : "140");
    });
    it("reenviar o mesmo recorte ou suas linhas em outra ordem não duplica nem cria versão", () => {
      const existing = rows(kind, "2026-08-22", "2026-10-20", true);
      const repeat = mergeQualityRecords(
        kind,
        existing,
        rows(kind, "2026-09-21", "2026-10-20", true).reverse(),
      );
      expect(repeat.report).toMatchObject({ added: 0, updated: 0, unchanged: 30, total: 60 });
      expect(qualitySnapshotChanged(kind, { records: existing }, { records: repeat.records })).toBe(
        false,
      );
    });
    it("consolida duplicatas no arquivo usando a última correção", () => {
      const first = rows(kind, "2026-09-25", "2026-09-25")[0]!,
        last = rows(kind, "2026-09-25", "2026-09-25", true)[0]!;
      const result = mergeQualityRecords(kind, [], [first, first, last]);
      expect(result.report).toMatchObject({ added: 1, updated: 0, total: 1, duplicatesInFile: 2 });
      expect(result.records[0]).toEqual(last);
    });
    it("corrige duplicidade antiga sem apagar atendimentos distintos", () => {
      const first = rows(kind, "2026-09-25", "2026-09-25")[0]!,
        other = rows(kind, "2026-09-26", "2026-09-26")[0]!;
      const last = rows(kind, "2026-09-25", "2026-09-25", true)[0]!;
      const result = mergeQualityRecords(kind, [first, other, last], [last]);
      expect(result.report).toMatchObject({ duplicatesRemoved: 1, total: 2, unchanged: 1 });
      expect(result.records).toEqual([last, other]);
      expect(
        qualitySnapshotChanged(
          kind,
          { records: [first, other, last] },
          { records: result.records },
        ),
      ).toBe(true);
    });
  });
}
describe("identidade e metadados de importação", () => {
  it("renomear o CSV não muda os atendimentos nem grava outra base", () => {
    const existing = rows("certification", "2026-09-21", "2026-10-20");
    const incoming = existing.map((row) => ({ ...row, file: "novo_nome.csv" }));
    const result = mergeQualityRecords("certification", existing, incoming);
    expect(result.report).toMatchObject({ updated: 0, unchanged: 30, total: 30 });
    expect(
      qualitySnapshotChanged(
        "certification",
        { records: existing, files: ["origem.csv"] },
        { records: result.records, files: ["origem.csv", "novo_nome.csv"] },
      ),
    ).toBe(false);
  });
  it("nomes de arquivos iguais não escondem dados novos ou correções", () => {
    const existing = rows("certification", "2026-09-21", "2026-10-05");
    const result = mergeQualityRecords(
      "certification",
      existing,
      rows("certification", "2026-09-21", "2026-10-13", true),
    );
    expect(result.report).toMatchObject({ added: 8, updated: 1 });
    expect(
      qualitySnapshotChanged("certification", { records: existing }, { records: result.records }),
    ).toBe(true);
  });
  it("não mistura técnicos nem atendimentos em horários diferentes", () => {
    const base = rows("certification", "2026-09-21", "2026-09-21")[0]!;
    expect(
      mergeQualityRecords(
        "certification",
        [],
        [base, { ...base, login: "Z2" }, { ...base, finish: "21/09/2026 09:00:00" }],
      ).records,
    ).toHaveLength(3);
  });
  it("publica alterações reais nos metadados mesmo sem novos atendimentos", () => {
    const records = rows("quebra", "2026-09-21", "2026-09-21");
    expect(
      qualitySnapshotChanged(
        "quebra",
        { records, names: { Z1: "Antigo" } },
        { records, names: { Z1: "Atual" } },
      ),
    ).toBe(true);
  });
});
