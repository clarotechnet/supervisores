import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import {
  latestOperationalSource,
  listOperationalSheets,
  type OperationalSheet,
} from "@/services/schedule-operational";
import { scheduleMonthDates } from "@/lib/schedule-view";
import { scheduleCodeKind } from "@/lib/schedule-import";

interface Props {
  city: string;
  sector: string;
  month: string;
  refreshKey?: number;
  official?: boolean;
  canOpenSheet?: boolean;
}
const br = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);
export function ScheduleOperationalPreview({
  city,
  sector,
  month,
  refreshKey,
  official = false,
  canOpenSheet = false,
}: Props) {
  const [sheet, setSheet] = useState<OperationalSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if ((official && !canOpenSheet) || !city || !sector || !month) {
      setSheet(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const source = official
      ? latestOperationalSource(city, sector, month)
      : listOperationalSheets(city, sector, month).then((rows) => rows[0] ?? null);
    void source
      .then((row) => {
        if (active) setSheet(row);
      })
      .catch((e: unknown) => {
        if (active) {
          setSheet(null);
          setError(e instanceof Error ? e.message : "Falha ao consultar escala operacional.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [city, sector, month, refreshKey, official, canOpenSheet]);
  const dates = useMemo(() => (month ? scheduleMonthDates(month) : []), [month]);
  if (official && !canOpenSheet) return <OfficialScheduleNotice />;
  if (loading)
    return <p className="mb-4 text-xs text-muted-foreground">Consultando escala operacional...</p>;
  if (error) return <p className="mb-4 text-xs text-destructive">Escala editável: {error}</p>;
  if (!sheet) return null;
  if (official)
    return <OfficialScheduleNotice url={canOpenSheet ? sheet.spreadsheet_url : undefined} />;
  const payload = sheet.current_payload as unknown as {
    people: Array<{
      name: string;
      jobTitle: string;
      assignments: Record<string, string>;
    }>;
  };
  const workDays = (code: string) => scheduleCodeKind(code) === "work";
  return (
    <section className="mb-5 space-y-3 rounded-xl border border-sky-600/40 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <CalendarDays className="size-4" /> Escala operacional · em revisão
          </h2>
          <p className="text-xs text-muted-foreground">
            {payload.people.length} colaboradores · Atualizada no Sheets · última sincronização:{" "}
            {sheet.last_synced_at
              ? new Date(sheet.last_synced_at).toLocaleString("pt-BR")
              : "pendente"}
          </p>
          <p className="text-xs text-muted-foreground">
            Esta visualização não é a escala oficial publicada. Edite no Google Sheets e clique em
            Atualizar via API para sincronizar.
          </p>
        </div>
        {canOpenSheet && (
          <a
            href={sheet.spreadsheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            <ExternalLink className="size-3.5" /> Abrir planilha editável
          </a>
        )}
      </div>
      <div className="max-h-[450px] w-full min-w-0 max-w-full overflow-auto overscroll-x-contain">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className="sticky left-0 z-20 min-w-52 border-b bg-card p-2 text-left">
                Colaborador
              </th>
              {dates.map((d) => (
                <th key={d} className="min-w-20 border-b p-2 text-center">
                  {new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", {
                    weekday: "short",
                    timeZone: "UTC",
                  })}
                  <div>{br(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.people.map((p, i) => (
              <tr key={p.name + "-" + i} className="border-b">
                <td className="sticky left-0 bg-card p-2 font-medium">{p.name}</td>
                {dates.map((d) => {
                  const code = p.assignments[d] || "";
                  const kind = scheduleCodeKind(code);
                  const cls =
                    kind === "off"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : kind === "certificate" || kind === "absence"
                        ? "bg-red-500/10 text-red-600"
                        : kind === "vacation"
                          ? "bg-purple-500/10 text-purple-600"
                          : code === "PLANTÃO"
                            ? "bg-amber-500/10 text-amber-700"
                            : workDays(code)
                              ? "text-foreground"
                              : "text-muted-foreground";
                  return (
                    <td key={d} className={"p-2 text-center " + cls}>
                      {code || "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfficialScheduleNotice({ url }: { url?: string | undefined }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-600/35 bg-card p-3 text-sm">
      <span className="min-w-0 font-semibold">
        Escala oficial vinculada ao Google Sheets · alterações sincronizadas por Atualizar via API
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-primary underline"
        >
          <ExternalLink className="size-3.5" /> Abrir aba editável
        </a>
      )}
    </div>
  );
}
