import { describe, expect, it } from "vitest";
import { formatQuarkRadiusKm, parseQuarkRadiusKm } from "../src/lib/quark-location-radius";

describe("raio manual da moradia em quilômetros", () => {
  it.each([
    ["1,5", 1500],
    ["1.5", 1500],
    ["0,2", 200],
    ["0.1", 100],
    ["0,001", 1],
    ["2", 2000],
    [" 1,5 ", 1500],
    [",5", 500],
    ["1,", 1000],
  ])("converte %s km para %s metros", (text, meters) => {
    expect(parseQuarkRadiusKm(text)).toBe(meters);
  });

  it.each(["", " ", "0", "0,0", "-1,5", "abc", "1,2,3", "1.500,5", "Infinity", "1e3"])(
    "não aplica a entrada inválida %j",
    (text) => expect(parseQuarkRadiusKm(text)).toBeNull(),
  );

  it("mostra o raio atual em km com vírgula, mantendo o padrão de 200 m", () => {
    expect(formatQuarkRadiusKm(200)).toBe("0,2");
    expect(formatQuarkRadiusKm(1500)).toBe("1,5");
  });
});
