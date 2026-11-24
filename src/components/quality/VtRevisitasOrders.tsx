import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VT_ORDER_CATEGORIES, type VtClassified, type VtOrderCategory } from "@/lib/vt-revisitas";
import { vtFullDay } from "@/lib/vt-revisitas-charts";

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

function orderClassification(row: VtClassified) {
  if (row.cancelled) return "Cancelada";
  if (row.expunged) return "Expurgada";
  if (row.revisited) return "Revisita produtiva";
  return row.improductive ? "Improdutiva" : "Produtiva";
}

export function VtRevisitasOrders({
  rows,
  rowLimit,
  search,
  category,
  inCharts,
  onSearch,
  onCategory,
  onMore,
}: {
  rows: VtClassified[];
  rowLimit: number;
  search: string;
  category: VtOrderCategory;
  inCharts?: boolean;
  onSearch: (value: string) => void;
  onCategory: (value: VtOrderCategory) => void;
  onMore: () => void;
}) {
  const id = useId();
  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="basis-full">
          <h2 id={`${id}-title`} className="font-semibold">
            Detalhamento das ordens de serviço
          </h2>
          {inCharts && (
            <p className="mt-1 text-xs text-muted-foreground">
              A busca e a classificação abaixo filtram somente a tabela.
            </p>
          )}
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
        <span role="status" className="ml-auto text-xs text-muted-foreground">
          {rows.length.toLocaleString("pt-BR")} registros
        </span>
      </div>
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
                  <td className={cell}>{orderClassification(row)}</td>
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
