import { describe, expect, it } from "vitest";
import { sortSlaRows, type SlaSortColumn } from "../src/lib/sla-table-sort";
import { createSlaDirectoryPresentation } from "../src/lib/sla-directory";

interface Row {
  id: string;
  value?: unknown;
}
const column = (type: SlaSortColumn<Row>["type"]): SlaSortColumn<Row> => ({
  type,
  value: (row) => row.value,
});
const ids = (rows: Row[]) => rows.map((row) => row.id);

describe("ordenação de apresentação nas tabelas do SLA", () => {
  it("ordena números reais, não o texto formatado das células", () => {
    const rows = [9, 100, 12, 1000, 0].map((value) => ({ id: String(value), value }));
    expect(ids(sortSlaRows(rows, column("number"), "descending"))).toEqual([
      "1000",
      "100",
      "12",
      "9",
      "0",
    ]);
    expect(ids(sortSlaRows(rows, column("number"), "ascending"))).toEqual([
      "0",
      "9",
      "12",
      "100",
      "1000",
    ]);
  });
  it("ordena percentuais pela precisão original, mesmo com rótulos arredondados iguais", () => {
    const rows = [99.994, 9.5, 100, 99.993].map((value) => ({ id: String(value), value }));
    expect(ids(sortSlaRows(rows, column("number"), "descending"))).toEqual([
      "100",
      "99.994",
      "99.993",
      "9.5",
    ]);
  });
  it("ordena A–Z com acentos portugueses e identificadores em ordem natural", () => {
    const rows = ["Z10", "Érica", "z2", "Álvaro", "bruno"].map((value) => ({ id: value, value }));
    expect(ids(sortSlaRows(rows, column("text"), "ascending"))).toEqual([
      "Álvaro",
      "bruno",
      "Érica",
      "z2",
      "Z10",
    ]);
    expect(ids(sortSlaRows(rows, column("text"), "descending"))).toEqual([
      "Z10",
      "z2",
      "Érica",
      "bruno",
      "Álvaro",
    ]);
  });
  it("ordena datas brasileiras cronologicamente entre meses e anos", () => {
    const rows = ["01/01/2027", "02/10/2026", "30/09/2026", "2026-10-15"].map((value) => ({
      id: value,
      value,
    }));
    expect(ids(sortSlaRows(rows, column("date"), "ascending"))).toEqual([
      "30/09/2026",
      "02/10/2026",
      "2026-10-15",
      "01/01/2027",
    ]);
    expect(ids(sortSlaRows(rows, column("date"), "descending"))).toEqual([
      "01/01/2027",
      "2026-10-15",
      "02/10/2026",
      "30/09/2026",
    ]);
  });
  it.each(["ascending", "descending"] as const)(
    "mantém números ausentes/NaN no final (%s)",
    (direction) => {
      const rows = [
        { id: "null", value: null },
        { id: "one", value: 1 },
        { id: "nan", value: NaN },
        { id: "undefined" },
        { id: "infinity", value: Infinity },
        { id: "zero", value: 0 },
      ];
      const result = ids(sortSlaRows(rows, column("number"), direction));
      expect(result.slice(2)).toEqual(["null", "nan", "undefined", "infinity"]);
      expect(result.slice(0, 2)).toEqual(
        direction === "ascending" ? ["zero", "one"] : ["one", "zero"],
      );
    },
  );
  it("preserva a ordem entre empates e não modifica nenhuma linha ou array original", () => {
    const rows = Object.freeze([
      Object.freeze({ id: "a", value: 2 }),
      Object.freeze({ id: "b", value: 2 }),
      Object.freeze({ id: "c", value: 1 }),
    ]);
    const result = sortSlaRows(rows, column("number"), "descending");
    expect(ids(result)).toEqual(["a", "b", "c"]);
    expect(result).not.toBe(rows);
    expect(result[0]).toBe(rows[0]);
    expect(ids([...rows])).toEqual(["a", "b", "c"]);
  });
  it("ordena o conjunto completo antes de paginar", () => {
    const rows = Array.from({ length: 83 }, (_, value) => ({ id: String(value), value }));
    const result = sortSlaRows(rows, column("number"), "descending");
    expect(result.slice(0, 40)[0].value).toBe(82);
    expect(result.slice(40, 80)[0].value).toBe(42);
    expect(result.slice(80).map((row) => row.value)).toEqual([2, 1, 0]);
    expect(rows[0].value).toBe(0);
  });
  it("usa o nome exibido do cadastro, sem trocar a matrícula ou seus indicadores", () => {
    const labels = createSlaDirectoryPresentation(() => ({
      Z1: { name: "Zélia", supervisor: "Maria" },
      Z2: { name: "Ana", supervisor: "Pedro" },
    }));
    const rows = [
      { id: "Z1", value: 5 },
      { id: "Z2", value: 7 },
    ];
    expect(
      ids(
        sortSlaRows(
          rows,
          {
            type: "text",
            value: (row) => labels.text(row.id),
          },
          "ascending",
        ),
      ),
    ).toEqual(["Z2", "Z1"]);
    expect(rows).toEqual([
      { id: "Z1", value: 5 },
      { id: "Z2", value: 7 },
    ]);
  });
  it("trata conjuntos vazios e datas inválidas sem inventar zeros ou datas", () => {
    expect(sortSlaRows([], column("date"), "ascending")).toEqual([]);
    const rows = [
      { id: "bad", value: "31/02/2026" },
      { id: "ok", value: "01/10/2026" },
    ];
    expect(ids(sortSlaRows(rows, column("date"), "descending"))).toEqual(["ok", "bad"]);
  });
});
