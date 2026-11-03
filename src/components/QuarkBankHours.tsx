import { useMemo, useState, type ComponentType } from "react";
import { AlertTriangle, Clock3, FileDown, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMinutes,
  personKey,
  resolvePersonCity,
  resolvePersonSector,
  type QuarkDay,
  type QuarkPersonView,
} from "@/lib/quark";
import {
  buildQuarkBankReport,
  quarkBankRowsForScope,
  quarkBankScopeLabels,
  type QuarkBankRow,
  type QuarkBankScope,
} from "@/lib/quark-bank-report";
import { createQuarkBankWorkbook, type QuarkBankExportContext } from "@/lib/quark-bank-export";

const localeDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
const longHours = (minutes: number) => {
  const absolute = Math.abs(Math.round(minutes));
  return `${minutes < 0 ? "-" : ""}${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, "0")}min`;
};

export function QuarkBankHours({
  people,
  days,
  context,
  loading = false,
}: {
  people: QuarkPersonView[];
  days: QuarkDay[];
  context: QuarkBankExportContext;
  loading?: boolean;
}) {
  const [scope, setScope] = useState<QuarkBankScope | null>(null);
  const [exporting, setExporting] = useState(false);
  const report = useMemo(() => buildQuarkBankReport(people, days), [people, days]);
  const rows = quarkBankRowsForScope(report, scope);
  const toggle = (next: QuarkBankScope) => setScope((current) => (current === next ? null : next));
  const showPositive = scope === null || scope === "positive" || scope === "top-positive";
  const showNegative = scope === null || scope === "negative" || scope === "top-negative";

  async function exportWorkbook() {
    if (exporting || loading) return;
    setExporting(true);
    try {
      const bytes = await createQuarkBankWorkbook(report, context, scope);
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `quark_banco_horas_${scope ?? "completo"}_${context.startDate}_a_${context.endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(
        scope
          ? "Excel do recorte selecionado exportado."
          : "Excel exportado com todos os recortes em abas separadas.",
      );
    } catch (error) {
      console.error("[Quark] Erro ao exportar banco de horas", error);
      toast.error("Não foi possível gerar o Excel do banco de horas. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores do banco de horas"
      >
        <HoursMetric
          label="Horas positivas"
          value={longHours(report.totalPositiveMinutes)}
          subtitle="Soma dos saldos positivos no período"
          icon={Clock3}
          active={scope === "positive"}
          onClick={() => toggle("positive")}
        />
        <HoursMetric
          label="Horas negativas"
          value={longHours(report.totalNegativeMinutes)}
          subtitle="Soma dos saldos negativos no período"
          icon={Clock3}
          danger
          active={scope === "negative"}
          onClick={() => toggle("negative")}
        />
        <HoursMetric
          label="Alertas acima de 2h/dia"
          value={String(report.alerts.length)}
          subtitle="Somente dias com mais de 120 minutos extras"
          icon={AlertTriangle}
          danger
          active={scope === "alerts"}
          onClick={() => toggle("alerts")}
        />
        <HoursMetric
          label="Colaboradores analisados"
          value={String(report.rows.length)}
          subtitle={`${days.length.toLocaleString("pt-BR")} registros válidos no período`}
          icon={Users}
          active={scope === "people"}
          onClick={() => toggle("people")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div aria-live="polite">
          <p className="text-sm font-semibold">
            {scope
              ? `Exibindo: ${quarkBankScopeLabels[scope]}`
              : "Exibindo: todos os dados do banco de horas"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope
              ? "A tabela e o Excel usam somente este recorte e os filtros da página."
              : "Clique em um KPI para focar. Sem seleção, o Excel inclui todos os recortes em abas separadas."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scope && (
            <Button type="button" variant="outline" size="sm" onClick={() => setScope(null)}>
              <X /> Limpar seleção do KPI
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void exportWorkbook()}
            disabled={exporting || loading}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
            {exporting
              ? "Gerando Excel..."
              : scope
                ? "Exportar recorte Excel"
                : "Exportar Excel completo"}
          </Button>
        </div>
      </div>

      {(showPositive || showNegative) && (
        <div className={`grid gap-4 ${showPositive && showNegative ? "xl:grid-cols-2" : ""}`}>
          {showPositive && (
            <BankRanking
              title="Maiores saldos positivos"
              kind="positive"
              rows={report.positive.slice(0, 10)}
              context={context}
              active={scope === "top-positive"}
              onClick={() => toggle("top-positive")}
            />
          )}
          {showNegative && (
            <BankRanking
              title="Maiores saldos negativos"
              kind="negative"
              rows={report.negative.slice(0, 10)}
              context={context}
              active={scope === "top-negative"}
              onClick={() => toggle("top-negative")}
            />
          )}
        </div>
      )}

      <section
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        aria-label="Dados do banco de horas"
      >
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-black">
            {scope === "alerts"
              ? "Dias com mais de 2 horas extras"
              : "Banco de horas por colaborador"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope === "alerts"
              ? `${report.alerts.length} alertas. Extras do dia = normais + noturnas + 100%. Dias com exatamente 2h não entram.`
              : `${rows.length} colaboradores, com ou sem moradia. Saldo = soma das movimentações entre ${localeDate(context.startDate)} e ${localeDate(context.endDate)}.`}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Cidade / setor</TableHead>
              <TableHead>Unidade / supervisor</TableHead>
              <TableHead>{scope === "alerts" ? "Dia do alerta" : "Último dia"}</TableHead>
              {scope === "alerts" && <TableHead>Extras do dia</TableHead>}
              <TableHead>Saldo no período</TableHead>
              {scope !== "alerts" && <TableHead>Extras no período</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {scope === "alerts"
              ? report.alerts.map(({ row, day, extras }) => (
                  <TableRow key={`${personKey(row.person)}:${day.work_date}`}>
                    <PersonCells person={row.person} />
                    <TableCell>{localeDate(day.work_date)}</TableCell>
                    <TableCell className="font-bold text-destructive">
                      {formatMinutes(extras)}
                    </TableCell>
                    <TableCell>
                      <BankBalance value={row.balance} />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow key={personKey(row.person)}>
                    <PersonCells person={row.person} />
                    <TableCell>{localeDate(row.latest.work_date)}</TableCell>
                    <TableCell>
                      <BankBalance value={row.balance} />
                    </TableCell>
                    <TableCell className="font-semibold">{formatMinutes(row.extras)}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {(scope === "alerts" ? !report.alerts.length : !rows.length) && (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Nenhum registro corresponde a este recorte nos filtros selecionados.
          </p>
        )}
      </section>
    </div>
  );
}

function PersonCells({ person }: { person: QuarkPersonView }) {
  return (
    <>
      <TableCell>
        <b>{person.full_name}</b>
        <small className="block text-muted-foreground">
          {person.registration || person.collaborator_id} · {person.job_title || "Sem função"}
        </small>
      </TableCell>
      <TableCell>
        {resolvePersonCity(person)}
        <small className="block text-muted-foreground">{resolvePersonSector(person)}</small>
      </TableCell>
      <TableCell>
        {person.unit_name}
        <small className="block text-muted-foreground">
          {person.directory?.supervisor || "Sem supervisor"}
        </small>
      </TableCell>
    </>
  );
}

function BankBalance({ value }: { value: number }) {
  return (
    <b
      className={
        value < 0
          ? "text-late-foreground"
          : value > 0
            ? "text-success-foreground"
            : "text-muted-foreground"
      }
    >
      {formatMinutes(value)}
    </b>
  );
}

function HoursMetric({
  label,
  value,
  subtitle,
  icon: Icon,
  danger = false,
  active,
  onClick,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border bg-card p-4 text-left shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"}`}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <strong
        className={`mt-2 block text-3xl font-black tracking-tight ${danger ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </strong>
      <span className="mt-2 block text-[10px] text-muted-foreground">{subtitle}</span>
    </button>
  );
}

function BankRanking({
  title,
  kind,
  rows,
  context,
  active,
  onClick,
}: {
  title: string;
  kind: "positive" | "negative";
  rows: QuarkBankRow[];
  context: QuarkBankExportContext;
  active: boolean;
  onClick: () => void;
}) {
  const maxBalance = Math.max(1, ...rows.map((row) => Math.abs(row.balance)));
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            Top 10
          </span>
          <h2 className="text-sm font-black">{title}</h2>
          <p className="text-[10px] text-muted-foreground">
            {kind === "positive" ? ">20h alerta · >40h crítico" : "Ordenado do menor saldo"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={active ? "secondary" : "outline"}
          aria-pressed={active}
          onClick={onClick}
        >
          Focar top 10 {kind === "positive" ? "positivos" : "negativos"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="grid grid-cols-[32px_minmax(0,1.5fr)_minmax(140px,1fr)_110px] gap-2 border-b border-border px-4 py-2 text-[9px] font-black uppercase text-muted-foreground">
            <span>#</span>
            <span>Colaborador</span>
            <span>Unidade / período</span>
            <span>Saldo</span>
          </div>
          {rows.map((row, index) => (
            <div
              key={personKey(row.person)}
              className="grid grid-cols-[32px_minmax(0,1.5fr)_minmax(140px,1fr)_110px] items-center gap-2 border-b border-border/80 px-4 py-3 last:border-0"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-secondary text-xs font-black">
                {index + 1}
              </span>
              <div className="min-w-0">
                <b className="block truncate text-[11px]" title={row.person.full_name}>
                  {row.person.full_name}
                </b>
                <small className="block truncate text-[9px] text-muted-foreground">
                  {resolvePersonSector(row.person)}
                </small>
              </div>
              <div className="min-w-0">
                <span className="block truncate text-[10px]" title={row.person.unit_name}>
                  {row.person.unit_name}
                </span>
                <small className="block text-[9px] text-muted-foreground">
                  {localeDate(context.startDate)} a {localeDate(context.endDate)}
                </small>
              </div>
              <div>
                <b className={`text-[11px] ${kind === "negative" ? "text-destructive" : ""}`}>
                  {longHours(row.balance)}
                </b>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${kind === "negative" ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.max(8, (Math.abs(row.balance) / maxBalance) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
          {!rows.length && (
            <p className="p-8 text-center text-xs text-muted-foreground">
              Nenhum saldo {kind === "negative" ? "negativo" : "positivo"} neste período.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
