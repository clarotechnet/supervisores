import type { QQRecord } from "@/lib/quality-math";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

// Only an invisible hit target and an accessible wrapper. The original bars,
// values, axes, colors, goals and coordinates are rendered by the source engine.
export function qqChartPointMarkup(
  index: number,
  label: string,
  bounds: { x: number; width: number; height: number },
): string {
  const description = escape(`${label}. Consultar logins e O.S.`);
  return `<g class="qq-front-bar" data-front-point="${index}" tabindex="0" role="button" aria-label="${description}" style="cursor:pointer"><title>${description}</title><rect class="qq-front-hit" x="${bounds.x}" y="0" width="${bounds.width}" height="${bounds.height}" fill="transparent"/>`;
}

export function qqChartSlice(
  records: QQRecord[],
  period: "daily" | "weekly",
  key: string,
  multipleMonths: boolean,
): QQRecord[] {
  return period === "daily"
    ? records.filter((row) => row.d === key)
    : records.filter(
        (row) => row.w && String(multipleMonths ? `${row.d.slice(0, 7)}|${row.w}` : row.w) === key,
      );
}

export function wireQQChartDrilldown(
  root: HTMLElement,
  context: {
    records: QQRecord[];
    days: string[];
    weeks: string[];
    months: string[];
    front: string;
  },
  open: (records: QQRecord[], label: string, metric: "q" | "b") => void,
) {
  for (const chart of root.querySelectorAll<HTMLElement>("[data-qq-chart]")) {
    const [period, metric] = chart.dataset["qqChart"]!.split(":");
    if ((period !== "daily" && period !== "weekly") || (metric !== "q" && metric !== "b")) continue;
    for (const point of chart.querySelectorAll<SVGElement>("[data-front-point]")) {
      const key = (period === "daily" ? context.days : context.weeks)[
        Number(point.dataset["frontPoint"])
      ];
      if (key === undefined) continue;
      const show = () => {
        const parts = key.split("|");
        const periodLabel =
          period === "daily"
            ? key.split("-").reverse().join("/")
            : `Semana ${parts.at(-1)} · ${(parts.length > 1 ? [parts[0]!] : context.months).map((month) => `${month.slice(5)}/${month.slice(0, 4)}`).join(", ")}`;
        open(
          qqChartSlice(context.records, period, key, context.months.length > 1),
          `${context.front} · ${periodLabel}`,
          metric,
        );
      };
      point.onclick = show;
      point.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          show();
        }
      };
    }
  }
}
