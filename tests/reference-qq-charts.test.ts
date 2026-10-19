import { describe, expect, it } from "vitest";
import { qqChartPointMarkup, qqChartSlice } from "../src/components/quality/reference-qq-charts";
import type { QQRecord } from "../src/lib/quality-math";

const row = (d: string, w: string, os: string) => ({ d, w, os }) as QQRecord;
const records = [
  row("2026-09-01", "1", "SET1"),
  row("2026-09-02", "1", "SET2"),
  row("2026-10-01", "1", "OUT1"),
  row("2026-10-02", "1", "OUT2"),
  row("2026-10-08", "2", "OUT3"),
  row("2026-10-09", "", "SEM-SEMANA"),
];
describe("clique nos gráficos diários e semanais de QQ", () => {
  it("usa a data inteira para não misturar o mesmo dia de meses diferentes", () => {
    expect(qqChartSlice(records, "daily", "2026-10-01", true)).toEqual([records[2]]);
    expect(qqChartSlice(records, "daily", "2026-09-01", true)).toEqual([records[0]]);
  });
  it("separa semanas de mesmo número em meses distintos e exclui semana vazia", () => {
    expect(qqChartSlice(records, "weekly", "2026-10|1", true)).toEqual(records.slice(2, 4));
    expect(qqChartSlice(records, "weekly", "2026-09|1", true)).toEqual(records.slice(0, 2));
    expect(qqChartSlice(records, "weekly", "2026-10|2", true)).toEqual([records[4]]);
    expect(qqChartSlice(records, "weekly", "2026-10|", true)).toEqual([]);
  });
  it("mantém o agrupamento original de semana quando somente um mês está selecionado", () => {
    const filtered = records.filter((r) => r.d.startsWith("2026-10"));
    expect(qqChartSlice(filtered, "weekly", "1", false)).toEqual(records.slice(2, 4));
    expect(qqChartSlice(filtered, "weekly", "3", false)).toEqual([]);
    expect(filtered).toHaveLength(4);
  });
  it("mantém as referências e os campos da base sem recalcular ou alterar registros", () => {
    const original = JSON.stringify(records);
    const subset = qqChartSlice(records, "weekly", "2026-10|1", true);
    expect(subset[0]).toBe(records[2]);
    expect(JSON.stringify(records)).toBe(original);
  });
  it("torna inclusive barras zero acessíveis e escapa os textos do detalhamento", () => {
    const markup = qqChartPointMarkup(0, 'ME · 0,00% <teste> "nome"', {
      x: 10,
      width: 100,
      height: 140,
    });
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('data-front-point="0"');
    expect(markup).toContain('height="140" fill="transparent"');
    expect(markup).toContain("&lt;teste&gt; &quot;nome&quot;");
    expect(markup).not.toContain("<teste>");
  });
});
