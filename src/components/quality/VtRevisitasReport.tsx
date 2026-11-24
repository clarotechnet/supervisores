import type { CSSProperties, ReactNode } from "react";
import { VT_CITIES } from "@/lib/vt-revisitas";
import {
  vtChartMetrics,
  vtFullDay,
  type VtChartModel,
  type VtChartScope,
} from "@/lib/vt-revisitas-charts";
import { VtStaticHeatMap } from "./VtRevisitasHeatMap";
import { VtProductivityRows, VtTrendPlot } from "./VtRevisitasPlots";

const width = 1120;
const reportColors = {
  "--foreground": "#13243a",
  "--muted-foreground": "#4b5b70",
  "--card": "#ffffff",
  "--border": "#d9e0e8",
  "--muted": "#edf1f5",
  width,
  fontFamily: "Arial, sans-serif",
} as CSSProperties;
const rankOnFirstPage = 8;
const rankPerExtraPage = 28;

function ReportPage({
  model,
  scope,
  page,
  pages,
  children,
}: {
  model: VtChartModel;
  scope: VtChartScope;
  page: number;
  pages: number;
  children: ReactNode;
}) {
  const competence = `${scope.month.slice(5)}/${scope.month.slice(0, 4)}`;
  return (
    <section
      data-vt-report-page
      style={reportColors}
      className="space-y-3 bg-white px-6 py-5 text-foreground"
    >
      <header className="flex items-center gap-3 border-b-2 border-[#e3062c] pb-3">
        <img
          src="/technet-logo.svg"
          alt="Logo TechNET"
          width="51"
          height="51"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-[#c7102c]">TECHNET · VISITA TÉCNICA</p>
          <h1 className="text-2xl font-bold">Relatório de revisitas</h1>
          <p className="text-xs">
            <strong>{VT_CITIES[scope.city]}</strong> · Competência {competence} ·{" "}
            {scope.technician || "Todos os técnicos"}
            {scope.area && ` · ${scope.area}`}
          </p>
        </div>
        <div className="shrink-0 rounded-md bg-muted px-3 py-2 text-right text-xs">
          <strong>
            {vtFullDay(model.from)} a {vtFullDay(model.to)}
          </strong>
          <p className="text-muted-foreground">O.S. no recorte até {vtFullDay(model.latest)}</p>
        </div>
      </header>
      {children}
      <footer className="flex justify-between gap-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
        <span>
          Fonte: ordens de serviço importadas no Supervisores. Taxa = revisitas produtivas ÷ O.S.
          produtivas.
        </span>
        <span>
          {page}/{pages}
        </span>
      </footer>
    </section>
  );
}

function ReportHeat({ model, city }: { model: VtChartModel; city: VtChartScope["city"] }) {
  return (
    <section className="min-w-0 rounded-xl border border-border p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Mapa de calor · revisitas por bairro</h2>
          <p className="text-[11px] text-muted-foreground">
            Manchas no centro dos bairros
            {model.heat.notLocated
              ? ` · ${model.heat.notLocated.toLocaleString("pt-BR")} sem localização`
              : ""}
            {!model.total?.revisits && " · Sem revisitas produtivas no recorte"}
          </p>
        </div>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          Menor{" "}
          <span className="h-2 w-14 rounded-full bg-linear-to-r from-[#16ba8c] via-[#ffd94d] to-[#e5233a]" />{" "}
          Maior
        </span>
      </div>
      <VtStaticHeatMap city={city} heat={model.heat} width={598} height={238} />
    </section>
  );
}

export function VtRevisitasReport({ model, scope }: { model: VtChartModel; scope: VtChartScope }) {
  const ranking = model.ranking;
  const max = Math.max(1, ranking[0]?.productive ?? 0);
  const additional = scope.technician
    ? 0
    : Math.ceil(Math.max(0, ranking.length - rankOnFirstPage) / rankPerExtraPage);
  return (
    <>
      <ReportPage model={model} scope={scope} page={1} pages={additional + 1}>
        <div className="grid grid-cols-7 gap-2">
          {vtChartMetrics(model.total).map(([label, value]) => (
            <div
              key={label}
              className="rounded-md border border-border border-t-2 border-t-[#e3062c] bg-muted px-3 py-2"
            >
              <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
              <strong className="block text-xl tabular-nums">
                {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
              </strong>
            </div>
          ))}
        </div>
        {scope.technician ? (
          <VtTrendPlot model={model} variant="technician" width={1038} height={168} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <VtTrendPlot model={model} variant="totals" width={496} height={166} />
            <VtTrendPlot model={model} variant="revisits" width={496} height={166} />
          </div>
        )}
        <div className="grid grid-cols-[624px_minmax(0,1fr)] gap-3">
          <ReportHeat model={model} city={scope.city} />
          <section className="min-w-0 rounded-xl border border-border p-3">
            {scope.technician ? (
              <>
                <h2 className="text-sm font-semibold">Revisitas por bairro</h2>
                {scope.daysWorked != null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Dias trabalhados na competência: {scope.daysWorked.toLocaleString("pt-BR")}
                  </p>
                )}
                {model.heat.areas.length ? (
                  <ol className="mt-2 space-y-1 text-xs">
                    {model.heat.areas.slice(0, 8).map((area) => (
                      <li
                        key={area.key}
                        className="flex justify-between gap-3 border-b border-border px-1 py-1"
                      >
                        <span>
                          {area.label}
                          {!area.point && " (sem localização)"}
                        </span>
                        <strong>{area.count.toLocaleString("pt-BR")}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nenhum bairro identificado no recorte.
                  </p>
                )}
                {model.heat.areas.length > 8 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Os 8 bairros com mais revisitas.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold">Produtividade por técnico</h2>
                <p className="mb-2 mt-1 text-[11px] text-muted-foreground">
                  O.S. produtivas
                  {additional > 0 &&
                    ` · ${rankOnFirstPage} de ${ranking.length} técnicos (continua)`}
                </p>
                <VtProductivityRows rows={ranking.slice(0, rankOnFirstPage)} max={max} />
              </>
            )}
          </section>
        </div>
      </ReportPage>
      {Array.from({ length: additional }, (_, index) => {
        const start = rankOnFirstPage + index * rankPerExtraPage;
        const batch = ranking.slice(start, start + rankPerExtraPage);
        const middle = Math.ceil(batch.length / 2);
        return (
          <ReportPage
            key={start}
            model={model}
            scope={scope}
            page={index + 2}
            pages={additional + 1}
          >
            <h2 className="font-semibold">Produtividade por técnico · continuação</h2>
            <p className="text-xs text-muted-foreground">
              O.S. produtivas · técnicos {start + 1} a {start + batch.length} de {ranking.length}
            </p>
            <div className="grid grid-cols-2 gap-5">
              <VtProductivityRows rows={batch.slice(0, middle)} max={max} />
              <VtProductivityRows rows={batch.slice(middle)} max={max} />
            </div>
          </ReportPage>
        );
      })}
    </>
  );
}
