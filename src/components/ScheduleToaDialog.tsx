import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildScheduleToa, scheduleToaDefaultShift, type ToaCatalog } from "@/lib/schedule-toa";
import { downloadScheduleToa, readScheduleToaCatalog } from "@/lib/schedule-toa-xlsx";
import { SCHEDULE_CITY_OPTIONS, SCHEDULE_SECTOR_OPTIONS, type ScheduleUpload } from "@/lib/types";

interface Props {
  schedule: ScheduleUpload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleToaDialog({ schedule, open, onOpenChange }: Props) {
  const [catalog, setCatalog] = useState<{ file: string; data: ToaCatalog }>();
  const [defaultShift, setDefaultShift] = useState(() => scheduleToaDefaultShift(schedule.sector));
  const [defaultBucket, setDefaultBucket] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const plan = useMemo(
    () => buildScheduleToa(schedule, catalog?.data, defaultShift, defaultBucket),
    [schedule, catalog, defaultShift, defaultBucket],
  );
  const city =
    SCHEDULE_CITY_OPTIONS.find((row) => row.value === schedule.city)?.label ?? schedule.city;
  const sector =
    SCHEDULE_SECTOR_OPTIONS.find((row) => row.value === schedule.sector)?.label ?? schedule.sector;
  const competence = schedule.schedule_month.slice(0, 7).split("-").reverse().join("/");

  async function loadCatalog(file: File) {
    if (loading || exporting) return;
    setCatalog(undefined);
    setError("");
    setLoading(true);
    try {
      setCatalog({ file: file.name, data: await readScheduleToaCatalog(file) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o cadastro TOA.");
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (loading || exporting || !plan.people.length) return;
    setExporting(true);
    try {
      await downloadScheduleToa(schedule, plan);
      toast.success(
        plan.needsReview ? "Compilado TOA para revisão baixado." : "Compilado TOA baixado.",
      );
    } catch {
      toast.error("Não foi possível gerar o compilado TOA.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gerar compilado TOA</DialogTitle>
          <DialogDescription>
            {city} · {sector} · {competence}. O XLSX usa a equipe inteira e as marcações da escala
            selecionada. Não inclui telefone nem skill.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-toa-default-shift">Horário padrão da coluna ESCALA</Label>
            <Input
              id="schedule-toa-default-shift"
              value={defaultShift}
              maxLength={100}
              disabled={exporting}
              onChange={(event) => setDefaultShift(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usado quando o cadastro não traz uma escala própria para o técnico.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-toa-default-bucket">Nome do Bucket (opcional)</Label>
            <Input
              id="schedule-toa-default-bucket"
              aria-describedby="schedule-toa-default-bucket-help"
              placeholder="Informe um bucket padrão"
              value={defaultBucket}
              disabled={exporting}
              onChange={(event) => setDefaultBucket(event.target.value)}
            />
            <p id="schedule-toa-default-bucket-help" className="text-xs text-muted-foreground">
              Usado apenas para colaboradores sem bucket no cadastro.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-toa-catalog">
              Cadastro ou compilado TOA anterior (opcional)
            </Label>
            <Input
              id="schedule-toa-catalog"
              type="file"
              accept=".xlsx"
              disabled={loading || exporting}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void loadCatalog(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Use um arquivo da mesma cidade e frente para preencher bucket, área padrão, CEP e
              escala padrão. As marcações do arquivo anterior não substituem a escala selecionada.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {catalog && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">{catalog.file}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={exporting}
                  onClick={() => setCatalog(undefined)}
                >
                  Remover cadastro
                </Button>
              </div>
            )}
            {!plan.catalogMatchesScope && (
              <p role="alert" className="text-sm text-destructive">
                Esse compilado foi gerado para outra cidade ou frente. Os dados dele não serão
                usados.
              </p>
            )}
          </div>
          <div
            className="space-y-2 rounded-md border border-border bg-muted/35 p-3 text-sm"
            aria-live="polite"
          >
            <p>
              {plan.people.length} colaborador(es) · {plan.dates.length} data(s)
              {catalog ? ` · ${plan.matchedProfiles} com cadastro TOA` : ""}
            </p>
            {plan.missingProfiles > 0 && (
              <p className="text-muted-foreground">
                {plan.missingProfiles} colaborador(es) com dados TOA faltando. Complete os campos em
                destaque na aba COMPILADO.
              </p>
            )}
            {plan.duplicateLogins > 0 && (
              <p className="text-destructive">
                Há logins repetidos na escala. Confira antes de enviar ao TOA.
              </p>
            )}
            {plan.missingShifts.length > 0 && (
              <p className="text-muted-foreground">
                Códigos sem horário definido: {plan.missingShifts.slice(0, 8).join(", ")}
                {plan.missingShifts.length > 8 ? ` e mais ${plan.missingShifts.length - 8}` : ""}.
                Eles serão mantidos como estão até você preencher o horário na aba Turnos TOA.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            disabled={loading || exporting || !plan.people.length}
            onClick={() => void download()}
          >
            {loading || exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {loading
              ? "Lendo cadastro…"
              : exporting
                ? "Gerando…"
                : plan.needsReview
                  ? "Baixar para revisão"
                  : "Baixar compilado XLSX"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
