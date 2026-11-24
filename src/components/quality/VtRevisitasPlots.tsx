import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { vtFullDay, vtShortDay, type VtChartModel } from "@/lib/vt-revisitas-charts";

const series = {
  ordersToDate: { label: "O.S. totais", color: "var(--foreground)" },
  productiveToDate: { label: "O.S. produtivas", color: "#e52b44" },
  revisitsToDate: { label: "Revisitas produtivas", color: "#9d62dc" },
  contracts: { label: "Contratos distintos", color: "var(--foreground)" },
  productive: { label: "O.S. produtivas", color: "#e52b44" },
  revisits: { label: "Revisitas produtivas", color: "#9d62dc" },
  improductive: { label: "O.S. improdutivas", color: "#e6850a" },
  cancelled: { label: "O.S. canceladas", color: "#64748b" },
  expunged: { label: "O.S. expurgadas", color: "#169364" },
};
const plots = {
  totals: { title: "O.S. acumuladas", keys: ["ordersToDate", "productiveToDate"] },
  revisits: { title: "Revisitas acumuladas", keys: ["revisitsToDate"] },
  technician: {
    title: "Evolução diária do técnico",
    keys: ["contracts", "productive", "improductive", "cancelled", "expunged", "revisits"],
  },
} as const;

export function VtTrendPlot({
  model,
  variant,
  width,
  height = 228,
}: {
  model: VtChartModel;
  variant: keyof typeof plots;
  width?: number;
  height?: number;
}) {
  const config = plots[variant];
  const chart = (
    <LineChart
      width={width ?? 540}
      height={height}
      data={model.daily}
      margin={{ left: -6, right: 12, top: 12, bottom: 0 }}
      accessibilityLayer
    >
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="day"
        tickFormatter={vtShortDay}
        interval="preserveStartEnd"
        minTickGap={13}
        padding={{ left: 7, right: 7 }}
        tickMargin={6}
        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
      />
      <YAxis
        allowDecimals={false}
        domain={[0, (max: number) => Math.max(1, max)]}
        width={46}
        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
      />
      {width === undefined && (
        <Tooltip
          labelFormatter={(label) => vtFullDay(String(label))}
          contentStyle={{
            backgroundColor: "var(--card)",
            color: "var(--foreground)",
            borderColor: "var(--border)",
            borderRadius: 8,
          }}
        />
      )}
      {config.keys.map((key) => (
        <Line
          key={key}
          type="linear"
          dataKey={key}
          name={series[key].label}
          stroke={series[key].color}
          strokeWidth={2.5}
          strokeDasharray={key === "revisits" ? "5 3" : key === "cancelled" ? "3 3" : undefined}
          dot={{ r: variant === "technician" ? 2.6 : 2, strokeWidth: 0, fill: series[key].color }}
          connectNulls={variant !== "technician"}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
  return (
    <section
      data-vt-chart={variant}
      className="min-w-0 rounded-xl border border-border bg-card p-4"
      aria-label={config.title}
    >
      <h2 className="text-sm font-semibold">{config.title}</h2>
      <div className="mb-2 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {config.keys.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded"
              aria-hidden="true"
              style={{ background: series[key].color }}
            />
            {series[key].label}
          </span>
        ))}
      </div>
      {width !== undefined ? (
        chart
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
      {variant === "technician" && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Dias sem O.S. na base da cidade ficam em branco. Uma expurgada pode estar na base de
          produtivas.
        </p>
      )}
    </section>
  );
}

export function VtProductivityRows({
  rows,
  max,
  onTechnician,
}: {
  rows: VtChartModel["ranking"];
  max: number;
  onTechnician?: (login: string) => void;
}) {
  return (
    <ul className="space-y-1 text-xs">
      {rows.map(({ id, name, productive }) => {
        const contents = (
          <>
            <span className="min-w-0 truncate" title={name}>
              {name}
            </span>
            <span className="h-2.5 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-sm bg-[#e3062c]"
                style={{ width: `${(productive / max) * 100}%` }}
              />
            </span>
            <strong className="text-right tabular-nums">
              {productive.toLocaleString("pt-BR")}
            </strong>
          </>
        );
        const rowClass =
          "grid w-full grid-cols-[minmax(0,1fr)_minmax(40px,1fr)_minmax(2.4em,auto)] items-center gap-2 px-2 py-1 text-left";
        return (
          <li key={id}>
            {onTechnician ? (
              <button
                type="button"
                className={`${rowClass} rounded hover:bg-muted focus-visible:outline`}
                aria-label={`Ver técnico ${name}`}
                onClick={() => onTechnician(id)}
              >
                {contents}
              </button>
            ) : (
              <div className={rowClass}>{contents}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
