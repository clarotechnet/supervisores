import { useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { todayKey } from "@/lib/date-utils";
import type { ScheduleDateNote, SchedulePerson } from "@/lib/types";

export function SchedulePdfButton(input: {
  people: SchedulePerson[];
  month: string;
  city: string;
  sector: string;
  notes: ScheduleDateNote[];
  filterDescription?: string | undefined;
}) {
  const [exporting, setExporting] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  async function savePdf() {
    if (exporting || !input.people.length) return;
    setExporting(true);
    try {
      const [{ captureSchedulePdfPalette }, { downloadSchedulePdf }] = await Promise.all([
        import("@/lib/schedule-pdf-theme"),
        import("@/lib/schedule-pdf-download"),
      ]);
      if (!button.current) return;
      const palette = captureSchedulePdfPalette(button.current.parentElement!);
      await downloadSchedulePdf({ ...input, palette, today: todayKey() });
      toast.success("Download do PDF iniciado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar o PDF da escala.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <Button
      ref={button}
      type="button"
      variant="outline"
      onClick={() => void savePdf()}
      disabled={exporting || !input.people.length}
      aria-busy={exporting}
      title="PDF vetorial em A3 paisagem, com as pessoas selecionadas, todos os dias do mês e as cores do tema atual"
    >
      {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
      {exporting ? "Gerando PDF..." : "Salvar PDF"}
    </Button>
  );
}
