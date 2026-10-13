import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  aggregate,
  applyStatus,
  qqQualifiedCategories,
  qqFrontMatches,
  qqMonthlyInfo,
  stat,
  tcRule,
  tcProjectionFor,
  type QQRecord,
  type TCRecord,
  type TCResult,
} from "@/lib/quality-math";
import { normalizeLogin, validQualityName, type QualityLogin } from "@/lib/quality-directory";
import { prepareTCProjection } from "@/lib/quality-projection";
import type { TCProjectionPlans } from "@/lib/quality-projection";
import { exportQualityCSV } from "@/lib/quality-export";
import { Input } from "@/components/ui/input";
import { formatNumber, formatPercent, monthLabel } from "@/lib/quality-format";
const fronts = [
  ["ND", "Novos domicílios"],
  ["PME", "PME"],
  ["MIG", "Migração"],
  ["ME", "Mudança de endereço"],
] as const;
const categories = ["Infra Claro Tec", "TEC1", "Tubulação", "Contato Cliente", "GEO", "Baixa100"];
function groups<T>(rows: T[], key: (row: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    let bucket = map.get(value);
    if (!bucket) {
      bucket = [];
      map.set(value, bucket);
    }
    bucket.push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
}
export function MetricCard({
  label,
  value,
  detail,
  tone = "red",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "red" | "green" | "orange" | "neutral";
}) {
  return (
    <div className={`quality-card quality-metric quality-${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function Evolution({
  title,
  data,
  target,
  higher = false,
  percent = true,
  onSelect,
}: {
  title: string;
  data: Array<{ label: string; value: number | null }>;
  target: number;
  higher?: boolean;
  percent?: boolean;
  onSelect?: (label: string) => void;
}) {
  return (
    <section className="quality-card min-w-0">
      <h3 className="font-bold">{title}</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Meta {higher ? "≥" : "≤"} {percent ? formatPercent(target) : formatNumber(target)}
      </p>
      {!data.length ? (
        <p className="py-12 text-center text-muted-foreground">Sem dados no recorte.</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.map((row) => ({
                ...row,
                value: row.value == null ? null : row.value * (percent ? 100 : 1),
              }))}
              margin={{ left: 0, right: 8, top: 10, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={46}
                tickFormatter={(v) => `${v}${percent ? "%" : ""}`}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                  color: "var(--foreground)",
                }}
                formatter={(value) => `${formatNumber(Number(value), 2)}${percent ? "%" : ""}`}
              />
              <ReferenceLine
                y={target * (percent ? 100 : 1)}
                stroke="#f59e0b"
                strokeDasharray="5 5"
              />
              <Bar
                dataKey="value"
                name={title}
                radius={[5, 5, 0, 0]}
                maxBarSize={50}
                onClick={(row) => onSelect?.(String(row.label))}
              >
                {data.map((row, i) => (
                  <Cell
                    key={i}
                    cursor={onSelect ? "pointer" : "default"}
                    fill={
                      row.value == null
                        ? "#94a3b8"
                        : (higher ? row.value >= target : row.value <= target)
                          ? "#16a36b"
                          : "#f0445c"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
function EmptyBase() {
  return (
    <div className="quality-card py-20 text-center">
      <h2 className="text-lg font-bold">Nenhuma base importada</h2>
      <p className="mt-2 text-muted-foreground">Importe o arquivo correspondente</p>
    </div>
  );
}
function QQOrders({
  title,
  records,
  onClose,
}: {
  title: string;
  records: QQRecord[] | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <Dialog
      open={!!records}
      onOpenChange={(open) => {
        if (!open) {
          setPage(0);
          onClose();
        }
      }}
    >
      <DialogContent className="quality-dialog max-w-6xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {records?.length ?? 0} O.S. da origem. Contribuição qualificada com o rateio e exclusões
          originais.
        </DialogDescription>
        <div className="max-h-[60vh] overflow-auto">
          <table className="quality-table">
            <thead>
              <tr>
                {[
                  "Data",
                  "Login",
                  "Contrato",
                  "O.S. / WO",
                  "Baixa",
                  "Categoria original",
                  "Responsável",
                  "Contribuição QQ",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records?.slice(page * 100, page * 100 + 100).map((r, i) => (
                <tr key={i}>
                  <td>{r.d.split("-").reverse().join("/")}</td>
                  <td>{r.lt}</td>
                  <td>{r.contract}</td>
                  <td>
                    {r.os} / {r.wo}
                  </td>
                  <td>{r.baixa}</td>
                  <td>{r.rawCategory}</td>
                  <td>{r.responsible}</td>
                  <td>{formatNumber(stat([r]).q, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={(page + 1) * 100 >= (records?.length ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function QQMetrics({
  records,
  general,
  index,
  front,
  onFrontChange,
  locked = false,
}: {
  records: QQRecord[];
  general: boolean;
  index: Map<string, QualityLogin>;
  front: string;
  onFrontChange: (front: string) => void;
  locked?: boolean;
}) {
  const [metric, setMetric] = useState<"q" | "b">("q"),
    [loginView, setLoginView] = useState(false),
    [detail, setDetail] = useState<{ title: string; rows: QQRecord[] } | null>(null);
  const rows = useMemo(
    () => (general ? records : records.filter((r) => qqFrontMatches(r, front))),
    [records, general, front],
  );
  const result = useMemo(() => stat(rows), [rows]),
    goal = front === "MIG" ? (metric === "q" ? 0.115 : 0.3) : metric === "q" ? 0.07 : 0.2;
  const name = (login: string) =>
    validQualityName(index.get(normalizeLogin(login))?.full_name, login) || "Nome não localizado";
  const open = (title: string, rows: QQRecord[]) => setDetail({ title, rows });
  const trend = (key: (row: QQRecord) => string) =>
    groups(rows, key).map(([label, items]) => ({
      label,
      value: metric === "q" ? stat(items).pq : stat(items).pb,
    }));
  const logins = useMemo(
    () =>
      groups(rows, (r) => r.lt)
        .map(([login, items]) => ({ login, rows: items, ...stat(items) }))
        .sort((a, b) => b.q - a.q),
    [rows],
  );
  const units = useMemo(() => groups(rows, (r) => r.un), [rows]);
  if (!records.length) return <EmptyBase />;
  return (
    <div className="space-y-5">
      {!general && (
        <fieldset
          disabled={locked}
          className="flex flex-wrap justify-between gap-3"
          data-slides-locked
        >
          <div className="flex flex-wrap gap-2">
            {fronts.map(([key, label]) => (
              <Button
                key={key}
                variant={key === front ? "default" : "outline"}
                onClick={() => onFrontChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant={!loginView ? "default" : "outline"}
              onClick={() => setLoginView(false)}
            >
              Painel
            </Button>
            <Button variant={loginView ? "default" : "outline"} onClick={() => setLoginView(true)}>
              Por login
            </Button>
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Agendas no recorte"
          value={formatNumber(result.n)}
          detail="Todas as O.S. válidas do período"
          tone="neutral"
        />
        <MetricCard
          label="Quebra de agenda"
          value={formatPercent(result.pb)}
          detail={`${formatNumber(result.b)} O.S. com quebra`}
        />
        <MetricCard
          label="Quebra qualificada"
          value={formatPercent(result.pq)}
          detail={`${formatNumber(result.q, 2)} contribuições / ${formatNumber(result.n)} agendas`}
          tone="orange"
        />
        <MetricCard
          label="Logins no recorte"
          value={formatNumber(logins.length)}
          detail="Agrupamento por login, não pelo nome"
          tone="green"
        />
      </div>
      {general ? (
        <>
          <section className="quality-card">
            <h3 className="mb-4 text-lg font-bold">Visão geral por unidade e frente</h3>
            <div className="overflow-auto">
              <table className="quality-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    {fronts.map(([key, label]) => (
                      <th key={key}>
                        {label}
                        <small className="block font-normal">
                          QQ / agendas · meta {formatPercent(key === "MIG" ? 0.115 : 0.07)}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {units.map(([unit, items]) => (
                    <tr key={unit}>
                      <td className="font-semibold">{unit || "Sem unidade"}</td>
                      {fronts.map(([key]) => {
                        const subset = items.filter((r) => (r.gf || r.f) === key),
                          info = stat(subset);
                        return (
                          <td key={key}>
                            <button
                              className={`quality-link ${info.pq > (key === "MIG" ? 0.115 : 0.07) ? "quality-bad" : "quality-good"}`}
                              onClick={() => open(`${unit} · ${key}`, subset)}
                            >
                              {formatPercent(info.pq)}
                              <small className="block text-muted-foreground">
                                {info.n} agendas
                              </small>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="quality-card">
            <h3 className="mb-4 text-lg font-bold">Evolução mensal da qualificada</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              As referências mensais Claro do HTML são mantidas somente quando a base e a assinatura
              correspondem exatamente.
            </p>
            <div className="overflow-auto">
              <table className="quality-table">
                <thead>
                  <tr>
                    <th>Unidade / frente</th>
                    {[...new Set(rows.map((r) => r.d.slice(0, 7)))].sort().map((month) => (
                      <th key={month}>{monthLabel(month)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {units.flatMap(([unit, items]) =>
                    fronts.map(([front]) => (
                      <tr key={`${unit}-${front}`}>
                        <td>
                          {unit} · {front}
                        </td>
                        {[...new Set(rows.map((r) => r.d.slice(0, 7)))].sort().map((month) => {
                          const subset = items.filter(
                              (r) => (r.gf || r.f) === front && r.d.startsWith(month),
                            ),
                            info = qqMonthlyInfo(subset);
                          return (
                            <td key={month}>
                              <button
                                className="quality-link"
                                title={`${info.references.length ? "Referência Claro. " : ""}Fonte: ${formatNumber(info.q, 2)} / ${info.n} agendas`}
                                onClick={() =>
                                  open(`${unit} · ${front} · ${monthLabel(month)}`, subset)
                                }
                              >
                                {formatPercent(info.pq)}
                                {info.references.length > 0 && (
                                  <span className="ml-1 text-amber-500">*</span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : loginView ? (
        <section className="quality-card">
          <h3 className="mb-4 font-bold">Contribuição por login</h3>
          <div className="max-h-[65vh] overflow-auto">
            <table className="quality-table">
              <thead>
                <tr>
                  {["Login / nome", "Supervisor", "Agendas", "Quebra", "QQ", "%QQ"].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logins.map((item) => (
                  <tr key={item.login}>
                    <td>
                      <button
                        className="quality-link text-left"
                        onClick={() => open(`${item.login} · ${name(item.login)}`, item.rows)}
                      >
                        {name(item.login)}
                        <small className="block text-muted-foreground">{item.login}</small>
                      </button>
                    </td>
                    <td>{index.get(normalizeLogin(item.login))?.supervisor || "Sem supervisor"}</td>
                    <td>{item.n}</td>
                    <td>{item.b}</td>
                    <td>{formatNumber(item.q, 2)}</td>
                    <td>{formatPercent(item.pq)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant={metric === "q" ? "default" : "outline"} onClick={() => setMetric("q")}>
              % Qualificada
            </Button>
            <Button variant={metric === "b" ? "default" : "outline"} onClick={() => setMetric("b")}>
              % Quebra
            </Button>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Evolution
              title="Evolução mensal"
              data={trend((r) => r.d.slice(0, 7))}
              target={goal}
              onSelect={(month) =>
                open(
                  monthLabel(month),
                  rows.filter((r) => r.d.startsWith(month)),
                )
              }
            />
            <Evolution
              title="Evolução semanal"
              data={trend((r) => `${r.d.slice(0, 7)} · S${r.w || "—"}`)}
              target={goal}
            />
          </div>
          <Evolution
            title="Evolução diária"
            data={trend((r) => r.d)}
            target={goal}
            onSelect={(day) =>
              open(
                `O.S. de ${day.split("-").reverse().join("/")}`,
                rows.filter((r) => r.d === day),
              )
            }
          />
          <section className="quality-card">
            <h3 className="mb-4 text-lg font-bold">Categorias da qualificada</h3>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className="rounded-xl border p-4 text-left hover:bg-accent transition-colors"
                  onClick={() =>
                    open(
                      cat,
                      rows.filter((r) => Number(qqQualifiedCategories(r)?.[cat] ?? 0) > 0),
                    )
                  }
                >
                  <span className="text-xs text-muted-foreground">{cat}</span>
                  <strong className="mt-2 block text-2xl text-primary">
                    {formatNumber(result.cat[cat] ?? 0, 2)}
                  </strong>
                  <small>{formatPercent(result.n ? (result.cat[cat] ?? 0) / result.n : NaN)}</small>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      <QQOrders
        title={detail?.title ?? "O.S."}
        records={detail?.rows ?? null}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
export function TCMetrics({
  records,
  contextRecords,
  allRecords,
  index,
  view,
  onViewChange: setView,
  plans,
  onPlansChange: setPlans,
  locked = false,
}: {
  records: TCRecord[];
  contextRecords: TCRecord[];
  allRecords: TCRecord[];
  index: Map<string, QualityLogin>;
  view: "result" | "daily";
  onViewChange: (view: "result" | "daily") => void;
  plans: TCProjectionPlans;
  onPlansChange: (plans: TCProjectionPlans) => void;
  locked?: boolean;
}) {
  const [metric, setMetric] = useState<"revisit" | "tec1" | "prod">("revisit"),
    [detail, setDetail] = useState<{ person: TCResult; metric: string; rows: TCRecord[] } | null>(
      null,
    );
  const currentMonth = useMemo(
    () =>
      [...new Set(allRecords.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`))]
        .sort()
        .at(-1) ?? "",
    [allRecords],
  );
  const currentRows = useMemo(
    () =>
      contextRecords.filter(
        (r) => `${r.year}-${String(r.month).padStart(2, "0")}` === currentMonth,
      ),
    [contextRecords, currentMonth],
  );
  const currentTech = useMemo(() => {
    const values = aggregate(currentRows);
    applyStatus(values);
    return new Map(values.map((row) => [row.loginText, row]));
  }, [currentRows]);
  const projection = useMemo(
    () => prepareTCProjection(allRecords, currentRows, currentMonth, plans[currentMonth]),
    [allRecords, currentRows, currentMonth, plans],
  );
  const result = useMemo(() => {
    const values = aggregate(records);
    applyStatus(values);
    return values.sort(
      (a, b) =>
        Number(currentTech.get(a.loginText)?.status ?? true) -
          Number(currentTech.get(b.loginText)?.status ?? true) || a.name.localeCompare(b.name),
    );
  }, [records, currentTech]);
  const evaluated = result.filter((row) => row.prod != null).length,
    certified = result.filter((row) => row.status).length;
  const months = useMemo(
    () =>
      [
        ...new Set(records.map((row) => `${row.year}-${String(row.month).padStart(2, "0")}`)),
      ].sort(),
    [records],
  );
  const days = useMemo(() => [...new Set(records.map((row) => row.day))].sort(), [records]);
  const monthly = useMemo(
    () =>
      new Map(
        months.map((month) => {
          const values = aggregate(
            records.filter((row) => `${row.year}-${String(row.month).padStart(2, "0")}` === month),
          );
          applyStatus(values);
          return [month, new Map(values.map((row) => [row.loginText, row]))];
        }),
      ),
    [months, records],
  );
  const monthlyScore = months.map((month) => {
    const values = [...(monthly.get(month)?.values() ?? [])],
      n = values.filter((row) => row.prod != null).length;
    return { label: month, value: n ? values.filter((row) => row.status).length / n : null };
  });
  const open = (person: TCResult, metric = "Todos", day = "") =>
    setDetail({
      person,
      metric,
      rows: records.filter(
        (r) =>
          r.login === person.loginText &&
          (!day || r.day === day) &&
          (metric !== "revisit" || Number(r.qr) !== 0) &&
          (metric !== "tec1" || Number(r.tnum) < Number(r.tden)),
      ),
    });
  const value = (row: TCResult, key: typeof metric) =>
    key === "prod" ? formatNumber(row.prod, 1) : formatPercent(row[key]);
  const good = (v: number | null, key: typeof metric) =>
    v != null && (key === "revisit" ? v < tcRule().rev : key === "tec1" ? v >= 0.95 : v >= 127);
  if (!records.length) return <EmptyBase />;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        {tcRule().label}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Certificação"
          value={formatPercent(evaluated ? certified / evaluated : null)}
          detail={`${certified} certificados / ${evaluated} avaliados · meta 75%`}
          tone="green"
        />
        <MetricCard
          label="Técnicos certificados"
          value={formatNumber(certified)}
          detail="Atendem simultaneamente aos 3 critérios"
          tone="green"
        />
        <MetricCard
          label="Não certificados"
          value={formatNumber(result.length - certified)}
          detail="Inclui indicadores indisponíveis"
        />
        <MetricCard
          label="Ordens no recorte"
          value={formatNumber(records.length)}
          detail="Deduplicação WO + login + fim do trabalho"
          tone="neutral"
        />
      </div>
      <div className="quality-tc-chart">
        <Evolution title="Certificação por competência" data={monthlyScore} target={0.75} higher />
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          onClick={() =>
            exportQualityCSV("tecnico_certificado.csv", [
              ["LOGIN", "NOME", "SUPERVISOR", "OS", "REVISITA", "TEC1", "PONTOS_DIA", "STATUS"],
              ...result.map((r) => [
                r.loginText,
                r.name,
                index.get(normalizeLogin(r.loginText))?.supervisor,
                r.os,
                r.revisit,
                r.tec1,
                r.prod,
                r.status ? "CERTIFICADO" : "NAO CERTIFICADO",
              ]),
            ])
          }
        >
          Exportar resultado
        </Button>
        <div className="flex gap-2">
          <Button
            variant={view === "result" ? "default" : "outline"}
            onClick={() => setView("result")}
            disabled={locked}
          >
            Resultado por técnico
          </Button>
          <Button
            variant={view === "daily" ? "default" : "outline"}
            onClick={() => setView("daily")}
            disabled={locked}
          >
            Matriz diária
          </Button>
        </div>
        {view === "daily" && (
          <div className="flex gap-2">
            {(["revisit", "tec1", "prod"] as const).map((key) => (
              <Button
                key={key}
                variant={metric === key ? "default" : "outline"}
                onClick={() => setMetric(key)}
              >
                {key === "revisit" ? "Revisita" : key === "tec1" ? "TEC1" : "Pontos/dia"}
              </Button>
            ))}
          </div>
        )}
      </div>
      <section className="quality-card">
        <h3 className="mb-4 text-lg font-bold">
          {view === "result" ? "Resultado por técnico" : "Matriz diária por técnico"}
        </h3>
        {view === "result" && (
          <details className={`mb-4 rounded-xl border p-4 ${locked ? "hidden" : ""}`}>
            <summary className="cursor-pointer text-sm font-semibold">
              Projeção · {monthLabel(currentMonth)} · base até {projection.loaded} ·{" "}
              {projection.workDays} dias previstos
            </summary>
            <p className="my-3 text-xs text-muted-foreground">
              Última competência da base, independente do filtro de meses. Cenário da sessão; não
              altera a certificação. Fechamento sugerido: fim da competência menos {projection.lag}{" "}
              dias de defasagem.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs">
                Data de referência
                <Input
                  type="date"
                  min={projection.loaded}
                  value={projection.reference}
                  onChange={(e) => {
                    if (e.target.value >= projection.loaded)
                      setPlans({
                        ...plans,
                        [currentMonth]: { ...plans[currentMonth], reference: e.target.value },
                      });
                  }}
                />
              </label>
              <label className="text-xs">
                Fechamento
                <Input
                  type="date"
                  value={projection.end}
                  onChange={(e) => {
                    if (e.target.value)
                      setPlans({
                        ...plans,
                        [currentMonth]: { ...plans[currentMonth], end: e.target.value },
                      });
                  }}
                />
              </label>
              <label className="text-xs">
                Dias de trabalho restantes
                <Input
                  type="number"
                  min={0}
                  max={projection.calendarDays}
                  value={projection.workDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    if (Number.isInteger(days) && days >= 0 && days <= projection.calendarDays)
                      setPlans({
                        ...plans,
                        [currentMonth]: { ...plans[currentMonth], workDays: days },
                      });
                  }}
                />
              </label>
            </div>
          </details>
        )}
        <div className="max-h-[70vh] overflow-auto">
          <table className={`quality-table ${view === "result" ? "quality-tc-compact" : ""}`}>
            <thead>
              <tr>
                <th>Técnico / login</th>
                <th>Supervisor</th>
                {view === "result" ? (
                  <>
                    <th>O.S.</th>
                    <th>Revisita</th>
                    <th>TEC1</th>
                    <th>Pontos/dia</th>
                    <th>Status</th>
                    <th>
                      Última competência
                      <small className="block font-normal">
                        {monthLabel(currentMonth)} · volume / status
                      </small>
                    </th>
                    <th>
                      Projeção / dia
                      <small className="block font-normal">
                        {projection.workDays} dias previstos
                      </small>
                    </th>
                    {months.map((month) => (
                      <th key={month}>{monthLabel(month)}</th>
                    ))}
                  </>
                ) : (
                  <>
                    <th>Período</th>
                    {days.map((day) => (
                      <th key={day}>
                        {day.slice(8)}/{day.slice(5, 7)}
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {result.map((person) => (
                <tr key={person.loginText}>
                  <td className="quality-tc-identity">
                    <button className="quality-link text-left" onClick={() => open(person)}>
                      <span className="block truncate" title={person.name}>
                        {person.name}
                      </span>
                      <small
                        className="block truncate text-muted-foreground"
                        title={`${person.loginText} · ${[...person.units].join(" / ")}`}
                      >
                        {person.loginText} · {[...person.units].join(" / ")}
                      </small>
                    </button>
                  </td>
                  <td>
                    {index.get(normalizeLogin(person.loginText))?.supervisor || "Sem supervisor"}
                  </td>
                  {view === "result" ? (
                    <>
                      <td>{person.os}</td>
                      {(["revisit", "tec1", "prod"] as const).map((key) => (
                        <td key={key}>
                          <button
                            className={`quality-link ${good(person[key], key) ? "quality-good" : "quality-bad"}`}
                            onClick={() => open(person, key)}
                          >
                            {value(person, key)}
                          </button>
                        </td>
                      ))}
                      <td>
                        <span
                          className={`quality-status ${person.status ? "quality-certified" : "quality-offender"}`}
                        >
                          {person.status ? "Certificado" : person.fails.join(" / ")}
                        </span>
                      </td>
                      <td>
                        {currentTech.has(person.loginText) ? (
                          <>
                            <strong>{currentTech.get(person.loginText)!.os} O.S.</strong>
                            <span
                              className={`ml-1 inline-block quality-status ${currentTech.get(person.loginText)!.status ? "quality-certified" : "quality-offender"}`}
                            >
                              {currentTech.get(person.loginText)!.status
                                ? "Certificado"
                                : currentTech.get(person.loginText)!.fails.join(" / ")}
                            </span>
                          </>
                        ) : (
                          "Sem dados"
                        )}
                      </td>
                      <td>
                        {(() => {
                          const current = currentTech.get(person.loginText);
                          if (!current) return "Sem dados";
                          const p = tcProjectionFor(current, projection);
                          return (
                            <div className="quality-tc-projection min-w-40 text-xs">
                              <p>REV: {formatNumber(p.revisit.daily)} WOs sem revisita</p>
                              <p>TEC1: {formatNumber(p.tec1.daily)} O.S. no padrão</p>
                              <p>
                                PROD: {formatNumber(p.prod.daily, 1)} pts · ≈{" "}
                                {formatNumber(p.prod.ordersPerDay)} WOs
                              </p>
                            </div>
                          );
                        })()}
                      </td>
                      {months.map((month) => {
                        const item = monthly.get(month)?.get(person.loginText);
                        return (
                          <td key={month}>
                            {item ? (
                              <div className="quality-tc-month-values">
                                <button
                                  className={`quality-link ${item.status ? "quality-good" : "quality-bad"}`}
                                  onClick={() =>
                                    setDetail({
                                      person: item,
                                      metric: monthLabel(month),
                                      rows: records.filter(
                                        (row) =>
                                          row.login === item.loginText &&
                                          `${row.year}-${String(row.month).padStart(2, "0")}` ===
                                            month,
                                      ),
                                    })
                                  }
                                >
                                  {item.status ? "Certificado" : item.fails.join(" / ")}
                                </button>
                                {(["revisit", "tec1", "prod"] as const).map((key) => (
                                  <button
                                    key={key}
                                    className={`quality-link text-xs ${good(item[key], key) ? "quality-good" : "quality-bad"}`}
                                    onClick={() =>
                                      setDetail({
                                        person: item,
                                        metric: `${monthLabel(month)} · ${key}`,
                                        rows: records.filter(
                                          (row) =>
                                            row.login === item.loginText &&
                                            `${row.year}-${String(row.month).padStart(2, "0")}` ===
                                              month &&
                                            (key !== "revisit" || Number(row.qr) !== 0) &&
                                            (key !== "tec1" || Number(row.tnum) < Number(row.tden)),
                                        ),
                                      })
                                    }
                                  >
                                    {key === "prod" ? "PTS" : key === "revisit" ? "REV" : "TEC1"}:{" "}
                                    {value(item, key)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <td>{value(person, metric)}</td>
                      {days.map((day) => {
                        const z = person.daily.get(day),
                          v = !z
                            ? null
                            : metric === "prod"
                              ? z.points
                              : metric === "tec1"
                                ? z.tden
                                  ? z.tnum / z.tden
                                  : null
                                : z.revBad + z.revGood
                                  ? z.revBad / (z.revBad + z.revGood)
                                  : null;
                        return (
                          <td
                            key={day}
                            className={
                              v == null
                                ? ""
                                : good(v, metric)
                                  ? "bg-emerald-500/10"
                                  : "bg-rose-500/10"
                            }
                          >
                            <button
                              className="quality-link"
                              onClick={() => open(person, metric, day)}
                            >
                              {metric === "prod" ? formatNumber(v) : formatPercent(v)}
                            </button>
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="quality-dialog max-w-6xl">
          <DialogTitle>
            {detail?.person.name} ·{" "}
            {detail?.metric === "Todos" ? "Composição dos indicadores" : detail?.metric}
          </DialogTitle>
          <DialogDescription>
            Competência por DATA_NOTA; produtividade e datas por FIM_TRABALHO. Em FTZ-DMV_01 a
            revisita conta retornos distintos por técnico no recorte.
          </DialogDescription>
          {detail && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-3 text-sm">
                  Revisita: {detail.person.revBad} / {detail.person.revBad + detail.person.revGood}{" "}
                  = {formatPercent(detail.person.revisit)}
                </div>
                <div className="rounded-xl border p-3 text-sm">
                  TEC1: {detail.person.tnum} / {detail.person.tden} ={" "}
                  {formatPercent(detail.person.tec1)}
                </div>
                <div className="rounded-xl border p-3 text-sm">
                  Pontos: {formatNumber(detail.person.points, 1)} / {detail.person.days.size} dias ={" "}
                  {formatNumber(detail.person.prod, 1)}
                </div>
              </div>
              <div className="max-h-[55vh] overflow-auto">
                <table className="quality-table">
                  <thead>
                    <tr>
                      {[
                        "Fim do trabalho",
                        "Competência",
                        "Contrato",
                        "WO",
                        "WO revisita",
                        "Revisita",
                        "TEC1 numerador / denominador",
                        "Pontos",
                        "Baixas",
                      ].map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.slice(0, 500).map((row, i) => (
                      <tr key={i}>
                        <td>{row.finish}</td>
                        <td>{row.noteAt as string}</td>
                        <td>{row.contract}</td>
                        <td>{row.wo}</td>
                        <td>{row.revisitWo}</td>
                        <td>{row.qr}</td>
                        <td>
                          {row.tnum} / {row.tden}
                        </td>
                        <td>{row.points}</td>
                        <td>{row.lowCodes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {detail.rows.length} ordens no detalhe · exibição das primeiras 500.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
