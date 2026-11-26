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
import { qualityKeys } from "@/hooks/useQualityLoading";
import { useVtAttendanceLinks } from "@/hooks/useVtAttendanceLinks";
import { nameKey, type QualityLogin } from "@/lib/quality-directory";
import {
  classifyVtOrders,
  prepareVtOrderImport,
  VT_CITIES,
  VT_IMPORT_LABELS,
  VT_SHEET_RULES,
  vtFilterOrderDetails,
  vtOrderServiceOptions,
  vtSeconds,
  vtTeamPayments,
  vtTeamScope,
  vtTime,
  type VtAttendance,
  type VtCity,
  type VtImportKind,
  type VtOrder,
  type VtPayment,
  type VtRules,
} from "@/lib/vt-revisitas";
import {
  vtChartMetrics,
  vtChartModel,
  vtMonthEnd,
  type VtOrderMetric,
} from "@/lib/vt-revisitas-charts";
import { vtMapArea, type VtHeatArea } from "@/lib/vt-revisitas-geography";
import { readVtWorkbook } from "@/lib/vt-revisitas-xlsx";
import { fetchQualityDirectory } from "@/services/quality";
import {
  readVtHistory,
  readVtPeriod,
  vtErrorMessage,
  vtHistoryKey,
  vtPeriodKey,
  writeVtPeriod,
} from "@/services/vt-revisitas";
import { VtRevisitasCharts } from "./VtRevisitasCharts";
import { VtRevisitasOrders } from "./VtRevisitasOrders";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
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
  pendingLines: number[];
  fromSheet: boolean;
  newRows: number;
  retainedClassifications: number;
  revision: number;
};
type View = "orders" | "charts" | "days" | "entries" | "payment";
const EMPTY_ORDERS: VtOrder[] = [];
const EMPTY_ATTENDANCE: VtAttendance[] = [];
const EMPTY_DIRECTORY: QualityLogin[] = [];
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
const kpiClass = "min-w-0 rounded-xl border p-3";

export function VtRevisitas() {
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState<VtCity>("fortaleza");
  const [month, setMonth] = useState(nowMonth);
  const [view, setView] = useState<View>("charts");
  const [tech, setTech] = useState("");
  const [area, setArea] = useState<VtHeatArea | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orderMetric, setOrderMetric] = useState<VtOrderMetric>("all");
  const category = orderMetric === "revisit-rate" ? "revisit" : orderMetric;
  const [search, setSearch] = useState("");
  const [service, setService] = useState("");
  const [rowLimit, setRowLimit] = useState(75);
  const [rulesByPeriod, setRulesByPeriod] = useState<Record<string, VtRules>>({});
  const { links, setLink, hasUnsavedLinks } = useVtAttendanceLinks(user?.id, city, month);
  const [reviewedRevision, setReviewedRevision] = useState<{
    revision: number;
    directoryAt: number;
    links: ReadonlyMap<string, string>;
  } | null>(null);
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
  const directoryUser = profile?.id ?? user?.id;
  const directory = useQuery({
    queryKey: qualityKeys.directory(directoryUser),
    enabled: !!directoryUser,
    queryFn: ({ signal }) => fetchQualityDirectory(signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const orders = data?.orders ?? EMPTY_ORDERS;
  const reviewed =
    reviewedRevision?.revision === data?.revision &&
    reviewedRevision?.directoryAt === directory.dataUpdatedAt &&
    reviewedRevision?.links === links;
  const days = data?.days ?? EMPTY_ATTENDANCE;
  const entries = data?.entries ?? EMPTY_ATTENDANCE;
  const closed = !!data?.closed_at;
  const editable = isAdmin && !closed && !busy && !isPending && !isFetching && !error;
  const scope = `${city}:${month}`;
  const rules = data?.snapshot?.rules ?? rulesByPeriod[scope] ?? VT_SHEET_RULES;
  const classified = useMemo(() => classifyVtOrders(orders), [orders]);
  const directoryEntries = directory.isSuccess ? directory.data : EMPTY_DIRECTORY;
  const team = useMemo(
    () => vtTeamScope(classified, directoryEntries, city, links),
    [classified, directoryEntries, city, links],
  );
  const activeTech = team.members.find((person) => person.login === tech);
  const techLogin = activeTech?.login ?? "";
  const currentRows = useMemo(
    () =>
      team.rows.filter(
        (r) =>
          (!techLogin || r.technicianLogin === techLogin) &&
          (!area || vtMapArea(r)?.key === area.key) &&
          (!dateFrom || r.day >= dateFrom) &&
          (!dateTo || r.day <= dateTo),
      ),
    [team.rows, techLogin, area, dateFrom, dateTo],
  );
  const serviceOptions = useMemo(() => vtOrderServiceOptions(currentRows), [currentRows]);
  const detail = useMemo(
    () => vtFilterOrderDetails(currentRows, { category, search, service }),
    [currentRows, category, search, service],
  );
  const chartModel = useMemo(
    () => vtChartModel(currentRows, classified, month, dateFrom, dateTo),
    [currentRows, classified, month, dateFrom, dateTo],
  );
  const teamAttendance = useMemo(
    () => ({ days: team.attendance(days), entries: team.attendance(entries) }),
    [team, days, entries],
  );
  const displayedAttendance = {
    days:
      closed && !techLogin
        ? days
        : teamAttendance.days.filter((r) => !techLogin || r.login === techLogin),
    entries:
      closed && !techLogin
        ? entries
        : teamAttendance.entries.filter((r) => !techLogin || r.login === techLogin),
  };
  const payments = useMemo(
    () => data?.snapshot?.payments ?? vtTeamPayments(team, days, entries, rules),
    [data?.snapshot, team, days, entries, rules],
  );
  const visiblePayments = payments.filter((row) => {
    if (!activeTech) return true;
    const login = row.login || row.attendance?.login;
    return login ? login === techLogin : nameKey(row.technician) === nameKey(activeTech.name);
  });
  const pendingCount = payments.filter((row) => row.total === null).length;
  const selectedPayment = techLogin ? visiblePayments[0] : undefined;
  const ready =
    directory.isSuccess && !directory.isFetching && payments.length > 0 && pendingCount === 0;

  function changeOrderMetric(next: VtOrderMetric) {
    setOrderMetric(next);
    setRowLimit(75);
  }
  function clearFilters() {
    setTech("");
    setArea(null);
    setDateFrom("");
    setDateTo("");
    changeOrderMetric("all");
    setSearch("");
    setService("");
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
    if (!editable) return;
    setLink(technician, id);
    setReviewedRevision(null);
  }
  const refresh = async () => {
    setReviewedRevision(null);
    await Promise.all([refetch(), history.refetch(), directory.refetch()]);
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
      const imported = await readVtWorkbook(file, kind, city, month);
      const { duplicates, pendingLines } = imported;
      let prepared: Pick<Preview, "rows" | "newRows" | "retainedClassifications">;
      if (imported.kind === "orders") {
        prepared = prepareVtOrderImport(orders, imported.rows);
      } else {
        const ids = new Set(data?.[imported.kind]?.map((row) => row.id));
        prepared = {
          rows: imported.rows,
          newRows: imported.rows.filter((row) => !ids.has(row.id)).length,
          retainedClassifications: 0,
        };
      }
      setPreview({
        ...prepared,
        kind,
        file: file.name,
        duplicates,
        pendingLines,
        fromSheet: imported.kind === "orders" && imported.fromSheet,
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
    if (!editable || opLock.current || (kind === "close" && (!ready || !reviewed))) return;
    opLock.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      if (kind === "close") {
        const fresh = await directory.refetch();
        if (
          !fresh.isSuccess ||
          (fresh.data !== directoryEntries &&
            JSON.stringify(fresh.data) !== JSON.stringify(directoryEntries))
        ) {
          throw Error("O cadastro de VT mudou ou está indisponível. Confira a prévia novamente.");
        }
      }
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

  const counts = vtChartMetrics(chartModel.total);
  const sheetRows = currentRows.filter((row) => row.sheetClassification).length;
  const orderDetails = (inCharts = false) => (
    <VtRevisitasOrders
      rows={detail}
      rowLimit={rowLimit}
      exportScope={{ city, month, technician: activeTech?.name ?? "" }}
      search={search}
      category={category}
      service={service}
      serviceOptions={serviceOptions}
      inCharts={inCharts}
      onSearch={(value) => {
        setSearch(value);
        setRowLimit(75);
      }}
      onCategory={changeOrderMetric}
      onService={(value) => {
        setService(value);
        setRowLimit(75);
      }}
      onMore={() => setRowLimit((n) => n + 75)}
    />
  );
  return (
    <section className="min-w-0 space-y-4" aria-label="Revisitas da Visita técnica">
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
            <Button
              variant="outline"
              disabled={busy || isFetching || directory.isFetching}
              onClick={() => void refresh()}
            >
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
          {team.members.length > 0 && (
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="vt-tech">Técnico</Label>
              <select
                id="vt-tech"
                className={`${fieldClass} max-w-full`}
                value={techLogin}
                onChange={(e) => {
                  setTech(e.target.value);
                  setRowLimit(75);
                }}
              >
                <option value="">Todos os técnicos VT</option>
                {team.members.map(({ login, name }) => (
                  <option key={login} value={login}>
                    {name} · {login}
                  </option>
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
      {!isPending && !error && !directory.isSuccess && (
        <p role={directory.isError ? "alert" : "status"} className="text-sm text-muted-foreground">
          {directory.isError
            ? "Não foi possível consultar o cadastro de Visita técnica. Clique em Atualizar para tentar novamente."
            : "Carregando os logins VT do cadastro de Supervisores…"}
        </p>
      )}
      {directory.isSuccess && !closed && team.members.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Nenhum login de Visita técnica cadastrado em {VT_CITIES[city]}. Confira o setor e a cidade
          em Técnico Certificado → Supervisores.
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
          {directory.isSuccess && (view === "orders" || view === "charts") && (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="vt-from">De</Label>
                  <Input
                    type="date"
                    id="vt-from"
                    min={`${month}-01`}
                    max={vtMonthEnd(month)}
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
                    max={vtMonthEnd(month)}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setArea(null);
                      changeOrderMetric("all");
                    }}
                  >
                    <MapPin />
                    {area.label} · remover
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
              <div
                data-vt-kpis
                className="mt-4 grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 8.25rem), 1fr))" }}
              >
                {counts.map(([label, value, metric]) => {
                  const content = (
                    <>
                      <span className="block text-xs font-medium text-muted-foreground">
                        {label}
                      </span>
                      <strong className="mt-1 block text-2xl tabular-nums">
                        {typeof value === "number" ? number.format(value) : (value ?? "—")}
                      </strong>
                    </>
                  );
                  if (view !== "orders") {
                    return (
                      <div className={`${kpiClass} border-border bg-card`} key={metric}>
                        {content}
                      </div>
                    );
                  }
                  const active = orderMetric === metric;
                  return (
                    <button
                      key={metric}
                      type="button"
                      className={`${kpiClass} text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active ? "border-primary bg-primary/10" : "border-border bg-card"
                      }`}
                      aria-pressed={active}
                      title={
                        metric === "revisit-rate"
                          ? "Filtrar as revisitas produtivas que compõem a taxa"
                          : undefined
                      }
                      onClick={() => changeOrderMetric(active ? "all" : metric)}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {view === "orders" && "Clique em um indicador para filtrar a tabela. "}
                Taxa = revisitas produtivas ÷ O.S. produtivas. Expurgadas não entram nas produtivas,
                improdutivas nem revisitas. Preventiva Indoor I segue a baixa e não gera revisita.
                Trocas de equipamento streaming não somam produtivas.
              </p>
              {classified.length > team.rows.length && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Só O.S. vinculadas à equipe VT entram nos indicadores. As demais podem compor o
                  histórico de retornos do contrato.
                </p>
              )}
              {team.pending.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {team.pending.size} técnico(s) VT com grafia a confirmar ficam fora dos
                  indicadores até revisar o vínculo em{" "}
                  <button type="button" onClick={() => setView("payment")} className="underline">
                    Pagamentos
                  </button>
                  .
                </p>
              )}
              {sheetRows > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {number.format(sheetRows)} O.S. do recorte têm classificação informada no XLSX do
                  Sheets. As regras do painel para preventivas e expurgos prevalecem.
                </p>
              )}
            </>
          )}
          <TabsContent value="charts" className="mt-4">
            {directory.isSuccess && (
              <VtRevisitasCharts
                model={chartModel}
                scope={{
                  city,
                  month,
                  technician: activeTech?.name ?? "",
                  area: area?.label ?? "",
                  daysWorked:
                    selectedPayment?.attendanceIssue === "suggested"
                      ? null
                      : (selectedPayment?.days ?? null),
                }}
                exportingDisabled={busy || isFetching}
                detail={activeTech || area ? orderDetails(true) : null}
                onTechnician={(login) => {
                  setTech(login);
                  changeOrderMetric(area ? "revisit" : "all");
                  setSearch("");
                  setService("");
                }}
                onArea={(selected) => {
                  setArea(selected);
                  changeOrderMetric("revisit");
                  setSearch("");
                  setService("");
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            {directory.isSuccess && orderDetails()}
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
              {displayedAttendance[kind].length ? (
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
                      {[...displayedAttendance[kind]]
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
                  {data?.[kind].length
                    ? "Nenhum registro vinculado à equipe VT no recorte."
                    : "Nenhum arquivo desse tipo foi importado nesta competência."}
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
                      : "Prévia dos logins de Visita técnica cadastrados nesta cidade. O filtro de técnico só muda a visualização."}
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
                  {!directory.isSuccess
                    ? "O fechamento exige acesso ao cadastro de Visita técnica."
                    : pendingCount
                      ? `${pendingCount} técnico(s) VT com pendências de vínculo ou de dados. Confira as indicações na tabela antes de fechar.`
                      : ready
                        ? "Dados completos para revisão."
                        : "São necessárias O.S. produtivas, dias e média de entrada dos técnicos VT para fechar."}
                </p>
              )}
              {!closed && hasUnsavedLinks && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  Não foi possível salvar os vínculos neste navegador. As alterações só valem
                  enquanto esta tela estiver aberta.
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
                      {closed &&
                        rules.exception &&
                        !team.members.some((r) => r.login === rules.exception) && (
                          <option value={rules.exception}>{rules.exception}</option>
                        )}
                      {team.members.map(({ login, name }) => (
                        <option key={login} value={login}>
                          {name} · {login}
                        </option>
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
                      setReviewedRevision(
                        e.target.checked && data
                          ? {
                              revision: data.revision,
                              directoryAt: directory.dataUpdatedAt,
                              links,
                            }
                          : null,
                      )
                    }
                    disabled={!editable || !ready}
                  />
                  Conferi as regras e os resultados desta cidade.
                </label>
              )}
            </section>
            <section className="min-w-0 rounded-xl border border-border bg-card">
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
                <div className="overflow-x-auto">
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
                        <tr
                          key={r.login ?? nameKey(r.technician)}
                          className="border-b border-border/60"
                        >
                          <td className="min-w-48 max-w-[21rem] px-3 py-2.5 text-xs">
                            <div>{r.technician}</div>
                            {r.attendance && (
                              <div className="mt-1 text-muted-foreground">
                                {r.attendance.name === r.technician
                                  ? r.attendance.login
                                  : [r.attendance.name, r.attendance.login]
                                      .filter(Boolean)
                                      .join(" · ")}
                              </div>
                            )}
                            {!closed && r.attendanceIssue && (
                              <p className="mt-1 whitespace-normal text-muted-foreground">
                                {attendanceNotes[r.attendanceIssue]}
                              </p>
                            )}
                            {!closed && isAdmin && r.login && (
                              <>
                                {[...(team.pending.get(r.login)?.values() ?? [])].map((alias) => (
                                  <label
                                    key={nameKey(alias)}
                                    className="mt-2 block text-muted-foreground"
                                  >
                                    Nome na O.S.: {alias}
                                    <select
                                      className={`${fieldClass} mt-1 block w-full max-w-72 text-xs`}
                                      aria-label={`Vincular ${alias}`}
                                      disabled={!editable}
                                      value=""
                                      onChange={(event) => {
                                        if (event.target.value)
                                          setAttendanceLink(alias, event.target.value);
                                      }}
                                    >
                                      <option value="" disabled>
                                        Confirmar cadastro VT…
                                      </option>
                                      <option value={`LOGIN:${r.login}`}>
                                        {r.technician} · {r.login}
                                      </option>
                                    </select>
                                  </label>
                                ))}
                                {[...(team.confirmed.get(r.login)?.values() ?? [])].map((alias) => (
                                  <button
                                    key={nameKey(alias)}
                                    type="button"
                                    disabled={!editable}
                                    className="mt-1 block text-muted-foreground underline disabled:opacity-50"
                                    onClick={() => setAttendanceLink(alias, "")}
                                  >
                                    Desfazer vínculo: {alias}
                                  </button>
                                ))}
                              </>
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
                </div>
              ) : (
                <p className="px-4 pb-5 text-sm text-muted-foreground">
                  Não há pagamentos de técnicos VT no recorte.
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
                  {preview.fromSheet && (
                    <span className="mt-2 block font-medium text-foreground">
                      Vamos usar Prod, Improd e Expurgadas do Sheets somente nas O.S. desta cidade e
                      competência. Nenhuma O.S. de outro período será alterada.
                    </span>
                  )}
                  {preview.retainedClassifications > 0 && (
                    <span className="mt-2 block font-medium text-foreground">
                      O.S. com classificação conferida que será mantida:{" "}
                      {preview.retainedClassifications}.
                    </span>
                  )}
                  {preview.pendingLines.length > 0 && (
                    <span className="mt-2 block font-medium text-foreground">
                      Sem baixa: {preview.pendingLines.length} linha(s) não serão importadas. Linhas{" "}
                      {preview.pendingLines.slice(0, 8).join(", ")}
                      {preview.pendingLines.length > 8 &&
                        ` e mais ${preview.pendingLines.length - 8}`}
                      . Reimporte essas ordens quando tiverem baixa na origem.
                    </span>
                  )}
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
