import { Button } from "@/components/ui/button";
import type { QuarkNearPunch } from "@/lib/quark-location-report";

export function QuarkNearPunchSelection({
  punches,
  selected,
  onChange,
  disabled = false,
}: {
  punches: readonly QuarkNearPunch[];
  /** null means every currently nearby record; [] means none. IDs never mean a day position. */
  selected: readonly string[] | null;
  onChange: (ids: string[] | null) => void;
  disabled?: boolean;
}) {
  const selectedIds = new Set(selected ?? punches.map(({ punch }) => punch.point_id));
  const count = punches.filter(({ punch }) => selectedIds.has(punch.point_id)).length;
  return (
    <section
      aria-label="Selecionar batidas próximas para o relatório"
      className="space-y-2 border-t border-border pt-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold">Selecione as batidas próximas que entram no relatório</p>
          <p className="mt-1 text-[10px] text-muted-foreground" aria-live="polite">
            {count} de {punches.length} selecionada(s). Marque cada registro pela data e pelo
            horário, independentemente do número original da batida.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !punches.length}
            onClick={() => onChange(null)}
          >
            Selecionar todas
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || count === 0}
            onClick={() => onChange([])}
          >
            Limpar seleção
          </Button>
        </div>
      </div>
      <div className="max-h-48 divide-y divide-border overflow-auto rounded-lg border border-border">
        {punches.map(({ punch, distanceMeters }) => {
          const date = new Date(`${punch.work_date}T12:00:00`).toLocaleDateString("pt-BR");
          const time = punch.punch_time?.slice(0, 5) ?? "Sem horário";
          return (
            <label
              key={punch.point_id}
              className="flex cursor-pointer items-start gap-3 px-3 py-2 text-xs hover:bg-secondary/40"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                aria-label={`Incluir ${date} às ${time} no relatório`}
                checked={selectedIds.has(punch.point_id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = new Set(
                    punches
                      .filter(({ punch: row }) => selectedIds.has(row.point_id))
                      .map(({ punch: row }) => row.point_id),
                  );
                  if (event.target.checked) next.add(punch.point_id);
                  else next.delete(punch.point_id);
                  onChange([...next]);
                }}
              />
              <span className="min-w-0 flex-1">
                <b>
                  {date} · {time}
                </b>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {punch.location || "Local não informado"}
                </span>
              </span>
              <span className="shrink-0 font-bold text-success-foreground">
                {Math.round(distanceMeters).toLocaleString("pt-BR")} m
              </span>
            </label>
          );
        })}
        {!punches.length && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Nenhuma batida próxima no período e raio selecionados.
          </p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Apenas os registros marcados entram no PNG, PDF e XLSX. Os desmarcados continuam nesta lista
        para você poder selecioná-los novamente.
      </p>
    </section>
  );
}
