import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/hooks/useAuth";
import { createTemplate, fetchSectors, fetchTemplates, updateTemplate } from "@/services/admin";
import { WEEKDAY_LABELS, hhmm } from "@/lib/date-utils";
import type { Sector, TaskTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/atividades")({
  head: () => ({
    meta: [
      { title: "Atividades | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Cadastre e edite os modelos de atividades da rotina: horário, grupo, dias da semana e setor.",
      },
      { property: "og:title", content: "Atividades | Rotina de Supervisores" },
      { property: "og:description", content: "Modelos de atividades por setor e horário." },
    ],
  }),
  component: () => (
    <AdminGate>
      <AtividadesPage />
    </AdminGate>
  ),
});

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface FormState {
  id: string | null;
  sector_id: string;
  title: string;
  group_name: string;
  due_time: string;
  weekdays: number[];
  sort_order: number;
  is_active: boolean;
}

const EMPTY: FormState = {
  id: null,
  sector_id: "",
  title: "",
  group_name: "",
  due_time: "08:00",
  weekdays: ALL_DAYS,
  sort_order: 0,
  is_active: true,
};

function AtividadesPage() {
  const { sector } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [activeSector, setActiveSector] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const secs = await fetchSectors();
      setSectors(secs);
      const current = activeSector || secs[0]?.id || "";
      setActiveSector(current);
      const list = (await fetchTemplates(current)) as TaskTemplate[];
      setTemplates(list);
    } catch {
      toast.error("Não foi possível carregar as atividades.");
    } finally {
      setLoading(false);
    }
  }, [activeSector]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setForm({ ...EMPTY, sector_id: activeSector, sort_order: templates.length + 1 });
  }

  function openEdit(template: TaskTemplate) {
    setForm({
      id: template.id,
      sector_id: template.sector_id,
      title: template.title,
      group_name: template.group_name,
      due_time: hhmm(template.due_time),
      weekdays: template.weekdays ?? ALL_DAYS,
      sort_order: template.sort_order,
      is_active: template.is_active,
    });
  }

  async function submit() {
    if (!form) return;
    if (form.title.trim().length < 3) {
      toast.error("Descreva a atividade.");
      return;
    }
    if (form.weekdays.length === 0) {
      toast.error("Selecione ao menos um dia da semana.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sector_id: form.sector_id,
        title: form.title.trim(),
        group_name: form.group_name.trim() || "Geral",
        due_time: `${form.due_time}:00`,
        weekdays: form.weekdays,
        sort_order: form.sort_order,
        is_active: form.is_active,
      };
      if (form.id) await updateTemplate(form.id, payload);
      else await createTemplate(payload);
      toast.success("Atividade salva.");
      setForm(null);
      await load();
    } catch {
      toast.error("Não foi possível salvar a atividade.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: TaskTemplate) {
    try {
      await updateTemplate(template.id, { is_active: !template.is_active });
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? { ...t, is_active: !t.is_active } : t)),
      );
    } catch {
      toast.error("Não foi possível alterar a atividade.");
    }
  }

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Atividades</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Modelos que geram o checklist diário de cada setor.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Nova atividade
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {sectors.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSector(s.id)}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold transition-colors",
              activeSector === s.id ? "bg-navy text-white" : "bg-card text-muted-foreground",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid min-h-[200px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-2">
          {templates.length === 0 && (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-xs font-bold">Nenhuma atividade cadastrada neste setor</p>
              <p className="max-w-sm text-[11px] text-muted-foreground">
                Cadastre as atividades deste setor para que o checklist diário seja gerado
                automaticamente para os supervisores dele.
              </p>
              <Button onClick={openNew} className="mt-1">
                <Plus className="size-4" /> Nova atividade
              </Button>
            </div>
          )}

          {templates.map((template) => (
            <article
              key={template.id}
              className="grid gap-2 rounded-xl border border-border bg-card p-4 shadow-card md:grid-cols-[70px_minmax(0,1fr)_auto] md:items-center"
            >
              <b className="text-xs">{hhmm(template.due_time)}</b>
              <div className="min-w-0">
                <p className="m-0 truncate text-[12px]">{template.title}</p>
                <small className="text-[10px] text-muted-foreground">
                  {template.group_name} ·{" "}
                  {(template.weekdays ?? []).length === 7
                    ? "Todos os dias"
                    : (template.weekdays ?? [])
                        .map((d) => WEEKDAY_LABELS[d]?.slice(0, 3))
                        .join(", ")}
                </small>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={template.is_active}
                  onCheckedChange={() => void toggleActive(template)}
                  aria-label="Ativar atividade"
                />
                <Button size="sm" variant="outline" onClick={() => openEdit(template)}>
                  Editar
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          </DialogHeader>

          {form && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Setor</Label>
                <Select
                  value={form.sector_id}
                  onValueChange={(value) => setForm({ ...form, sector_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="title">Atividade</Label>
                <Input
                  id="title"
                  value={form.title}
                  maxLength={300}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="group">Grupo</Label>
                  <Input
                    id="group"
                    value={form.group_name}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="time">Horário</Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.due_time}
                    onChange={(e) => setForm({ ...form, due_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DAYS.map((day) => {
                    const on = form.weekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            weekdays: on
                              ? form.weekdays.filter((d) => d !== day)
                              : [...form.weekdays, day].sort(),
                          })
                        }
                        className={cn(
                          "rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold",
                          on ? "bg-navy text-white" : "bg-card text-muted-foreground",
                        )}
                      >
                        {WEEKDAY_LABELS[day]?.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                <Label htmlFor="active" className="text-[11px]">
                  Atividade ativa
                </Label>
                <Switch
                  id="active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
