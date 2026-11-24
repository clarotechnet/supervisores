import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, FileDown, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VT_CITIES } from "@/lib/vt-revisitas";
import { vtFullDay, type VtChartModel, type VtChartScope } from "@/lib/vt-revisitas-charts";
import type { VtHeatArea } from "@/lib/vt-revisitas-geography";
import { VtRevisitasHeatMap } from "./VtRevisitasHeatMap";
import { VtProductivityRows, VtTrendPlot } from "./VtRevisitasPlots";

export function VtRevisitasCharts({
  model,
  scope,
  exportingDisabled,
  onTechnician,
  onArea,
  detail,
}: {
  model: VtChartModel;
  scope: VtChartScope;
  exportingDisabled: boolean;
  onTechnician: (login: string) => void;
  onArea: (area: VtHeatArea) => void;
  detail?: ReactNode;
}) {
  const exportLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");

  async function download(format: "png" | "pdf") {
    if (exportLock.current || exportingDisabled) return;
    exportLock.current = true;
    setExporting(format);
    setExportError("");
    try {
      const { downloadVtRevisitas } = await import("./vt-revisitas-export");
      await downloadVtRevisitas(model, scope, format);
    } catch (error) {
      setExportError(
        error instanceof Error && error.name === "VtReportError"
          ? error.message
          : "Não foi possível exportar o relatório. Tente novamente.",
      );
    } finally {
      exportLock.current = false;
      setExporting(null);
    }
  }

  function openTechnician(login: string) {
    onTechnician(login);
    requestAnimationFrame(() => heading.current?.focus());
  }

  if (!model.total)
    return (
      <p className="rounded-xl border border-border p-6 text-muted-foreground">
        Sem ordens no recorte. Importe um XLSX ou ajuste os filtros.
      </p>
    );

  const { heat } = model;
  const mappedCount = model.total.revisits - heat.notLocated;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 ref={heading} tabIndex={-1} className="font-semibold outline-none">
            {scope.technician || `Visão geral · ${VT_CITIES[scope.city]}`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.technician && `${VT_CITIES[scope.city]} · `}
            {vtFullDay(model.from)} a {vtFullDay(model.to)} · O.S. no recorte até{" "}
            {vtFullDay(model.latest)}
          </p>
          {scope.technician && scope.daysWorked != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dias trabalhados na competência:{" "}
              <strong>{scope.daysWorked.toLocaleString("pt-BR")}</strong>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {scope.technician && (
            <Button variant="ghost" onClick={() => openTechnician("")}>
              <ArrowLeft /> Visão geral
            </Button>
          )}
          <Button
            variant="outline"
            disabled={exportingDisabled || !!exporting}
            onClick={() => void download("png")}
          >
            <ImageDown /> {exporting === "png" ? "Gerando PNG…" : "Exportar PNG"}
          </Button>
          <Button
            variant="outline"
            disabled={exportingDisabled || !!exporting}
            onClick={() => void download("pdf")}
          >
            <FileDown /> {exporting === "pdf" ? "Gerando PDF…" : "Exportar PDF"}
          </Button>
        </div>
        {exportError && (
          <p role="alert" className="basis-full text-xs text-destructive">
            {exportError}
          </p>
        )}
      </div>

      {scope.technician && <VtTrendPlot model={model} variant="technician" height={290} />}
      {scope.technician && detail}

      <section
        className="min-w-0 rounded-xl border border-border border-t-2 border-t-[#e3062c] bg-card p-4"
        aria-label="Mapa de calor de revisitas"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Mapa de calor · revisitas por bairro</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A mancha indica o volume de revisitas produtivas no bairro, não o endereço do
              atendimento.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
            aria-label="Escala de intensidade"
          >
            Menor{" "}
            <span className="h-2 w-16 rounded-full bg-linear-to-r from-[#16ba8c] via-[#ffd94d] to-[#e5233a]" />{" "}
            Maior
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(210px,26%)]">
          <VtRevisitasHeatMap key={scope.city} city={scope.city} heat={heat} onArea={onArea} />
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">Revisitas por bairro</h3>
            <p className="text-xs text-muted-foreground">
              {mappedCount.toLocaleString("pt-BR")} no mapa
              {heat.notLocated
                ? ` · ${heat.notLocated.toLocaleString("pt-BR")} sem localização`
                : ""}
            </p>
            {model.total.revisits > 0 ? (
              <>
                <ul className="max-h-[310px] space-y-1 overflow-y-auto">
                  {heat.areas.map((area) => (
                    <li key={area.key}>
                      <button
                        type="button"
                        onClick={() => onArea(area)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline"
                      >
                        <span className="flex-1">
                          {area.label}
                          {!area.point && (
                            <span className="block text-[10px] text-muted-foreground">
                              Bairro não localizado
                            </span>
                          )}
                        </span>
                        <strong className="tabular-nums">
                          {area.count.toLocaleString("pt-BR")}
                        </strong>
                      </button>
                    </li>
                  ))}
                  {heat.withoutName > 0 && (
                    <li className="px-2 py-1.5 text-xs text-muted-foreground">
                      Sem bairro no arquivo · {heat.withoutName.toLocaleString("pt-BR")}
                    </li>
                  )}
                </ul>
                {!!heat.areas.length && (
                  <p className="text-[11px] text-muted-foreground">
                    Selecione uma mancha ou um bairro para ver as revisitas na tabela.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma revisita produtiva no recorte.
              </p>
            )}
          </div>
        </div>
      </section>
      {!scope.technician && detail}

      {!scope.technician && (
        <div className="grid gap-4 lg:grid-cols-2">
          <VtTrendPlot model={model} variant="totals" />
          <VtTrendPlot model={model} variant="revisits" />
        </div>
      )}
      {!scope.technician && (
        <section
          className="rounded-xl border border-border bg-card p-4"
          aria-label="Produtividade por técnico"
        >
          <h2 className="font-semibold">Produtividade por técnico</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            O.S. produtivas. Selecione um técnico para ver a evolução diária.
          </p>
          <div className="max-h-96 overflow-y-auto">
            <VtProductivityRows
              rows={model.ranking}
              max={Math.max(1, model.ranking[0]?.productive ?? 0)}
              onTechnician={openTechnician}
            />
          </div>
        </section>
      )}
    </div>
  );
}
