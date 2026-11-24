import { vtSummaries, vtTechnicianSummaries, type VtClassified } from "./vt-revisitas";
import { vtHeatData } from "./vt-revisitas-geography";
import type { VtCity } from "./vt-revisitas";

const dayLength = 86_400_000;
export const vtShortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const vtFullDay = (day: string) => day.split("-").reverse().join("/");

export function vtMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10);
}

export function vtChartModel(
  rows: VtClassified[],
  cityRows: VtClassified[],
  month: string,
  lower: string,
  upper: string,
) {
  const monthStart = `${month}-01`;
  const monthEnd = vtMonthEnd(month);
  const from = lower > monthStart ? lower : monthStart;
  const lastCityDate = cityRows.reduce((last, row) => (row.day > last ? row.day : last), "");
  const proposedEnd = upper || lastCityDate || monthEnd;
  const to = proposedEnd < monthEnd ? proposedEnd : monthEnd;
  const daysInBase = new Set(cityRows.map((row) => row.day));
  const dailyByDay = new Map(vtSummaries(rows, (row) => row.day).map((item) => [item.name, item]));
  const contractsByDay = new Map<string, Set<string>>();
  let latest = "";
  for (const row of rows) {
    if (row.day > latest) latest = row.day;
    const contracts = contractsByDay.get(row.day) ?? new Set<string>();
    if (row.contract) contracts.add(row.contract);
    contractsByDay.set(row.day, contracts);
  }

  let ordersToDate = 0,
    productiveToDate = 0,
    revisitsToDate = 0;
  const first = Date.parse(from),
    last = Date.parse(to);
  const daily = Array.from(
    { length: Math.max(0, Math.min(31, (last - first) / dayLength + 1)) },
    (_, index) => {
      const day = new Date(first + index * dayLength).toISOString().slice(0, 10);
      const present = daysInBase.has(day);
      const data = dailyByDay.get(day);
      ordersToDate += data?.orders ?? 0;
      productiveToDate += data?.productive ?? 0;
      revisitsToDate += data?.revisits ?? 0;
      return {
        day,
        orders: present ? (data?.orders ?? 0) : null,
        contracts: present ? (contractsByDay.get(day)?.size ?? 0) : null,
        productive: present ? (data?.productive ?? 0) : null,
        improductive: present ? (data?.improductive ?? 0) : null,
        cancelled: present ? (data?.cancelled ?? 0) : null,
        revisits: present ? (data?.revisits ?? 0) : null,
        expunged: present ? (data?.expunged ?? 0) : null,
        ordersToDate: present ? ordersToDate : null,
        productiveToDate: present ? productiveToDate : null,
        revisitsToDate: present ? revisitsToDate : null,
      };
    },
  );
  const total = vtSummaries(rows, () => "Total")[0];
  const ranking = vtTechnicianSummaries(rows).sort(
    (a, b) => b.productive - a.productive || a.name.localeCompare(b.name, "pt-BR"),
  );
  return { from, to, latest, daily, total, ranking, heat: vtHeatData(rows) };
}

export type VtChartModel = ReturnType<typeof vtChartModel>;
export interface VtChartScope {
  city: VtCity;
  month: string;
  technician: string;
  area: string;
  daysWorked?: number | null;
}

export function vtChartMetrics(total: VtChartModel["total"]) {
  return [
    ["O.S. no recorte", total?.orders, "all"],
    ["O.S. produtivas", total?.productive, "productive"],
    ["Revisitas produtivas", total?.revisits, "revisit"],
    [
      "Taxa de revisita",
      total?.productive
        ? new Intl.NumberFormat("pt-BR", {
            style: "percent",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(total.revisits / total.productive)
        : "—",
      "revisit-rate",
    ],
    ["O.S. improdutivas", total?.improductive, "improductive"],
    ["O.S. canceladas", total?.cancelled, "cancelled"],
    ["O.S. expurgadas", total?.expunged, "expunge"],
  ] as const;
}

export type VtOrderMetric = ReturnType<typeof vtChartMetrics>[number][2];
