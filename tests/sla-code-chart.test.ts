import { describe, expect, it } from "vitest";
import { isSlaOffenderChartCode } from "../src/lib/sla-code-chart";

describe("códigos exibidos somente no gráfico de ofensores do SLA", () => {
  it.each([0, 39, "42", 99, "099", -3, "-3"])("ignora código abaixo de 100: %s", (code) => {
    expect(isSlaOffenderChartCode(code)).toBe(false);
  });
  it.each([100, "100", " 100 ", "00100", 106, "302", "555", "1000"])(
    "inclui o limite 100 e códigos maiores: %s",
    (code) => {
      expect(isSlaOffenderChartCode(code)).toBe(true);
    },
  );
  it.each([null, undefined, "", "Não informado", "100x", "100,302", "0x100", "100.5"])(
    "não inventa código numérico a partir de valor inválido: %s",
    (code) => {
      expect(isSlaOffenderChartCode(code)).toBe(false);
    },
  );
});
