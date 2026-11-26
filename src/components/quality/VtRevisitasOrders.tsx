import { FileSpreadsheet } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  VT_ORDER_CATEGORIES,
  vtOrderClassification,
  type VtClassified,
  type VtOrderCategory,
  type VtOrderServiceOption,
} from "@/lib/vt-revisitas";
import { vtFullDay } from "@/lib/vt-revisitas-charts";
import type { VtOrderExportScope } from "@/lib/vt-revisitas-orders-xlsx";

const columns = [
  "Data",
  "Técnico",
  "O.S. / WO",
  "Contrato",
  "Bairro / município",
  "Serviço",
  "Código",
  "Classificação",
  "O.S. retorno",
];
const cell = "whitespace-nowrap px-3 py-2.5 text-xs";

export function VtRevisitasOrders({
  rows,
  rowLimit,
  exportScope,
  search,
  category,
  service,
  serviceOptions,
  inCharts,
  onSearch,
  onCategory,
  onService,
  onMore,
}: {
  rows: VtClassified[];
  rowLimit: number;
  exportScope: VtOrderExportScope;
  search: string;
  category: VtOrderCategory;
  service: string;
  serviceOptions: readonly VtOrderServiceOption[];
  inCharts?: boolean;
  onSearch: (value: string) => void;
  onCategory: (value: VtOrderCategory) => void;
  onService: (value: string) => void;
  onMore: () => void;
}) {
  const id = useId();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  async function exportExcel() {
    setExporting(true);
    setExportError(false);
    try {
      const { downloadVtOrderDetailsXlsx } = await import("@/lib/vt-revisitas-orders-xlsx");
      await downloadVtOrderDetailsXlsx(rows, exportScope);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex basis-full flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-title`} className="font-semibold">
              Detalhamento das ordens de serviço
            </h2>
            {inCharts && (
              <p className="mt-1 text-xs text-muted-foreground">
                Os filtros abaixo não alteram os gráficos.
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exporting || !rows.length}
            onClick={() => void exportExcel()}
          >
            <FileSpreadsheet aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar Excel (.xlsx)"}
          </Button>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-search`}>Buscar O.S., WO, contrato ou bairro</Label>
          <Input id={`${id}-search`} value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-category`}>Classificação</Label>
          <select
            id={`${id}-category`}
            className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            value={category}
            onChange={(e) => onCategory(e.target.value as VtOrderCategory)}
          >
            {Object.entries(VT_ORDER_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid w-full min-w-0 gap-1 sm:w-64">
          <Label htmlFor={`${id}-service`}>Serviço</Label>
          <select
            id={`${id}-service`}
            className="h-9 min-w-0 truncate rounded-md border border-input bg-background px-3 text-sm"
            value={service}
            disabled={!service && serviceOptions.length === 0}
            onChange={(e) => onService(e.target.value)}
          >
            <option value="">Todos os serviços</option>
            {service && !serviceOptions.some(({ value }) => value === service) && (
              <option value={service}>{service} (fora do recorte)</option>
            )}
            {serviceOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <span role="status" className="ml-auto text-xs text-muted-foreground">
          {rows.length.toLocaleString("pt-BR")} registros
        </span>
      </div>
      {exportError && (
        <p role="alert" className="px-4 pb-3 text-sm text-destructive">
          Não foi possível gerar o Excel. Tente exportar novamente.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-muted-foreground">
          Nenhuma ordem encontrada para os filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/60">
              <tr>
                {columns.map((label) => (
                  <th key={label} scope="col" className={`${cell} text-left font-semibold`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, rowLimit).map((row) => (
                <tr className="border-b border-border/60" key={row.id}>
                  <td className={cell}>{vtFullDay(row.day)}</td>
                  <td className={cell}>{row.technician}</td>
                  <td className={cell}>{[row.os, row.wo].filter(Boolean).join(" / ")}</td>
                  <td className={cell}>{row.contract}</td>
                  <td className={cell}>
                    {row.neighborhood || "—"}
                    <small className="block text-muted-foreground">{row.municipality}</small>
                  </td>
                  <td className={`${cell} max-w-60 whitespace-normal`}>{row.service || "—"}</td>
                  <td className={cell} title={row.description}>
                    {row.code}
                  </td>
                  <td className={cell}>{vtOrderClassification(row)}</td>
                  <td className={cell}>{row.returnOs || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > rowLimit && (
        <div className="p-3">
          <Button variant="outline" onClick={onMore}>
            Mostrar mais registros
          </Button>
        </div>
      )}
    </section>
  );
}
