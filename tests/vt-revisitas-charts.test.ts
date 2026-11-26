import { describe, expect, it } from "vitest";
import { classifyVtOrders, type VtOrder } from "../src/lib/vt-revisitas";
import { vtChartMetrics, vtChartModel, vtMonthEnd } from "../src/lib/vt-revisitas-charts";
import { vtGeography, vtHeatData, vtMapArea } from "../src/lib/vt-revisitas-geography";

function order(id: string, day: string, options: Partial<VtOrder> = {}): VtOrder {
  return {
    id,
    day,
    os: id,
    wo: "",
    time: "08:00:00",
    contract: "A",
    technician: "Ana Teste",
    municipality: "NATAL",
    neighborhood: "P NEGRA",
    node: "",
    service: "VT",
    code: 517,
    description: "",
    expunge: false,
    ...options,
  };
}

describe("Gráficos de revisitas VT", () => {
  it("reconcilia as O.S. e as revisitas do recorte, distingue contratos por dia e preserva lacunas", () => {
    const base = classifyVtOrders([
      order("1", "2026-11-01"),
      order("2", "2026-11-03", { technician: "Bia Teste" }),
      order("3", "2026-11-01", { code: 302, time: "07:00:00" }),
      order("4", "2026-11-03", { technician: "Bia Teste", contract: "B", code: 473 }),
      order("5", "2026-11-10", { contract: "C" }),
      order("6", "2026-11-01", { code: 0, contract: "CANCELADO" }),
    ]);
    const tech = base.filter((row) => row.technician === "Ana Teste" && row.day <= "2026-11-03");
    const model = vtChartModel(tech, base, "2026-11", "", "2026-11-03");
    expect(model).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-03",
      latest: "2026-11-01",
      total: { orders: 3, productive: 1, improductive: 1, cancelled: 1, revisits: 1 },
    });
    expect(model.daily).toMatchObject([
      {
        day: "2026-11-01",
        contracts: 2,
        orders: 3,
        improductive: 1,
        cancelled: 1,
        revisits: 1,
        ordersToDate: 3,
      },
      { day: "2026-11-02", contracts: null, orders: null, cancelled: null, ordersToDate: null },
      {
        day: "2026-11-03",
        contracts: 0,
        orders: 0,
        cancelled: 0,
        revisits: 0,
        ordersToDate: 3,
        revisitsToDate: 1,
      },
    ]);
    expect(model.heat.located.map(({ label, count }) => [label, count])).toEqual([
      ["Ponta Negra · Natal", 1],
    ]);
    expect(vtChartMetrics(model.total)).toContainEqual(["O.S. no recorte", 3, "all"]);
    expect(vtChartMetrics(model.total)).toContainEqual(["O.S. canceladas", 1, "cancelled"]);
    expect(vtChartModel(base, base, "2026-11", "", "").to).toBe("2026-11-10");
    expect(vtMonthEnd("2028-02")).toBe("2028-02-29");
  });

  it("mostra O.S. expurgadas apenas no indicador de expurgadas e no total do recorte", () => {
    const rows = classifyVtOrders([
      order("produtiva", "2026-11-01", { contract: "P" }),
      order("improdutiva", "2026-11-01", { contract: "I", code: 106 }),
      order("expurgada-204", "2026-11-01", { contract: "E1", code: 204 }),
      order("expurgada-conferida", "2026-11-01", {
        contract: "E2",
        code: 583,
        sheetClassification: { expunged: true, improductive: true, revisited: true },
      }),
    ]);
    const model = vtChartModel(rows, rows, "2026-11", "", "");
    expect(vtChartMetrics(model.total)).toEqual([
      ["O.S. no recorte", 4, "all"],
      ["O.S. produtivas", 1, "productive"],
      ["Revisitas produtivas", 0, "revisit"],
      ["Taxa de revisita", "0,00%", "revisit-rate"],
      ["O.S. improdutivas", 1, "improductive"],
      ["O.S. canceladas", 0, "cancelled"],
      ["O.S. expurgadas", 2, "expunge"],
    ]);
  });

  it("reconhece abreviações, não mistura municípios e informa bairros não localizados", () => {
    const base = [
      order("1", "2026-11-01"),
      order("2", "2026-11-02", { neighborhood: "Ponta Negra" }),
      order("3", "2026-11-02", { municipality: "PARNAMIRIM/RN", neighborhood: "P NEGRA" }),
      order("4", "2026-11-02", { municipality: "PARNAMIRIM", neighborhood: "NV PARNAMIRIM" }),
      order("5", "2026-11-02", { neighborhood: "" }),
    ].map((row) => ({
      ...row,
      productive: true,
      revisited: true,
      improductive: false,
      cancelled: false,
      expunged: false,
      returnOs: "",
    }));
    const model = vtHeatData(base);
    expect(model.located.map(({ key, count }) => [key, count])).toEqual([
      ["NATAL:PONTA NEGRA", 2],
      ["PARNAMIRIM:NOVA PARNAMIRIM", 1],
    ]);
    expect(model.notLocated).toBe(2);
    expect(model.withoutName).toBe(1);
    expect(model.areas.reduce((sum, area) => sum + area.count, 0) + model.withoutName).toBe(5);
    expect(
      vtMapArea({ municipality: "Fortaleza - CE", neighborhood: "PAN AMERICANO" }),
    ).toMatchObject({
      label: "Panamericano",
      point: expect.any(Array),
    });
    expect(
      vtMapArea({ municipality: "NATAL/PARNAMIRIM", neighborhood: "P NEGRA" })?.point,
    ).toBeNull();
    expect(vtGeography.fortaleza.cities[0]?.neighborhoods).toHaveLength(121);
  });
});
