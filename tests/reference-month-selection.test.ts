import { describe, expect, it } from "vitest";
import { referenceMonthSelection } from "../src/components/quality/reference-month-selection";

describe("Todos os meses no painel integrado", () => {
  const available = Object.freeze(["2026-11", "2026-09", "2026-10"]);
  it("marca todos e, no segundo clique, deixa só o mês mais recente da base", () => {
    const all = referenceMonthSelection(available, ["2026-10"], "*", true);
    expect(all).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(referenceMonthSelection(available, all, "*", false)).toEqual(["2026-11"]);
    expect(referenceMonthSelection(available, [], "*", false)).toEqual(["2026-11"]);
  });
  it("usa o ano e os meses existentes, sem fixar novembro nem o mês do relógio", () => {
    expect(referenceMonthSelection(["2026-12", "2027-01", "2026-11"], [], "*", false)).toEqual([
      "2027-01",
    ]);
    expect(referenceMonthSelection(["2026-05", "2026-09"], [], "*", false)).toEqual(["2026-09"]);
    expect(referenceMonthSelection([], [], "*", false)).toEqual([]);
  });
  it("mantém seleções individuais, incluindo desmarcar um mês quando todos estão implícitos", () => {
    expect(referenceMonthSelection(available, [], "2026-10", false)).toEqual([
      "2026-09",
      "2026-11",
    ]);
    expect(referenceMonthSelection(available, ["2026-11"], "2026-09", true)).toEqual([
      "2026-09",
      "2026-11",
    ]);
    expect(referenceMonthSelection(available, ["2026-09"], "2026-09", false)).toEqual(["2026-09"]);
    expect(referenceMonthSelection(available, ["2026-11"], "2026-11", true)).toEqual(["2026-11"]);
    expect(available).toEqual(["2026-11", "2026-09", "2026-10"]);
  });
});
