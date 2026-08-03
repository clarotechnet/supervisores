import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useAuth } from "@/hooks/useAuth";
import { addDays, formatShortDate, hhmm, todayKey } from "@/lib/date-utils";
import type { AssignedTask, Profile } from "@/lib/types";
import { fetchProfiles } from "@/services/admin";
import { createAssignedTask, deleteAssignedTask, fetchAssignedTasks } from "@/services/tasks";

export const Route = createFileRoute("/_app/tarefas")({
  component: TarefasPage,
});

interface TaskForm {
  assignedTo: string;
  title: string;
  groupName: string;
  scheduledDate: string;
  dueTime: string;
  note: string;
}

function TarefasPage() {
  const { user, profile, sector, isAdmin } = useAuth();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TaskForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskList, people] = await Promise.all([
        fetchAssignedTasks(addDays(todayKey(), -7), addDays(todayKey(), 60)),
        isAdmin ? fetchProfiles() : Promise.resolve([]),
      ]);
      setTasks(taskList);
      setProfiles(people.filter((item) => item.status === "active"));
    } catch {
      toast.error("Não foi possível carregar as tarefas avulsas.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => void load(), [load]);

  const names = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.full_name])),
    [profiles],
  );

  function openNew() {
    setForm({
      assignedTo: user?.id ?? "",
      title: "",
      groupName: "Tarefa avulsa",
      scheduledDate: todayKey(),
      dueTime: "09:00",
      note: "",
    });
  }

  async function submit() {
    if (!form || !user || !profile) return;
    if (form.title.trim().length < 3) {
      toast.error("Descreva a tarefa.");
      return;
    }
    const target = isAdmin ? profiles.find((item) => item.id === form.assignedTo) : profile;
    if (!target?.sector_id) {
      toast.error("O usuário selecionado ainda não possui setor.");
      return;
    }

    setSaving(true);
    try {
      await createAssignedTask({
        assigned_to: target.id,
        assigned_by: user.id,
        sector_id: target.sector_id,
        title: form.title.trim(),
        group_name: form.groupName.trim() || "Tarefa avulsa",
        scheduled_date: form.scheduledDate,
        due_time: `${form.dueTime}:00`,
        note: form.note.trim() || null,
      });
      toast.success(
        target.id === user.id ? "Tarefa adicionada à sua rotina." : "Tarefa atribuída com sucesso.",
      );
      setForm(null);
      await load();
    } catch {
      toast.error("Não foi possível criar a tarefa.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(task: AssignedTask) {
    if (
      !window.confirm(`Excluir a tarefa “${task.title}”? O histórico já gerado será preservado.`)
    ) {
      return;
    }
    try {
      await deleteAssignedTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      toast.success("Tarefa excluída da agenda.");
    } catch {
      toast.error("Não foi possível excluir a tarefa.");
    }
  }

  return (
    <AppShell areaColor={sector?.color}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{isAdmin ? "Delegar tarefas" : "Minhas tarefas"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin
              ? "Adicione tarefas ao seu painel ou à rotina de qualquer supervisor."
              : "Crie tarefas avulsas somente para a sua própria rotina."}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Nova tarefa
        </Button>
      </header>

      {loading ? (
        <div className="grid min-h-52 place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-bold">Nenhuma tarefa avulsa no período</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            As 109 atividades padrão continuam sendo geradas automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-card md:grid-cols-[125px_minmax(0,1fr)_180px_auto] md:items-center"
            >
              <div>
                <b className="block text-xs">{formatShortDate(task.scheduled_date)}</b>
                <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="size-3" /> {hhmm(task.due_time)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{task.title}</p>
                <small className="text-[10px] text-muted-foreground">{task.group_name}</small>
                {task.note && <p className="mt-1 text-[10px] text-muted-foreground">{task.note}</p>}
              </div>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <UserRound className="size-3" />
                {names.get(task.assigned_to) ??
                  (task.assigned_to === user?.id ? profile?.full_name : "Supervisor")}
              </span>
              {(isAdmin || task.assigned_by === user?.id) && (
                <Button size="sm" variant="outline" onClick={() => void remove(task)}>
                  <Trash2 className="size-3.5" /> Excluir
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              {isAdmin && (
                <div className="grid gap-1.5">
                  <Label>Responsável</Label>
                  <Select
                    value={form.assignedTo}
                    onValueChange={(value) => setForm({ ...form, assignedTo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.full_name}
                          {item.id === user?.id ? " (você)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="task-title">Tarefa</Label>
                <Input
                  id="task-title"
                  maxLength={300}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="task-group">Grupo</Label>
                <Input
                  id="task-group"
                  maxLength={120}
                  value={form.groupName}
                  onChange={(event) => setForm({ ...form, groupName: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="task-date">Data</Label>
                  <Input
                    id="task-date"
                    type="date"
                    min={todayKey()}
                    value={form.scheduledDate}
                    onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="task-time">Horário</Label>
                  <Input
                    id="task-time"
                    type="time"
                    value={form.dueTime}
                    onChange={(event) => setForm({ ...form, dueTime: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="task-note">Orientação</Label>
                <Textarea
                  id="task-note"
                  maxLength={1000}
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Salvando..." : "Adicionar tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
