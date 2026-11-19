import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { nameKey } from "@/lib/quality-directory";
import { vtArea, vtSummaries, type VtClassified } from "@/lib/vt-revisitas";

export function VtRevisitasCharts({
  rows,
  onTechnician,
  onArea,
}: {
  rows: VtClassified[];
  onTechnician: (name: string) => void;
  onArea: (area: string, day: string) => void;
}) {
  if (!rows.length)
    return (
      <p className="rounded-xl border border-border p-6 text-muted-foreground">
        Sem ordens no recorte. Importe um XLSX ou ajuste os filtros.
      </p>
    );
  const daily = vtSummaries(rows, (row) => row.day).sort((a, b) => a.name.localeCompare(b.name));
  const ranking = vtSummaries(rows, (row) => row.technician).sort(
    (a, b) => b.productive - a.productive || a.name.localeCompare(b.name, "pt-BR"),
  );
  const areas = vtSummaries(rows, (row) => vtArea(row) || "Sem bairro")
    .filter((a) => a.revisits > 0 && a.name !== "Sem bairro")
    .sort((a, b) => b.revisits - a.revisits)
    .slice(0, 12);
  const counts = new Map<string, number>();
  for (const row of rows)
    if (row.revisited && row.neighborhood) {
      const key = `${vtArea(row)}:${row.day}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const missingArea = rows.filter((row) => row.revisited && !row.neighborhood).length;
  const maxHeat = Math.max(1, ...counts.values());
  const maxProductive = Math.max(1, ...ranking.map((a) => a.productive));
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section
        className="min-w-0 rounded-xl border border-border bg-card p-4 lg:col-span-3"
        aria-label="Evolução diária"
      >
        <h2 className="font-semibold">O.S. e revisitas por dia</h2>
        <p className="mb-4 text-xs text-muted-foreground">Dias com registros no recorte.</p>
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={daily.map((d) => ({ ...d, date: d.name.slice(8) + "/" + d.name.slice(5, 7) }))}
              margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  borderColor: "var(--border)",
                  borderRadius: 10,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="productive"
                isAnimationActive={false}
                maxBarSize={32}
                name="O.S. produtivas"
                fill="#cf1734"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="revisits"
                isAnimationActive={false}
                maxBarSize={32}
                name="Revisitas produtivas"
                fill="#7358c7"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="improductive"
                isAnimationActive={false}
                maxBarSize={32}
                name="O.S. improdutivas"
                fill="#d27b11"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expunged"
                name="Expurgadas"
                isAnimationActive={false}
                maxBarSize={32}
                fill="#168260"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section
        className="min-w-0 rounded-xl border border-border bg-card p-4 lg:col-span-2"
        aria-label="Produtividade por técnico"
      >
        <h2 className="font-semibold">O.S. produtivas por técnico</h2>
        <p className="mb-3 text-xs text-muted-foreground">Selecione um técnico para detalhar.</p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {ranking.map((item) => (
            <button
              key={nameKey(item.name)}
              type="button"
              onClick={() => onTechnician(item.name)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className="flex justify-between gap-2 text-xs">
                <span>{item.name}</span>
                <strong>{item.productive}</strong>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded bg-muted">
                <span
                  className="block h-full rounded bg-primary"
                  style={{ width: `${(item.productive / maxProductive) * 100}%` }}
                />
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        className="min-w-0 rounded-xl border border-border bg-card p-4 lg:col-span-5"
        aria-label="Mapa de calor de revisitas"
      >
        <h2 className="font-semibold">Mapa de calor · revisitas por bairro</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Até 12 bairros com mais revisitas produtivas. Clique em uma célula para abrir as ordens do
          local e do dia.
          {missingArea ? ` ${missingArea} revisita(s) sem bairro não aparecem aqui.` : ""}
        </p>
        {!areas.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma revisita produtiva com bairro identificado no recorte.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="min-w-36 text-left">Bairro</th>
                  {daily.map((d) => (
                    <th
                      key={d.name}
                      scope="col"
                      className="min-w-10 font-normal text-muted-foreground"
                    >
                      {d.name.slice(8)}/{d.name.slice(5, 7)}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.name}>
                    <th scope="row" className="text-left font-medium">
                      {area.name}
                    </th>
                    {daily.map((d) => {
                      const count = counts.get(`${area.name}:${d.name}`) ?? 0;
                      return (
                        <td key={d.name}>
                          {count ? (
                            <button
                              type="button"
                              onClick={() => onArea(area.name, d.name)}
                              aria-label={`${area.name}, ${d.name}: ${count} revisitas`}
                              className="h-8 w-full rounded-md font-bold text-white hover:brightness-125"
                              style={{
                                backgroundColor: `hsl(349 76% ${44 - (18 * count) / maxHeat}%)`,
                              }}
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="block rounded-md bg-muted py-2 text-muted-foreground">
                              0
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 font-bold">{area.revisits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
