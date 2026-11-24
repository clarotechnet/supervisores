import { describe, expect, it } from "vitest";
import {
  findScheduleCell,
  mergeSheets,
  parseSheet,
} from "../supabase/functions/_shared/schedule-google-source";

const scope = { city: "fortaleza", sector: "instalacao" };
const period = "2026-12";
const days = [29, 30, ...Array.from({ length: 31 }, (_, index) => index + 1), 1, 2];
const headers = [
  ["Mês-ano:", 46357],
  ["Login", "Nome", ...days, "Folga fixa"],
];
const marks = (off: number) =>
  days.map((_, index) => (index % 7 === 0 || index % 7 === off ? "Folga" : "M. 1"));

describe("importação da Instalação de Fortaleza", () => {
  it("separa as linhas rotuladas Sup. e mantém a folga de cada supervisor", () => {
    const rows = [
      ...headers,
      ["Sup.", "SUPERVISOR A", ...marks(4), "Quinta"],
      ["Sup.", "SUPERVISOR B", ...marks(5), "Sexta"],
      ["Sup.", "SUPERVISOR C", ...marks(6), "Sábado"],
      ["Sup.VT", "SUPERVISOR VT", ...marks(2), "Terça"],
      ["Z123456", "TÉCNICO A", ...marks(3), "Quarta"],
    ];
    const parsed = parseSheet(rows, "Fortaleza - Instalação DEZ 26", period)!;
    const result = mergeSheets([parsed], scope);

    expect(result.people.map(({ name, login, fixedRest }) => [name, login, fixedRest])).toEqual([
      ["SUPERVISOR A", undefined, "Quinta"],
      ["SUPERVISOR B", undefined, "Sexta"],
      ["SUPERVISOR C", undefined, "Sábado"],
      ["SUPERVISOR VT", undefined, "Terça"],
      ["TÉCNICO A", "Z123456", "Quarta"],
    ]);
    expect(result.people[1]?.assignments).toMatchObject({
      "2026-12-18": "Folga",
      "2026-12-25": "Folga",
      "2027-01-01": "Folga",
    });
    expect(findScheduleCell(rows, period, "SUPERVISOR B", "", "2026-12-18")).toMatchObject({
      a1: "V4",
      code: "Folga",
    });
  });

  it("ainda rejeita folgas declaradas diferentes para a mesma pessoa", () => {
    const first = parseSheet(
      [...headers, ["Sup.", "SUPERVISOR A", ...marks(4), "Quinta"]],
      "Parte A",
      period,
    )!;
    const second = parseSheet(
      [...headers, ["Sup", "Supervisor A", ...marks(5), "Sexta"]],
      "Parte B",
      period,
    )!;

    expect(() => mergeSheets([first, second], scope)).toThrow("Folga fixa divergente");
  });
});
