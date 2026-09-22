import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lightbulb, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SCHEDULE_CITY_OPTIONS,
  SCHEDULE_SECTOR_OPTIONS,
  SCHEDULE_SUGGESTION_CATEGORIES,
  SCHEDULE_SUGGESTION_STATUS_LABELS,
  type ScheduleSuggestion,
  type ScheduleSuggestionCategory,
  type ScheduleSuggestionStatus,
  type ScheduleUpload,
} from "@/lib/types";
import {
  createScheduleSuggestion,
  fetchScheduleSuggestions,
  reviewScheduleSuggestion,
} from "@/services/schedules";

interface ScheduleSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  userId: string;
  schedule: ScheduleUpload | null;
}

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null,
): string {
  return options.find((option) => option.value === value)?.label ?? value ?? "";
}

function suggestionContext(suggestion: ScheduleSuggestion): string {
  if (!suggestion.city || !suggestion.sector || !suggestion.schedule_month) return "Sugestão geral";
  const month = new Date(`${suggestion.schedule_month.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );
  return `${optionLabel(SCHEDULE_CITY_OPTIONS, suggestion.city)} · ${optionLabel(SCHEDULE_SECTOR_OPTIONS, suggestion.sector)} · ${month}`;
}

function statusClass(status: ScheduleSuggestionStatus): string {
  if (status === "completed") return "border-success/25 bg-success/10 text-success";
  if (status === "reviewing") return "border-warning/25 bg-warning-soft text-warning-foreground";
  return "border-primary/25 bg-primary/5 text-primary";
}

export function ScheduleSuggestionsDialog({
  open,
  onOpenChange,
  isAdmin,
  userId,
  schedule,
}: ScheduleSuggestionsDialogProps) {
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<ScheduleSuggestionCategory>("improvement");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSuggestions(await fetchScheduleSuggestions());
    } catch {
      toast.error("Não foi possível carregar as sugestões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function submit() {
    if (title.trim().length < 3 || message.trim().length < 5) {
      toast.error("Informe um título e descreva melhor a sugestão.");
      return;
    }
    setSaving(true);
    try {
      await createScheduleSuggestion({ authorId: userId, category, title, message, schedule });
      setTitle("");
      setMessage("");
      setCategory("improvement");
      await load();
      toast.success("Sugestão enviada ao gestor.");
    } catch {
      toast.error("Não foi possível enviar a sugestão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="size-5 text-primary" /> Sugestões de escalas
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Acompanhe as ideias dos controladores, responda e atualize o andamento."
              : "Envie uma melhoria, correção ou ideia. Você acompanha aqui somente as suas sugestões."}
          </DialogDescription>
        </DialogHeader>

        {!isAdmin && (
          <section className="grid gap-4 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as ScheduleSuggestionCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_SUGGESTION_CATEGORIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="suggestion-title">Título</Label>
                <Input
                  id="suggestion-title"
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex.: destacar trocas recentes"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="suggestion-message">Detalhes</Label>
              <Textarea
                id="suggestion-message"
                value={message}
                maxLength={2000}
                rows={4}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Explique o que pode ser melhorado ou adicionado."
              />
              <p className="text-[10px] text-muted-foreground">
                {schedule
                  ? `Vinculada à escala de ${optionLabel(SCHEDULE_CITY_OPTIONS, schedule.city)} · ${optionLabel(SCHEDULE_SECTOR_OPTIONS, schedule.sector)}.`
                  : "Sem uma escala selecionada, a sugestão será enviada como geral."}
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submit()} disabled={saving || !userId}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquareText className="size-4" />
                )}
                Enviar sugestão
              </Button>
            </div>
          </section>
        )}

        <section className="grid gap-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
            {isAdmin ? "Sugestões recebidas" : "Minhas sugestões"}
          </h3>
          {loading ? (
            <div className="grid min-h-32 place-items-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              Nenhuma sugestão registrada.
            </p>
          ) : (
            suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isAdmin={isAdmin}
                managerId={userId}
                onSaved={load}
              />
            ))
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionCard({
  suggestion,
  isAdmin,
  managerId,
  onSaved,
}: {
  suggestion: ScheduleSuggestion;
  isAdmin: boolean;
  managerId: string;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<ScheduleSuggestionStatus>(suggestion.status);
  const [response, setResponse] = useState(suggestion.manager_response ?? "");
  const [saving, setSaving] = useState(false);
  const category = SCHEDULE_SUGGESTION_CATEGORIES.find(
    (option) => option.value === suggestion.category,
  )?.label;

  async function saveReview() {
    setSaving(true);
    try {
      await reviewScheduleSuggestion({
        id: suggestion.id,
        status,
        managerResponse: response,
        managerId,
      });
      await onSaved();
      toast.success("Sugestão atualizada.");
    } catch {
      toast.error("Não foi possível atualizar a sugestão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm">{suggestion.title}</b>
            <Badge variant="outline" className={statusClass(suggestion.status)}>
              {SCHEDULE_SUGGESTION_STATUS_LABELS[suggestion.status]}
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {isAdmin && `${suggestion.author_name} · `}
            {category} · {suggestionContext(suggestion)} ·{" "}
            {new Date(suggestion.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{suggestion.message}</p>

      {isAdmin ? (
        <div className="mt-4 grid gap-3 rounded-lg bg-secondary/40 p-3">
          <div className="grid gap-1.5 sm:grid-cols-[160px_1fr]">
            <div className="grid gap-1.5">
              <Label>Andamento</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as ScheduleSuggestionStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEDULE_SUGGESTION_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`response-${suggestion.id}`}>Resposta do gestor</Label>
              <Textarea
                id={`response-${suggestion.id}`}
                rows={2}
                maxLength={2000}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder="Retorno opcional para o controlador"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void saveReview()} disabled={saving || !managerId}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Salvar retorno
            </Button>
          </div>
        </div>
      ) : suggestion.manager_response ? (
        <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3">
          <b className="text-[10px] uppercase tracking-wide text-primary">Resposta do gestor</b>
          <p className="mt-1 whitespace-pre-wrap text-xs">{suggestion.manager_response}</p>
        </div>
      ) : null}
    </article>
  );
}
