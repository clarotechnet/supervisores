import { ScheduleOfficialEditDialog } from "@/components/ScheduleOfficialEditDialog";
import { SchedulePreviewAssistant } from "@/components/SchedulePreviewAssistant";
import { ScheduleAssistantDialog } from "@/components/ScheduleAssistantDialog";
import { isInitialRnDecember } from "@/lib/schedule-rn-december-reference";
import { fixedRestSummary, hasFixedRestDistribution } from "@/lib/schedule-fixed-rest";
import { useEffect, useState, useRef } from "react";
import {
  loadScheduleGenerationSource,
  type ScheduleGenerationSource,
} from "@/services/schedule-generation-source";
import { buildAssistedGeneration, applyGenerationChoice } from "@/lib/schedule-assisted-generation";
import { requestScheduleGenerationChoice } from "@/services/schedule-ai";
import {
  CalendarClock,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleUpload, ScheduleUploadSummary } from "@/lib/types";
import { fetchScheduleUpload } from "@/services/schedules";
import {
  createOperationalSheet,
  listOperationalSheets,
  publishOperationalSheet,
  publicationSheetForDraft,
  draftHasPublicationBlockers,
  type OperationalSheet,
} from "@/services/schedule-operational";
import { isInitialControlDecember, type ScheduleGeneratedPreview } from "@/lib/schedule-generator";
import { getScheduleGenerationRule } from "@/lib/schedule-generator-rules";
import { downloadScheduleReport } from "@/lib/schedule-report";
import { scheduleCodeKind } from "@/lib/schedule-import";
import {
  addControlPreviewPerson,
  editControlPreviewCode,
  editControlPreviewPerson,
  editControlPreviewDutyEligibility,
  removeControlPreviewPerson,
} from "@/lib/schedule-preview-editor";
import {
  listGenerationDrafts,
  archiveGenerationDraft,
  restoreGenerationPreview,
  saveGeneratedDraft,
  type GenerationDraft,
} from "@/services/schedule-generation";

interface ScheduleGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSummary: ScheduleUploadSummary | null;
  city: string;
  sector: string;
  targetMonth: string;
  userId: string;
  isAdmin: boolean;
  onPublished: () => Promise<void>;
}
function previousMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function brDate(value: string) {
  return value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4);
}

export function ScheduleGeneratorDialog({
  open,
  onOpenChange,
  sourceSummary,
  city,
  sector,
  targetMonth,
  userId,
  isAdmin,
  onPublished,
}: ScheduleGeneratorDialogProps) {
  const month = targetMonth.slice(0, 7);
  const [source, setSource] = useState<ScheduleGenerationSource | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationRun = useRef(0);
  const generationAbort = useRef<AbortController | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [preview, setPreview] = useState<ScheduleGeneratedPreview | null>(null);
  const [baseline, setBaseline] = useState<ScheduleGeneratedPreview | null>(null);
  const [savedAssistantOpen, setSavedAssistantOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<GenerationDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [previewView, setPreviewView] = useState<"month" | "week">("week");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [linkedSheets, setLinkedSheets] = useState<OperationalSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetLoadError, setSheetLoadError] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [sheetLink, setSheetLink] = useState("");
  const [editingCell, setEditingCell] = useState<{ index: number; date: string } | null>(null);
  const [cellValue, setCellValue] = useState("");
  const [editingPerson, setEditingPerson] = useState<number | null>(null);
  const [personForm, setPersonForm] = useState({
    name: "",
    login: "",
    jobTitle: "",
    canTakeDuty: true,
  });
  const rule = getScheduleGenerationRule(city, sector);
  const [officialEditOpen, setOfficialEditOpen] = useState(false);
  const [officialSchedule, setOfficialSchedule] = useState<ScheduleUpload | null>(null);
  const selectedDraft = drafts.find((draft) => draft.revision === savedRevision);
  const selectedSheet = selectedDraft
    ? publicationSheetForDraft(selectedDraft, linkedSheets)
    : null;
  const publicationBusy = publishingId !== null || creatingSheet || saving || archivingId !== null;
  const sourceSummaryId = sourceSummary?.id;
  const firstControl5x2 = isInitialControlDecember(city, sector, month);
  const firstRn5x2 = isInitialRnDecember(city, sector, month);
  const initial5x2 = firstControl5x2 || firstRn5x2;
  const fixedRest =
    preview && hasFixedRestDistribution(preview.rule)
      ? fixedRestSummary(preview.payload.people, preview.targetMonth, preview.rule)
      : null;
  const additionalReferenceDates = preview
    ? [...new Set(preview.outsideAssignments.flatMap((person) => Object.keys(person)))]
        .filter(
          (day) => day > month + "-31" && !preview.calendarWeeks.some((week) => week.includes(day)),
        )
        .sort()
    : [];

  const visibleDates = preview
    ? previewView === "month"
      ? preview.payload.dates
      : preview.calendarWeeks[weekIndex] || []
    : [];
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setBaseline(null);
    setSavedAssistantOpen(false);
    setWeekIndex(0);
    setPreviewView("week");
    setSavedRevision(null);
    setSheetLink("");
    setEditingCell(null);
    setEditingPerson(null);
  }, [open, targetMonth, sourceSummaryId, city, sector]);

  useEffect(() => {
    generationRun.current += 1;
    generationAbort.current?.abort();
    setGenerating(false);
    return () => {
      generationRun.current += 1;
      generationAbort.current?.abort();
    };
  }, [open, city, sector, month]);

  useEffect(() => {
    let active = true;
    setSource(null);
    setSourceError("");
    if (!open || !city || !sector || !month) {
      setLoadingSource(false);
      return;
    }
    setLoadingSource(true);
    const base = previousMonth(month);
    void loadScheduleGenerationSource(city, sector, base)
      .then((row) => {
        if (!active) return;
        if (!row)
          setSourceError("Não existe escala anterior importada ou operacional para essa frente.");
        setSource(row);
      })
      .catch((error: unknown) => {
        if (active)
          setSourceError(error instanceof Error ? error.message : "Erro ao carregar mês anterior.");
      })
      .finally(() => {
        if (active) setLoadingSource(false);
      });
    return () => {
      active = false;
    };
  }, [open, city, sector, month, sourceSummaryId]);

  useEffect(() => {
    if (!open || !city || !sector || !month) {
      setDrafts([]);
      return;
    }
    let active = true;
    setLoadingDrafts(true);
    listGenerationDrafts(city, sector, month)
      .then((rows) => {
        if (active) setDrafts(rows);
      })
      .catch(() => {
        if (active) toast.error("Não foi possível consultar o histórico de rascunhos.");
      })
      .finally(() => {
        if (active) setLoadingDrafts(false);
      });
    return () => {
      active = false;
    };
  }, [open, city, sector, month]);

  useEffect(() => {
    if (!open || !city || !sector || !month) {
      setLinkedSheets([]);
      return;
    }
    let active = true;
    setLinkedSheets([]);
    setLoadingSheets(true);
    setSheetLoadError("");
    void listOperationalSheets(city, sector, month)
      .then((rows) => {
        if (active) setLinkedSheets(rows);
      })
      .catch(() => {
        if (active) setSheetLoadError("Não foi possível consultar o vínculo da aba mensal.");
      })
      .finally(() => {
        if (active) setLoadingSheets(false);
      });
    return () => {
      active = false;
    };
  }, [open, city, sector, month]);
  async function approveOfficial(draft: GenerationDraft) {
    if (!isAdmin || publicationBusy || draft.status !== "draft") return;
    if (draftHasPublicationBlockers(draft)) {
      toast.error("Esta versão salva ainda tem pendências. Revise e salve uma nova versão.");
      return;
    }
    const linked = publicationSheetForDraft(draft, linkedSheets);
    if (!linked) {
      toast.error("Primeiro crie a aba mensal e vincule esta versão ao Google Sheets.");
      return;
    }
    if (linked.sheet_tab === "ATUALIZADA") {
      toast.error(
        "Esta versão usa uma planilha separada antiga. Use a aba do Sheets oficial para esta competência.",
      );
      return;
    }
    if (
      !window.confirm(
        "Aprovar oficialmente a versão " +
          draft.revision +
          " de " +
          month +
          "? A aba " +
          linked.sheet_tab +
          (linked.draft_id === draft.id
            ? " será sincronizada antes da publicação e passará a alimentar o painel "
            : " já existe e será vinculada a esta versão, preservando a versão anterior e seu histórico. O conteúdo atual do Sheets será validado e passará a alimentar o painel ") +
          "oficial. Alterações posteriores em Atualizar via API serão refletidas na escala oficial.",
      )
    )
      return;
    setPublishingId(draft.id);
    try {
      const result = await publishOperationalSheet(linked.id, draft.id);
      if (!result.published) throw Error("O servidor não confirmou a publicação.");
      setDrafts(await listGenerationDrafts(city, sector, month));
      setSavedRevision(draft.revision);
      await onPublished();
      toast.success(
        "Versão " +
          draft.revision +
          " aprovada! Escala oficial publicada e vinculada ao Google Sheets.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar a escala.");
    } finally {
      setPublishingId(null);
    }
  }

  function setReviewedPreview(next: ScheduleGeneratedPreview) {
    setPreview(next);
    // A revisão gera um rascunho NOVO; não altera a revisão já salva nem o Sheets.
    setSavedRevision(null);
    setSheetLink("");
  }
  function beginCell(index: number, date: string, code: string) {
    if (!preview) return;
    // Só o mês-alvo e seus dias futuros de continuidade são editáveis.
    if (date < month + "-01") return;
    setEditingPerson(null);
    setEditingCell({ index, date });
    setCellValue(code);
  }
  function applyCell() {
    if (!preview || !editingCell) return;
    try {
      setReviewedPreview(
        editControlPreviewCode(preview, editingCell.index, editingCell.date, cellValue),
      );
      setEditingCell(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o dia.");
    }
  }
  function beginPerson(index: number) {
    if (!preview) return;
    const person = preview.payload.people[index];
    if (!person) return;
    setEditingCell(null);
    setEditingPerson(index);
    setPersonForm({
      name: person.name,
      login: person.login || "",
      jobTitle: person.jobTitle,
      canTakeDuty: !preview.rule.excludedFromDuty.some(
        (x) =>
          x
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim() ===
          person.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim(),
      ),
    });
  }
  function applyPerson() {
    if (!preview || editingPerson === null) return;
    try {
      let next = preview;
      for (const field of ["name", "login", "jobTitle"] as const) {
        next = editControlPreviewPerson(next, editingPerson, field, personForm[field]);
      }
      next = editControlPreviewDutyEligibility(next, editingPerson, personForm.canTakeDuty);
      setReviewedPreview(next);
      setEditingPerson(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível alterar o colaborador.",
      );
    }
  }
  function addPerson() {
    if (!preview) return;
    try {
      const next = addControlPreviewPerson(preview);
      setReviewedPreview(next);
      beginPersonFrom(next, next.payload.people.length - 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível incluir.");
    }
  }
  function beginPersonFrom(next: ScheduleGeneratedPreview, index: number) {
    const person = next.payload.people[index]!;
    setEditingCell(null);
    setEditingPerson(index);
    setPersonForm({
      name: person.name,
      login: person.login || "",
      jobTitle: person.jobTitle,
      canTakeDuty: !next.rule.excludedFromDuty.some((x) => x === person.name),
    });
  }
  function removePerson() {
    if (!preview || editingPerson === null) return;
    const name = preview.payload.people[editingPerson]?.name || "este colaborador";
    if (
      !window.confirm(
        "Remover " + name + " somente deste rascunho? A escala oficial permanecerá inalterada.",
      )
    )
      return;
    try {
      setReviewedPreview(removeControlPreviewPerson(preview, editingPerson));
      setEditingPerson(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  }

  async function generate() {
    if (!source || !month || generating) return;
    if (
      preview &&
      !window.confirm(
        "Regerar a prévia e descartar suas alterações não salvas? Os rascunhos salvos permanecem no histórico.",
      )
    )
      return;
    const run = ++generationRun.current;
    const abort = new AbortController();
    generationAbort.current?.abort();
    generationAbort.current = abort;
    setGenerating(true);
    setPreview(null);
    setBaseline(null);
    setEditingCell(null);
    setEditingPerson(null);
    setSavedRevision(null);
    try {
      const fresh = await loadScheduleGenerationSource(city, sector, previousMonth(month));
      if (run !== generationRun.current) return;
      if (!fresh) throw Error("Sincronize a escala anterior por Atualizar via API antes de gerar.");
      setSource(fresh);
      const options = buildAssistedGeneration(fresh, month);
      let result = applyGenerationChoice(options, fresh);
      if (options.input.options.length > 1) {
        try {
          const choice = await requestScheduleGenerationChoice(options.input, abort.signal);
          if (run !== generationRun.current) return;
          result = applyGenerationChoice(options, fresh, choice);
        } catch {
          if (abort.signal.aborted || run !== generationRun.current) return;
          result = {
            ...result,
            warnings: [
              ...result.warnings,
              "IA indisponível: a prévia foi montada pelas regras, preservando as folgas e o histórico.",
            ],
          };
        }
      }
      if (run !== generationRun.current) return;
      setPreview(result);
      setBaseline(result);
      setEditingCell(null);
      setEditingPerson(null);
      setSheetLink("");
      setWeekIndex(0);
      setPreviewView("week");
      setSavedRevision(null);
      if (result.blockingIssues.length)
        toast.warning("Prévia montada com pendências para sua revisão.");
      else
        toast.success(
          result.generationDecision?.mode === "ai"
            ? "Prévia montada com seleção de plantões pela IA. Confira antes de publicar."
            : "Prévia montada pelas regras. Confira antes de publicar.",
        );
    } catch (error) {
      if (run === generationRun.current)
        toast.error(error instanceof Error ? error.message : "Falha ao gerar prévia.");
    } finally {
      if (run === generationRun.current) setGenerating(false);
    }
  }
  async function saveDraft() {
    if (!preview || !source || !userId) return;
    setSaving(true);
    try {
      const result = await saveGeneratedDraft({ source, preview, userId });
      setSheetLink("");
      setSavedRevision(result.draft.revision);
      setDrafts(await listGenerationDrafts(source.city, source.sector, preview.targetMonth));
      if (result.auditLogged) {
        toast.success(`Rascunho versão ${result.draft.revision} salvo no Supabase.`);
      } else {
        toast.warning(
          `Rascunho salvo (versão ${result.draft.revision}), mas o registro de auditoria falhou.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  }
  async function removeSavedDraft(draft: GenerationDraft) {
    if (
      !userId ||
      archivingId !== null ||
      publishingId !== null ||
      (draft.status !== "draft" && !(isAdmin && draft.status === "rejected"))
    )
      return;
    if (
      !window.confirm(
        "Remover a versão " +
          draft.revision +
          " da lista de rascunhos? " +
          "A exclusão é reversível no banco e preserva o histórico. " +
          "Se ela tiver um Google Sheets vinculado, o arquivo e o histórico continuarão preservados.",
      )
    )
      return;
    setArchivingId(draft.id);
    try {
      await archiveGenerationDraft(draft, userId);
      setDrafts(await listGenerationDrafts(city, sector, month));
      if (savedRevision === draft.revision) {
        setSavedRevision(null);
        setPreview(null);
        setSheetLink("");
      }
      toast.success("Versão " + draft.revision + " removida da lista de rascunhos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o rascunho.");
    } finally {
      setArchivingId(null);
    }
  }
  async function openDraft(draft: GenerationDraft) {
    generationRun.current += 1;
    generationAbort.current?.abort();
    setGenerating(false);
    if (draft.status === "approved") {
      try {
        const snapshot = draft.policy_snapshot as Record<string, unknown> | null;
        const id = snapshot?.["officialScheduleId"];
        if (typeof id !== "string")
          throw Error("A versão oficial não tem vínculo. Atualize via API.");
        const actual = await fetchScheduleUpload(id);
        if (!actual) throw Error("Escala oficial não encontrada.");
        setOfficialSchedule(actual);
        setOfficialEditOpen(true);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Não foi possível abrir a escala oficial.",
        );
      }
      return;
    }
    if (!rule) return;
    const restored = restoreGenerationPreview(draft, rule);
    const originalBlockingCount = Array.isArray(draft.warnings)
      ? draft.warnings.filter(
          (notice) =>
            notice &&
            typeof notice === "object" &&
            !Array.isArray(notice) &&
            notice["level"] === "blocking",
        ).length
      : 0;
    const reviewUpdated = restored.blockingIssues.length !== originalBlockingCount;
    setPreview(restored);
    setBaseline(restored);
    setEditingCell(null);
    setEditingPerson(null);
    setSheetLink("");
    setWeekIndex(0);
    setPreviewView("week");
    setSavedRevision(reviewUpdated ? null : draft.revision);
    if (reviewUpdated)
      toast.info(
        "Férias mantidas como aviso. Salve uma nova versão para registrar essa revisão; a anterior permanece no histórico.",
      );
  }
  async function createSheet() {
    const draft = drafts.find((item) => item.revision === savedRevision);
    if (!draft) {
      toast.error("Salve ou selecione uma versão antes de criar o Google Sheets.");
      return;
    }
    setCreatingSheet(true);
    try {
      const result = await createOperationalSheet(draft.id);
      if (!result.url) throw new Error("O servidor não informou o link da planilha.");
      setSheetLink(result.url);
      setLinkedSheets(await listOperationalSheets(city, sector, month));
      if (result.warning) toast.warning(result.warning);
      else
        toast.success(
          result.existing
            ? "Esta versão já está vinculada à aba mensal."
            : "Aba mensal criada no Sheets oficial.",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar planilha.");
    } finally {
      setCreatingSheet(false);
    }
  }
  async function exportPreview() {
    if (!preview || !source) return;
    setExporting(true);
    try {
      await downloadScheduleReport({
        ...source,
        id: "preview-only",
        schedule_month: preview.targetMonth + "-01",
        source_file: "PRÉVIA NÃO PUBLICADA",
        source_sheet: "Gerador 5x2",
        payload: preview.payload,
        employee_count: preview.payload.people.length,
        entry_count: preview.payload.people.length * preview.payload.dates.length,
      });
      toast.success("Relatório da prévia exportado, sem alterar a escala oficial.");
    } catch {
      toast.error("Não foi possível exportar a prévia.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <ScheduleOfficialEditDialog
        open={officialEditOpen}
        onOpenChange={setOfficialEditOpen}
        schedule={officialSchedule}
        onSaved={async () => {
          if (officialSchedule) setOfficialSchedule(await fetchScheduleUpload(officialSchedule.id));
          await onPublished();
        }}
      />
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) setOfficialEditOpen(false);
          onOpenChange(value);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[96vw] max-w-[1500px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5" /> Gerador de escala · prévia 5x2
            </DialogTitle>
            <DialogDescription>
              {firstControl5x2
                ? "Dezembro/2026 é a primeira escala 5x2 do Controle: utiliza diretamente o Excel de referência, sem inferir folgas de novembro (6x1)."
                : firstRn5x2
                  ? "Dezembro/2026 utiliza o modelo 5x2 fornecido pela gestão para esta frente. Revise os códigos antes de aprovar."
                  : "Usa a competência anterior, preferindo a escala oficial sincronizada."}{" "}
              A revisão automática e o Assistente IA acompanham suas edições nesta tela. Salvar
              versões e publicar continuam ações separadas.
            </DialogDescription>
          </DialogHeader>
          {loadingSource ? (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Buscando escala anterior...
            </p>
          ) : !rule ? (
            <p className="rounded-lg border border-dashed p-4 text-sm">
              Não existe regra cadastrada para esta cidade e frente.
            </p>
          ) : (
            <div className="space-y-4">
              {source ? (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <strong>{rule.label}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Base: {source.schedule_month.slice(0, 7)} ·
                    {firstControl5x2 ? 42 : source.payload.people.length} colaboradores.
                    {firstControl5x2
                      ? " Modelo de referência recebido para a primeira escala 5x2 (a confirmar); novembro serve apenas para logins e histórico."
                      : source.operationalSourceId
                        ? " Usando escala operacional já sincronizada."
                        : " Usando escala original importada."}
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm">
                  {sourceError || `Sem escala-base em ${previousMonth(month)}.`} Você ainda pode
                  abrir rascunhos existentes abaixo.
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="schedule-generate-month">Mês de destino</Label>
                  <Input id="schedule-generate-month" type="month" value={month} readOnly />
                </div>
                <Button
                  onClick={generate}
                  disabled={!month || !source || loadingSource || generating}
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CalendarClock className="size-4" />
                  )}
                  {generating
                    ? "Montando prévia..."
                    : initial5x2
                      ? "Carregar modelo inicial 5x2"
                      : "Gerar escala com IA"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setSavedAssistantOpen(true)}>
                  <Sparkles className="size-4" /> Analisar escala salva
                </Button>
              </div>
              <section className="rounded-lg border p-3">
                <h3 className="text-sm font-bold">Histórico de versões no Supabase</h3>
                {sheetLoadError && (
                  <div className="my-2 text-xs text-destructive" role="alert">
                    {sheetLoadError} Feche e reabra o gerador para tentar novamente.
                  </div>
                )}
                <p className="mb-2 text-xs text-muted-foreground">
                  Versões independentes da escala oficial. Uma sincronização do Sheets não as
                  substitui.
                </p>
                {loadingDrafts ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Carregando histórico...
                  </p>
                ) : drafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum rascunho salvo para este período.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b py-1 text-xs"
                      >
                        <div>
                          <strong>Versão {draft.revision}</strong> ·{" "}
                          {draft.status === "approved"
                            ? "OFICIAL"
                            : draft.status === "draft"
                              ? "Rascunho"
                              : draft.status === "rejected"
                                ? "Rejeitado"
                                : draft.status}{" "}
                          · {new Date(draft.created_at).toLocaleString("pt-BR")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => void openDraft(draft)}>
                            {draft.status === "approved"
                              ? "Editar escala oficial"
                              : "Abrir rascunho"}
                          </Button>
                          {isAdmin && draft.status === "draft" && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                publicationBusy ||
                                loadingSheets ||
                                !publicationSheetForDraft(draft, linkedSheets) ||
                                draftHasPublicationBlockers(draft)
                              }
                              title={
                                draftHasPublicationBlockers(draft)
                                  ? "Resolva as pendências e salve uma nova versão."
                                  : publicationSheetForDraft(draft, linkedSheets)
                                    ? "Validar o Sheets e publicar esta versão após sua confirmação."
                                    : "Crie a aba mensal antes de publicar."
                              }
                              onClick={() => void approveOfficial(draft)}
                            >
                              {publishingId === draft.id && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                              Aprovar e publicar
                            </Button>
                          )}
                          {(draft.status === "draft" ||
                            (isAdmin && draft.status === "rejected")) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={archivingId !== null || publishingId !== null}
                              onClick={() => void removeSavedDraft(draft)}
                              title="Excluir da lista preservando o histórico"
                              aria-label={`Excluir rascunho versão ${draft.revision}`}
                            >
                              {archivingId === draft.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                              Excluir rascunho
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {savedRevision !== null && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Versão {savedRevision} selecionada.{" "}
                  {drafts.find((d) => d.revision === savedRevision)?.status === "approved"
                    ? "Esta é uma versão oficial publicada."
                    : selectedSheet
                      ? "A aba mensal já existe. Clique em Aprovar e publicar para oficializar esta versão usando o conteúdo atual do Sheets."
                      : "Crie a aba mensal e depois clique em Aprovar e publicar."}
                </p>
              )}
              {generating && (
                <p className="text-sm text-muted-foreground" role="status">
                  Lendo a escala sincronizada, preservando as folgas e selecionando os
                  plantonistas...
                </p>
              )}
              {preview?.generationDecision && (
                <section
                  className="rounded-lg border p-3 text-sm"
                  aria-label="Resultado da geração"
                >
                  <strong>
                    {preview.generationDecision.mode === "ai"
                      ? "Plantões selecionados com IA"
                      : "Escala montada pelas regras"}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preview.generationDecision.summary}
                  </p>
                  {preview.fixedRestPolicy === "preserve-history" && (
                    <p className="mt-1 text-xs">
                      Folgas fixas preservadas da escala anterior. Confira as pendências antes de
                      salvar e publicar.
                    </p>
                  )}
                </section>
              )}
              {preview && fixedRest && (
                <section className="rounded-lg border p-3">
                  <h3 className="text-sm font-bold">Distribuição das folgas fixas</h3>
                  <p className="my-2 text-xs text-muted-foreground">
                    {fixedRest.active} pessoas na distribuição · {fixedRest.protectedCount}{" "}
                    afastadas no mês.
                    {fixedRest.otherActive > 0 &&
                      ` ${fixedRest.otherActive} demais ativos distribuídos em grupo separado.`}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      [1, "Segunda"],
                      [2, "Terça"],
                      [3, "Quarta"],
                      [4, "Quinta"],
                      [5, "Sexta"],
                      [6, "Sábado"],
                    ].map(([day, label]) => (
                      <span className="rounded-md border px-3 py-1 text-xs" key={day}>
                        {label}: <strong>{fixedRest.counts[Number(day)] || 0}</strong> / meta{" "}
                        {fixedRest.targets[Number(day)]}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              {preview && (
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="min-w-0 space-y-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Colaboradores</div>
                        <div className="text-xl font-bold">{preview.payload.people.length}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Plantões previstos</div>
                        <div className="text-xl font-bold">
                          {preview.eventCoverage.reduce((n, x) => n + (x.planned || 0), 0)}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Pendências</div>
                        <div className="text-xl font-bold">{preview.blockingIssues.length}</div>
                      </div>
                    </div>
                    {preview && (
                      <div className="space-y-3 rounded-lg border border-primary/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold">Editar prévia da escala</p>
                            <p className="text-xs text-muted-foreground">
                              Clique em qualquer código ou no nome para editar. É possível mudar
                              folgas, turnos, plantões, AT, férias, faltas, colaboradores e funções.
                              Os ajustes ficam nesta prévia até salvar uma nova revisão.
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={addPerson}>
                            <Plus className="size-4" /> Adicionar colaborador
                          </Button>
                        </div>
                        {editingCell && (
                          <div className="grid gap-2 rounded-md bg-muted/50 p-3">
                            <Label htmlFor="schedule-edit-code">
                              {preview.payload.people[editingCell.index]?.name} ·{" "}
                              {brDate(editingCell.date)}
                            </Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                id="schedule-edit-code"
                                className="max-w-60"
                                autoFocus
                                list="schedule-code-options"
                                value={cellValue}
                                onChange={(e) => setCellValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") applyCell();
                                  if (e.key === "Escape") setEditingCell(null);
                                }}
                                placeholder="T. 1, Folga, PLANTÃO, AT..."
                              />
                              <datalist id="schedule-code-options">
                                {[
                                  "T. 1",
                                  "M. 1",
                                  "M. 2",
                                  "Folga",
                                  "PLANTÃO",
                                  "AT",
                                  "Férias",
                                  "FALTA",
                                  "Afastamento",
                                  "BH",
                                ].map((code) => (
                                  <option value={code} key={code} />
                                ))}
                              </datalist>
                              <Button size="sm" type="button" onClick={applyCell}>
                                Aplicar
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => setEditingCell(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              O sistema recalcula as pendências assim que a alteração é aplicada.
                              Para trocar um plantonista, altere as duas pessoas envolvidas.
                            </p>
                          </div>
                        )}
                        {editingPerson !== null && (
                          <div className="grid gap-3 rounded-md bg-muted/50 p-3">
                            <p className="text-sm font-semibold">Editar colaborador do rascunho</p>
                            <div className="grid gap-2 sm:grid-cols-3">
                              {(["name", "login", "jobTitle"] as const).map((field) => (
                                <div className="grid gap-1" key={field}>
                                  <Label htmlFor={"schedule-person-" + field}>
                                    {field === "name"
                                      ? "Nome"
                                      : field === "login"
                                        ? "Login"
                                        : "Função"}
                                  </Label>
                                  <Input
                                    id={"schedule-person-" + field}
                                    value={personForm[field]}
                                    onChange={(e) =>
                                      setPersonForm((old) => ({ ...old, [field]: e.target.value }))
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                            <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={personForm.canTakeDuty}
                                onChange={(e) =>
                                  setPersonForm((old) => ({
                                    ...old,
                                    canTakeDuty: e.target.checked,
                                  }))
                                }
                              />
                              Participa do rodízio automático de plantão
                              <span className="text-xs text-muted-foreground">
                                (altera a regra apenas desta revisão)
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" onClick={applyPerson}>
                                Salvar colaborador
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingPerson(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={removePerson}
                              >
                                <Trash2 className="size-3.5" /> Remover deste rascunho
                              </Button>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Uma edição deixa a versão anterior intacta. Para registrar os ajustes,
                          clique em <strong>Salvar nova versão no Supabase</strong>. Pendências
                          reais continuam visíveis até serem resolvidas.
                        </p>
                      </div>
                    )}
                    {preview.calendarWeeks.length > 0 && (
                      <section className="rounded-lg border p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold">Prévia editável 5x2</h3>
                            <p className="text-xs text-muted-foreground">
                              Dias anteriores são históricos; dias do mês seguinte são provisórios.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={previewView === "month" ? "default" : "outline"}
                              onClick={() => setPreviewView("month")}
                            >
                              Mês completo
                            </Button>
                            <Button
                              size="sm"
                              variant={previewView === "week" ? "default" : "outline"}
                              onClick={() => setPreviewView("week")}
                            >
                              Por semana
                            </Button>
                            {previewView === "week" && (
                              <select
                                aria-label="Escolher semana da prévia"
                                className="rounded-md border border-input bg-background px-3 py-2 text-xs"
                                value={weekIndex}
                                onChange={(event) => setWeekIndex(Number(event.target.value))}
                              >
                                {preview.calendarWeeks.map((week, index) => (
                                  <option key={week[0]} value={index}>
                                    {brDate(week[0]!)} a {brDate(week[6]!)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                        <div className="max-h-96 overflow-auto">
                          <table className="min-w-[760px] w-full border-collapse text-left text-xs">
                            <thead className="sticky top-0 bg-card">
                              <tr>
                                <th className="sticky left-0 z-10 min-w-48 border-b bg-card p-2">
                                  Colaborador
                                </th>
                                {visibleDates.map((day) => (
                                  <th
                                    key={day}
                                    className={`min-w-20 border-b p-2 text-center ${day.slice(0, 7) !== month ? "text-muted-foreground" : ""}`}
                                  >
                                    {new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
                                      weekday: "short",
                                      timeZone: "UTC",
                                    })}
                                    <div>{brDate(day).slice(0, 5)}</div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.payload.people.map((person, index) => (
                                <tr
                                  key={person.login || `${person.name}-${index}`}
                                  className="border-b"
                                >
                                  <td className="sticky left-0 bg-card p-2 font-medium">
                                    {preview ? (
                                      <button
                                        type="button"
                                        onClick={() => beginPerson(index)}
                                        className="inline-flex items-center gap-1 text-left hover:text-primary hover:underline"
                                        title="Editar colaborador, função ou login"
                                      >
                                        <span>
                                          {person.name}
                                          <span className="block text-[10px] font-normal text-muted-foreground">
                                            {[person.login, person.jobTitle]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                        </span>{" "}
                                        <Pencil className="size-3 shrink-0 opacity-60" />
                                      </button>
                                    ) : (
                                      person.name
                                    )}
                                  </td>
                                  {visibleDates.map((day) => {
                                    const code =
                                      day.slice(0, 7) === month
                                        ? person.assignments[day]
                                        : preview.outsideAssignments[index]?.[day];
                                    return (
                                      <td
                                        key={day}
                                        className={`p-2 text-center ${day.slice(0, 7) !== month ? "bg-muted/50 text-muted-foreground" : ""}`}
                                      >
                                        {day >= month + "-01" ? (
                                          <button
                                            type="button"
                                            onClick={() => beginCell(index, day, code || "")}
                                            className={`w-full rounded px-1 py-2 hover:bg-primary/15 hover:text-foreground ${editingCell?.index === index && editingCell.date === day ? "ring-2 ring-primary" : ""}`}
                                            title={"Editar " + person.name + " em " + brDate(day)}
                                          >
                                            {code || "—"}
                                          </button>
                                        ) : (
                                          code || "—"
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}
                    {additionalReferenceDates.length > 0 && (
                      <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Dias adicionais da referência:{" "}
                          {additionalReferenceDates.map(brDate).join(", ")} · Clique para editar
                        </summary>
                        <div className="mt-3 max-h-64 overflow-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr>
                                <th className="sticky top-0 bg-card p-2">Colaborador</th>
                                {additionalReferenceDates.map((date) => (
                                  <th key={date} className="sticky top-0 bg-card p-2">
                                    {brDate(date)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.payload.people.map((person, index) => (
                                <tr
                                  className="border-t"
                                  key={person.login || person.name + "-" + index}
                                >
                                  <td className="p-2">{person.name}</td>
                                  {additionalReferenceDates.map((date) => (
                                    <td className="p-2" key={date}>
                                      <button
                                        type="button"
                                        className="rounded px-2 py-1 hover:bg-primary/15 hover:text-foreground"
                                        onClick={() =>
                                          beginCell(
                                            index,
                                            date,
                                            preview.outsideAssignments[index]?.[date] || "",
                                          )
                                        }
                                      >
                                        {preview.outsideAssignments[index]?.[date] || "—"}
                                      </button>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                    {preview.blockingIssues.length > 0 && (
                      <section className="rounded-lg border border-destructive/35 bg-destructive/5 p-3">
                        <h3 className="text-sm font-bold">Pendências que impedem publicação</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                          {preview.blockingIssues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <section className="rounded-lg border p-3">
                      <h3 className="mb-2 text-sm font-bold">Cobertura de domingos e feriados</h3>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr>
                              <th className="p-2">Data</th>
                              <th className="p-2">Previstos</th>
                              <th className="p-2">Escalados</th>
                              <th className="p-2">Colaboradores</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.eventCoverage.map((event) => {
                              const staff = preview.payload.people.filter(
                                (person) =>
                                  scheduleCodeKind(person.assignments[event.date] || "") === "work",
                              );
                              return (
                                <tr key={event.date} className="border-t align-top">
                                  <td className="p-2">{brDate(event.date)}</td>
                                  <td className="p-2">{event.planned ?? "Pendente"}</td>
                                  <td className="p-2">{event.assigned}</td>
                                  <td className="p-2">
                                    {staff.map((p) => p.name).join(", ") || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="rounded-lg border p-3">
                      <h3 className="mb-2 text-sm font-bold">Observações para revisão</h3>
                      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {preview.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                  <SchedulePreviewAssistant
                    preview={preview}
                    baseline={baseline || preview}
                    active={open && !savedAssistantOpen}
                    onChange={setReviewedPreview}
                  />
                </div>
              )}
            </div>
          )}
          {isAdmin && sheetLink && (
            <a
              href={sheetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary underline"
            >
              Abrir aba da escala editável
            </a>
          )}
          <DialogFooter>
            {selectedDraft?.status === "draft" && !selectedSheet && (
              <Button
                onClick={() => void createSheet()}
                disabled={publicationBusy || loadingDrafts || loadingSheets || !!sheetLoadError}
              >
                {creatingSheet && <Loader2 className="size-4 animate-spin" />}
                {city === "natal" && sector === "controle-operacional"
                  ? "Criar aba do mês no Sheets Controle"
                  : "Criar aba do mês no Sheets oficial"}
              </Button>
            )}
            {isAdmin && selectedDraft?.status === "draft" && (
              <Button
                onClick={() => void approveOfficial(selectedDraft)}
                disabled={
                  publicationBusy ||
                  loadingSheets ||
                  !selectedSheet ||
                  draftHasPublicationBlockers(selectedDraft)
                }
              >
                {publishingId === selectedDraft.id && <Loader2 className="size-4 animate-spin" />}
                Aprovar e publicar versão {selectedDraft.revision}
              </Button>
            )}
            {preview && (
              <Button
                onClick={() => void saveDraft()}
                disabled={publicationBusy || !userId || !source}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Salvar nova versão no Supabase
              </Button>
            )}
            {preview && (
              <Button
                variant="outline"
                onClick={() => void exportPreview()}
                disabled={exporting || !source}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" />
                )}
                Exportar relatório da prévia
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScheduleAssistantDialog
        open={open && savedAssistantOpen}
        onOpenChange={setSavedAssistantOpen}
        city={city}
        sector={sector}
        month={month}
      />
    </>
  );
}
