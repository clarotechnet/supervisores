import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Clock3,
  FileUp,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { nameKey } from "@/lib/quality-directory";
import {
  classifyVtOrders,
  VT_CITIES,
  VT_IMPORT_LABELS,
  VT_SHEET_RULES,
  vtArea,
  vtAttendanceRoster,
  vtPayments,
  vtSeconds,
  vtSummaries,
  vtTime,
  type VtAttendance,
  type VtCity,
  type VtImportKind,
  type VtOrder,
  type VtPayment,
  type VtRules,
} from "@/lib/vt-revisitas";
import { readVtWorkbook } from "@/lib/vt-revisitas-xlsx";
import {
  readVtHistory,
  readVtPeriod,
  vtErrorMessage,
  vtHistoryKey,
  vtPeriodKey,
  writeVtPeriod,
} from "@/services/vt-revisitas";
import { VtRevisitasCharts } from "./VtRevisitasCharts";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const percentage = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const formatMoney = (value: number | null) => (value === null ? "—" : money.format(value / 100));
const formatDay = (value: string) => value.split("-").reverse().join("/");
const formatMonth = (value: string) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
const nowMonth = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
type Preview = {
  kind: VtImportKind;
  file: string;
  rows: VtOrder[] | VtAttendance[];
  duplicates: number;
  newRows: number;
  revision: number;
};
type View = "orders" | "charts" | "days" | "entries" | "payment";
const EMPTY_ORDERS: VtOrder[] = [];
const EMPTY_ATTENDANCE: VtAttendance[] = [];
const attendanceNotes: Record<NonNullable<VtPayment["attendanceIssue"]>, string> = {
  unmatched: "Sem vínculo com os arquivos importados.",
  ambiguous: "Mais de um técnico corresponde a este nome.",
  suggested: "Grafia diferente. Confira o cadastro sugerido.",
  duplicate: "O mesmo cadastro está ligado a mais de um nome de O.S.",
  incomplete: "Dias ou média de entrada ausentes ou conflitantes nos arquivos.",
};
const fieldClass = "h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const headerClass = "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold";
const cellClass = "whitespace-nowrap px-3 py-2.5 text-xs";

export function VtRevisitas() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState<VtCity>("fortaleza");
  const [month, setMonth] = useState(nowMonth);
  const [view, setView] = useState<View>("charts");
  const [tech, setTech] = useState("");
  const [area, setArea] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [rowLimit, setRowLimit] = useState(75);
  const [rulesByPeriod, setRulesByPeriod] = useState<Record<string, VtRules>>({});
  const [linksByPeriod, setLinksByPeriod] = useState<Record<string, Map<string, string>>>({});
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const importKind = useRef<VtImportKind>("orders");
  const opLock = useRef(false);
  const periodKey = vtPeriodKey(user?.id, city, month);
  const historyKey = vtHistoryKey(user?.id, city);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: periodKey,
    queryFn: ({ signal }) => readVtPeriod(city, month, signal),
    retry: false,
  });
  const history = useQuery({
    queryKey: historyKey,
    queryFn: ({ signal }) => readVtHistory(city, signal),
    retry: false,
  });
  const orders = data?.orders ?? EMPTY_ORDERS;
  const reviewed = reviewedRevision !== null && reviewedRevision === data?.revision;
  const days = data?.days ?? EMPTY_ATTENDANCE;
  const entries = data?.entries ?? EMPTY_ATTENDANCE;
  const closed = !!data?.closed_at;
  const editable = isAdmin && !closed && !busy && !isPending && !isFetching && !error;
  const scope = `${city}:${month}`;
  const links = linksByPeriod[scope];
  const rules = data?.snapshot?.rules ?? rulesByPeriod[scope] ?? VT_SHEET_RULES;
  const classified = useMemo(() => classifyVtOrders(orders), [orders]);
  const technicians = useMemo(
    () =>
      vtSummaries(classified, (r) => r.technician)
        .map((r) => r.name)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [classified],
  );
  const currentRows = useMemo(
    () =>
      classified.filter(
        (r) =>
          (!tech || nameKey(r.technician) === nameKey(tech)) &&
          (!area || vtArea(r) === area) &&
          (!dateFrom || r.day >= dateFrom) &&
          (!dateTo || r.day <= dateTo),
      ),
    [classified, tech, area, dateFrom, dateTo],
  );
  const detail = useMemo(
    () =>
      currentRows.filter(
        (r) =>
          (category === "all" ||
            (category === "productive" && r.productive) ||
            (category === "improductive" && r.improductive) ||
            (category === "revisit" && r.revisited) ||
            (category === "expunge" && r.expunged)) &&
          (!search ||
            nameKey(`${r.os} ${r.wo} ${r.contract} ${r.neighborhood} ${r.service}`).includes(
              nameKey(search),
            )),
      ),
    [currentRows, category, search],
  );
  const summary = useMemo(() => vtSummaries(currentRows, () => "Total")[0], [currentRows]);
  const roster = useMemo(() => vtAttendanceRoster(days, entries), [days, entries]);
  const payments = useMemo(
    () => data?.snapshot?.payments ?? vtPayments(classified, days, entries, rules, links),
    [data?.snapshot, classified, days, entries, rules, links],
  );
  const visiblePayments = payments.filter(
    (row) => !tech || nameKey(row.technician) === nameKey(tech),
  );
  const pendingCount = payments.filter((row) => row.total === null).length;
  const selectedPayment = tech ? visiblePayments[0] : undefined;
  const ready = payments.length > 0 && pendingCount === 0 && days.length > 0 && entries.length > 0;

  function clearFilters() {
    setTech("");
    setArea("");
    setDateFrom("");
    setDateTo("");
    setCategory("all");
    setSearch("");
    setRowLimit(75);
  }
  function changeScope(nextCity: VtCity, nextMonth: string) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    setCity(nextCity);
    setMonth(nextMonth);
    clearFilters();
    setReviewedRevision(null);
    setFeedback(undefined);
    setPreview(null);
  }
  function editRules<K extends keyof VtRules>(key: K, value: VtRules[K]) {
    setRulesByPeriod((all) => ({ ...all, [scope]: { ...rules, [key]: value } }));
    setReviewedRevision(null);
  }
  function setAttendanceLink(technician: string, id: string) {
    setLinksByPeriod((all) => {
      const next = new Map(all[scope]);
      if (id) next.set(nameKey(technician), id);
      else next.delete(nameKey(technician));
      return { ...all, [scope]: next };
    });
    setReviewedRevision(null);
  }
  const refresh = async () => {
    setReviewedRevision(null);
    await Promise.all([refetch(), history.refetch()]);
  };
  const chooseFile = (kind: VtImportKind) => {
    if (!editable) return;
    importKind.current = kind;
    fileInput.current?.click();
  };
  async function prepare(file: File, kind: VtImportKind) {
    if (!editable || opLock.current) return;
    opLock.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      const { rows, duplicates } = await readVtWorkbook(file, kind, city, month);
      const ids = new Set((data?.[kind] ?? []).map((row) => row.id));
      setPreview({
        kind,
        file: file.name,
        rows,
        duplicates,
        newRows: rows.filter((r) => !ids.has(r.id)).length,
        revision: data?.revision ?? 0,
      });
    } catch (e) {
      setFeedback({ ok: false, message: vtErrorMessage(e) });
    } finally {
      opLock.current = false;
      setBusy(false);
    }
  }
  async function write(
    kind: VtImportKind | "close",
    payload: unknown,
    revision = data?.revision ?? 0,
  ) {
    if (!editable || opLock.current) return;
    opLock.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      await writeVtPeriod({ city, period: `${month}-01`, revision }, kind, payload);
      setPreview(null);
      setClosing(false);
      setReviewedRevision(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: periodKey }),
        queryClient.invalidateQueries({ queryKey: historyKey }),
      ]);
      setFeedback({
        ok: true,
        message:
          kind === "close"
            ? "Competência fechada. Pagamentos e bases foram congelados."
            : "Importação concluída. As linhas com a mesma chave foram atualizadas sem duplicar.",
      });
    } catch (e) {
      setPreview(null);
      setClosing(false);
      setFeedback({ ok: false, message: vtErrorMessage(e) });
    } finally {
      opLock.current = false;
      setBusy(false);
    }
  }

  const counts = [
    ["O.S. produtivas", summary?.productive],
    ["Revisitas produtivas", summary?.revisits],
    [
      "Taxa de revisita",
      summary?.productive ? percentage.format(summary.revisits / summary.productive) : "—",
    ],
    ["O.S. improdutivas", summary?.improductive],
    ["Expurgadas", summary?.expunged],
  ] as const;
  return (
    <section className="space-y-4" aria-label="Revisitas da Visita técnica">
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void prepare(file, importKind.current);
        }}
      />
      <header className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revisitas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordens de serviço, indicadores por técnico e fechamento de pagamentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || isFetching} onClick={() => void refresh()}>
              <RefreshCw />
              Atualizar
            </Button>
            {isAdmin && (
              <Button disabled={!editable} onClick={() => chooseFile("orders")}>
                <FileUp />
                Importar O.S.
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="vt-city">Cidade</Label>
            <select
              id="vt-city"
              className={fieldClass}
              value={city}
              disabled={busy}
              onChange={(e) => changeScope(e.target.value as VtCity, month)}
            >
              {Object.entries(VT_CITIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="vt-month">Competência</Label>
            <Input
              id="vt-month"
              type="month"
              value={month}
              disabled={busy}
              onChange={(e) => changeScope(city, e.target.value)}
            />
          </div>
          {!!history.data?.length && (
            <div className="grid gap-1">
              <Label htmlFor="vt-history">Histórico</Label>
              <select
                id="vt-history"
                className={fieldClass}
                disabled={busy}
                value={history.data.some((h) => h.period.startsWith(month)) ? month : ""}
                onChange={(e) => changeScope(city, e.target.value)}
              >
                <option value="" disabled>
                  Selecione a competência
                </option>
                {history.data.map((h) => (
                  <option key={h.period} value={h.period.slice(0, 7)}>
                    {formatMonth(h.period)} · {h.closed_at ? "Fechado" : "Aberto"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {technicians.length > 0 && (
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="vt-tech">Técnico</Label>
              <select
                id="vt-tech"
                className={fieldClass}
                value={tech}
                onChange={(e) => {
                  setTech(e.target.value);
                  setRowLimit(75);
                }}
              >
                <option value="">Todos os técnicos</option>
                {technicians.map((name) => (
                  <option key={nameKey(name)}>{name}</option>
                ))}
              </select>
            </div>
          )}
          {!error && !isPending && (
            <span
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${closed ? "bg-muted text-foreground" : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"}`}
            >
              {closed ? (
                <LockKeyhole className="size-3.5" />
              ) : (
                <CalendarDays className="size-3.5" />
              )}
              {closed ? "Fechado" : "Aberto"}
            </span>
          )}
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          {vtErrorMessage(error)}
        </p>
      )}
      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-xl border p-3 text-sm ${feedback.ok ? "border-emerald-600/30 bg-emerald-600/5" : "border-destructive/40 bg-destructive/5"}`}
        >
          {feedback.message}
        </p>
      )}
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando a competência selecionada…
        </p>
      )}
      {!error && !isPending && (
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="charts">
              <ChartNoAxesCombined className="mr-1.5 size-4" />
              Gráficos
            </TabsTrigger>
            <TabsTrigger value="orders">
              <ClipboardList className="mr-1.5 size-4" />
              Ordens de serviço
            </TabsTrigger>
            <TabsTrigger value="days">
              <CalendarDays className="mr-1.5 size-4" />
              Dias trabalhados
            </TabsTrigger>
            <TabsTrigger value="entries">
              <Clock3 className="mr-1.5 size-4" />
              Média de entradas
            </TabsTrigger>
            <TabsTrigger value="payment">
              <Wallet className="mr-1.5 size-4" />
              Pagamentos
            </TabsTrigger>
          </TabsList>
          {(view === "orders" || view === "charts") && (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="vt-from">De</Label>
                  <Input
                    type="date"
                    id="vt-from"
                    min={`${month}-01`}
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setRowLimit(75);
                    }}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="vt-to">Até</Label>
                  <Input
                    type="date"
                    id="vt-to"
                    min={dateFrom || `${month}-01`}
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setRowLimit(75);
                    }}
                  />
                </div>
                <Button variant="ghost" onClick={clearFilters}>
                  Limpar filtros
                </Button>
                {area && (
                  <Button size="sm" variant="outline" onClick={() => setArea("")}>
                    <MapPin />
                    {area} · remover
                  </Button>
                )}
                {data?.sources.orders && (
                  <p className="self-center text-xs text-muted-foreground">
                    Último arquivo de O.S.: {data.sources.orders.file}
                    {classified[0]?.day ? ` · dados até ${formatDay(classified[0].day)}` : ""}
                  </p>
                )}
              </div>
              {dateTo && dateFrom && dateFrom > dateTo && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  A data final deve ser igual ou posterior à inicial.
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {counts.map(([label, value]) => (
                  <div className="rounded-xl border border-border bg-card p-4" key={label}>
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <strong className="mt-1 block text-2xl tabular-nums">
                      {typeof value === "number" ? number.format(value) : (value ?? "—")}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Taxa = revisitas produtivas ÷ O.S. produtivas. Expurgadas não somam revisita e podem
                permanecer na base de produtivas, como no Sheets.
              </p>
            </>
          )}
          <TabsContent value="charts" className="mt-4">
            <VtRevisitasCharts
              rows={currentRows}
              onTechnician={(name) => {
                setTech(name);
                setArea("");
                setCategory("all");
                setSearch("");
                setRowLimit(75);
                setView("orders");
              }}
              onArea={(name, day) => {
                setArea(name);
                setDateFrom(day);
                setDateTo(day);
                setCategory("revisit");
                setSearch("");
                setRowLimit(75);
                setView("orders");
              }}
            />
          </TabsContent>
          <TabsContent value="orders" className="mt-4 rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="grid gap-1">
                <Label htmlFor="vt-search">Buscar O.S., WO, contrato ou bairro</Label>
                <Input
                  id="vt-search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setRowLimit(75);
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="vt-category">Classificação</Label>
                <select
                  id="vt-category"
                  className={fieldClass}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setRowLimit(75);
                  }}
                >
                  <option value="all">Todas</option>
                  <option value="productive">Produtivas</option>
                  <option value="revisit">Revisitas produtivas</option>
                  <option value="improductive">Improdutivas</option>
                  <option value="expunge">Expurgadas</option>
                </select>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {number.format(detail.length)} registros
              </span>
            </div>
            {detail.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-muted-foreground">
                Nenhuma ordem encontrada para os filtros.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/60">
                    <tr>
                      {[
                        "Data",
                        "Técnico",
                        "O.S. / WO",
                        "Contrato",
                        "Bairro / município",
                        "Serviço",
                        "Código",
                        "Classificação",
                        "O.S. retorno",
                      ].map((x) => (
                        <th key={x} scope="col" className={headerClass}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.slice(0, rowLimit).map((r) => (
                      <tr className="border-b border-border/60" key={r.id}>
                        <td className={cellClass}>{formatDay(r.day)}</td>
                        <td className={cellClass}>{r.technician}</td>
                        <td className={cellClass}>{[r.os, r.wo].filter(Boolean).join(" / ")}</td>
                        <td className={cellClass}>{r.contract}</td>
                        <td className={cellClass}>
                          {r.neighborhood || "—"}
                          <small className="block text-muted-foreground">{r.municipality}</small>
                        </td>
                        <td className={`${cellClass} max-w-60 whitespace-normal`}>
                          {r.service || "—"}
                        </td>
                        <td className={cellClass} title={r.description}>
                          {r.code}
                        </td>
                        <td className={cellClass}>
                          {r.expunged
                            ? "Expurgada"
                            : r.revisited
                              ? "Revisita produtiva"
                              : r.improductive
                                ? "Improdutiva"
                                : "Produtiva"}
                        </td>
                        <td className={cellClass}>{r.returnOs || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detail.length > rowLimit && (
              <div className="p-3">
                <Button variant="outline" onClick={() => setRowLimit((n) => n + 75)}>
                  Mostrar mais registros
                </Button>
              </div>
            )}
          </TabsContent>
          {(["days", "entries"] as const).map((kind) => (
            <TabsContent
              value={kind}
              key={kind}
              className="mt-4 rounded-xl border border-border bg-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="font-semibold">{VT_IMPORT_LABELS[kind]}</h2>
                  <p className="text-xs text-muted-foreground">
                    {data?.sources[kind]
                      ? `Último arquivo: ${data.sources[kind]?.file}`
                      : `XLSX acumulado da competência com Técnico ou Login e ${VT_IMPORT_LABELS[kind]}.`}
                  </p>
                </div>
                {isAdmin && (
                  <Button variant="outline" disabled={!editable} onClick={() => chooseFile(kind)}>
                    <FileUp />
                    Importar XLSX
                  </Button>
                )}
              </div>
              {data?.[kind].length ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/60">
                      <tr>
                        {["Técnico", "Login", VT_IMPORT_LABELS[kind]].map((x) => (
                          <th key={x} className={headerClass} scope="col">
                            {x}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data[kind]
                        .filter((r) => {
                          if (!tech) return true;
                          const linkedId =
                            kind === "days"
                              ? selectedPayment?.attendance?.dayId
                              : selectedPayment?.attendance?.entryId;
                          if (
                            linkedId &&
                            selectedPayment?.attendanceIssue !== "suggested" &&
                            selectedPayment?.attendanceIssue !== "duplicate"
                          )
                            return r.id === linkedId;
                          return (
                            nameKey(r.technician) === nameKey(tech) || r.login === nameKey(tech)
                          );
                        })
                        .sort((a, b) => a.technician.localeCompare(b.technician, "pt-BR"))
                        .map((r) => (
                          <tr className="border-b border-border/60" key={r.id}>
                            <td className={cellClass}>{r.technician}</td>
                            <td className={cellClass}>{r.login || "—"}</td>
                            <td className={cellClass}>
                              {kind === "days" ? number.format(r.value) : vtTime(r.value)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 pb-5 text-sm text-muted-foreground">
                  Nenhum arquivo desse tipo foi importado nesta competência.
                </p>
              )}
            </TabsContent>
          ))}
          <TabsContent value="payment" className="mt-4 space-y-4">
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    Pagamentos · {VT_CITIES[city]} · {formatMonth(month)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {closed
                      ? "Histórico congelado. Os valores não são recalculados."
                      : "Prévia da competência inteira. O filtro de técnico só muda a visualização."}
                  </p>
                </div>
                {isAdmin && !closed && (
                  <Button
                    disabled={!editable || !ready || !reviewed}
                    onClick={() => setClosing(true)}
                  >
                    <LockKeyhole />
                    Fechar período
                  </Button>
                )}
              </div>
              {closed && data?.closed_at && (
                <p className="mt-2 text-xs">
                  Fechado em{" "}
                  {new Date(data.closed_at).toLocaleString("pt-BR", {
                    timeZone: "America/Fortaleza",
                  })}
                  .
                </p>
              )}
              {!closed && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {pendingCount
                    ? `${pendingCount} técnico(s) com pendências de vínculo ou de dados. Confira as indicações na tabela antes de fechar.`
                    : ready
                      ? "Dados completos para revisão."
                      : "Importe as O.S., os dias trabalhados e a média de entradas antes de fechar."}
                </p>
              )}
              <details className="mt-3 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Regras de pagamento {closed ? "· congeladas" : "· confira antes de fechar"}
                </summary>
                {!closed && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valores iniciais da aba Pagamento estudada. Ajuste e confirme a regra desta
                    cidade antes de fechar. Os ajustes desta prévia são salvos no fechamento.
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {(
                    [
                      ["dailyCents", "Valor do dia (R$)", 100],
                      ["maxDays", "Limite de dias", 1],
                      ["maxBaseCents", "Teto da base (R$)", 100],
                      ["discountFrom", "Descontar a partir de", 1],
                      ["discountCents", "Desconto por revisita (R$)", 100],
                      ["bonusOrders", "O.S. mínimas para bônus", 1],
                      ["bonusCents", "Bônus (R$)", 100],
                    ] as const
                  ).map(([key, label, scale]) => (
                    <label key={key} className="grid gap-1 text-xs font-medium">
                      {label}
                      <Input
                        type="number"
                        min={0}
                        max={key === "maxDays" ? 31 : 100000}
                        step={1 / scale}
                        value={rules[key] / scale}
                        disabled={!editable}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isFinite(value) &&
                            value >= 0 &&
                            value <= (key === "maxDays" ? 31 : 100000)
                          )
                            editRules(key, Math.round(value * scale));
                        }}
                      />
                    </label>
                  ))}
                  <label className="grid gap-1 text-xs font-medium">
                    Média de entrada até
                    <Input
                      type="time"
                      value={vtTime(rules.entryLimit).slice(0, 5)}
                      disabled={!editable}
                      onChange={(e) => {
                        const seconds = vtSeconds(e.target.value);
                        if (seconds !== null) editRules("entryLimit", seconds);
                      }}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Exceção de horário (opcional)
                    <select
                      className={fieldClass}
                      value={rules.exception}
                      disabled={!editable}
                      onChange={(e) => editRules("exception", e.target.value)}
                    >
                      <option value="">Nenhum técnico</option>
                      {technicians.map((name) => (
                        <option key={nameKey(name)}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Horário da exceção
                    <Input
                      type="time"
                      value={vtTime(rules.exceptionLimit).slice(0, 5)}
                      disabled={!editable || !rules.exception}
                      onChange={(e) => {
                        const seconds = vtSeconds(e.target.value);
                        if (seconds !== null) editRules("exceptionLimit", seconds);
                      }}
                    />
                  </label>
                </div>
              </details>
              {isAdmin && !closed && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) =>
                      setReviewedRevision(e.target.checked ? (data?.revision ?? null) : null)
                    }
                    disabled={!editable || !ready}
                  />
                  Conferi as regras e os resultados desta cidade.
                </label>
              )}
            </section>
            <section className="overflow-x-auto rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                <h2 className="font-semibold">Pagamento por técnico</h2>
                <div className="text-xs text-muted-foreground">
                  {visiblePayments.length} técnico(s) ·{" "}
                  {visiblePayments.length > 0 && visiblePayments.every((row) => row.total !== null)
                    ? formatMoney(visiblePayments.reduce((sum, row) => sum + (row.total ?? 0), 0))
                    : "Total não disponível"}
                </div>
              </div>
              {visiblePayments.length ? (
                <table className="w-full">
                  <thead className="bg-muted/60">
                    <tr>
                      {[
                        "Técnico",
                        "O.S. produtivas",
                        "Revisitas",
                        "Dias",
                        "Média entrada",
                        "Base",
                        "Desconto",
                        "Bônus",
                        "Pagamento final",
                      ].map((x) => (
                        <th key={x} scope="col" className={headerClass}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((r) => (
                      <tr key={nameKey(r.technician)} className="border-b border-border/60">
                        <td className={cellClass}>
                          <div>{r.technician}</div>
                          {r.attendance && (
                            <div className="mt-1 text-muted-foreground">
                              {r.attendance.name}
                              {r.attendance.login && ` · ${r.attendance.login}`}
                            </div>
                          )}
                          {!closed && r.attendanceIssue && (
                            <p className="mt-1 whitespace-normal text-muted-foreground">
                              {attendanceNotes[r.attendanceIssue]}
                            </p>
                          )}
                          {!closed && isAdmin && r.attendanceIssue && roster.length > 0 && (
                            <select
                              className={`${fieldClass} mt-2 w-full max-w-72 text-xs`}
                              aria-label={`Vincular ${r.technician}`}
                              disabled={!editable}
                              value=""
                              onChange={(event) => {
                                if (event.target.value)
                                  setAttendanceLink(r.technician, event.target.value);
                              }}
                            >
                              <option value="" disabled>
                                {r.attendanceIssue === "suggested"
                                  ? "Confirmar cadastro…"
                                  : "Selecionar cadastro…"}
                              </option>
                              {roster.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                  {person.login && ` · ${person.login}`}
                                </option>
                              ))}
                            </select>
                          )}
                          {!closed && isAdmin && links?.has(nameKey(r.technician)) && (
                            <button
                              type="button"
                              disabled={!editable}
                              className="mt-1 block text-muted-foreground underline disabled:opacity-50"
                              onClick={() => setAttendanceLink(r.technician, "")}
                            >
                              Desfazer vínculo manual
                            </button>
                          )}
                        </td>
                        <td className={cellClass}>{r.productive}</td>
                        <td className={cellClass}>{r.revisits}</td>
                        <td className={cellClass}>{r.days ?? "—"}</td>
                        <td className={cellClass}>{r.entry === null ? "—" : vtTime(r.entry)}</td>
                        <td className={cellClass}>{formatMoney(r.base)}</td>
                        <td className={cellClass}>{formatMoney(r.discount)}</td>
                        <td className={cellClass}>{formatMoney(r.bonus)}</td>
                        <td className={`${cellClass} font-bold`}>
                          {r.total === null ? "Pendente" : formatMoney(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 pb-5 text-sm text-muted-foreground">
                  Não há técnicos com O.S. produtivas no recorte.
                </p>
              )}
            </section>
          </TabsContent>
        </Tabs>
      )}
      <AlertDialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferir importação</AlertDialogTitle>
            <AlertDialogDescription>
              {preview && (
                <>
                  {VT_IMPORT_LABELS[preview.kind]} · {VT_CITIES[city]} · {formatMonth(month)}. O
                  arquivo {preview.file} tem {preview.rows.length} registros válidos,{" "}
                  {preview.newRows} novos e {preview.rows.length - preview.newRows} já cadastrados.{" "}
                  {preview.duplicates
                    ? `${preview.duplicates} linha(s) idêntica(s) no arquivo foram ignoradas.`
                    : "As chaves existentes serão atualizadas."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              disabled={busy || !editable || !preview}
              onClick={() => {
                if (preview)
                  void write(
                    preview.kind,
                    { file: preview.file, rows: preview.rows },
                    preview.revision,
                  );
              }}
            >
              Confirmar importação
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={closing}
        onOpenChange={(open) => {
          if (!busy) setClosing(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fechar {formatMonth(month)} · {VT_CITIES[city]}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O sistema vai congelar as entradas e o pagamento de {payments.length} técnico(s),
              mesmo que haja filtro na tela. A competência não aceitará novas importações nem
              alterações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              disabled={busy || !editable || !ready || !reviewed}
              onClick={() => void write("close", { rules, payments })}
            >
              Confirmar fechamento
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
