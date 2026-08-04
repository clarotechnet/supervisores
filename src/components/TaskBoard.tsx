import { useState, type DragEvent } from "react";
import { Check, Clock, GripVertical, MessageSquare, RotateCcw } from "lucide-react";
import { hhmm, isLate, localTime } from "@/lib/date-utils";
import type { TaskLane } from "@/lib/task-order";
import type { TaskRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface TaskColumns {
  pending: TaskRecord[];
  late: TaskRecord[];
  done: TaskRecord[];
}

export function splitRecords(records: TaskRecord[]): TaskColumns {
  const columns: TaskColumns = { pending: [], late: [], done: [] };
  const orderedRecords = [...records].sort(
    (a, b) => a.display_order - b.display_order || a.scheduled_time.localeCompare(b.scheduled_time),
  );
  for (const record of orderedRecords) {
    if (record.status === "completed") columns.done.push(record);
    else if (
      isLate({
        scheduledDate: record.scheduled_date,
        scheduledTime: record.scheduled_time,
        completed: false,
      })
    )
      columns.late.push(record);
    else columns.pending.push(record);
  }
  return columns;
}

interface CardProps {
  record: TaskRecord;
  draggable?: boolean | undefined;
  dragging?: boolean | undefined;
  dropTarget?: boolean | undefined;
  readOnly?: boolean | undefined;
  onDragStart?: ((event: DragEvent<HTMLElement>) => void) | undefined;
  onDragOver?: ((event: DragEvent<HTMLElement>) => void) | undefined;
  onDrop?: ((event: DragEvent<HTMLElement>) => void) | undefined;
  onDragEnd?: (() => void) | undefined;
  onToggle?: ((record: TaskRecord) => void) | undefined;
  onNote?: ((record: TaskRecord) => void) | undefined;
}

function TaskCard({
  record,
  draggable,
  dragging,
  dropTarget,
  readOnly,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggle,
  onNote,
}: CardProps) {
  const done = record.status === "completed";
  const late =
    !done &&
    isLate({
      scheduledDate: record.scheduled_date,
      scheduledTime: record.scheduled_time,
      completed: false,
    });

  return (
    <article
      draggable={draggable}
      aria-grabbed={dragging}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition-all hover:-translate-y-px hover:border-muted-foreground/35 hover:shadow-md",
        draggable && "cursor-grab pr-8 active:cursor-grabbing",
        dragging && "opacity-45",
        dropTarget && "ring-2 ring-area ring-offset-2",
        late && "border-l-4 border-l-late bg-late-soft/20",
        done && "border-success/35 bg-success-soft/30",
      )}
    >
      {draggable && (
        <GripVertical
          aria-hidden="true"
          className="absolute right-2 top-3 size-4 text-muted-foreground/60"
        />
      )}
      <button
        type="button"
        disabled={readOnly}
        aria-label={done ? "Reabrir atividade" : "Concluir atividade"}
        title={done ? "Reabrir atividade" : "Marcar como concluída"}
        onClick={() => onToggle?.(record)}
        className={cn(
          "mt-0.5 grid size-8 place-items-center self-start rounded-full border-2 shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          done && "border-success bg-success text-white hover:brightness-95",
          !done && !late && "border-area bg-white text-area hover:bg-area hover:text-white",
          !done && late && "border-late bg-white text-late hover:bg-late hover:text-white",
          readOnly && "cursor-default opacity-80",
        )}
      >
        {done ? (
          <Check className="size-4 stroke-[3]" />
        ) : (
          <span aria-hidden="true" className="size-2 rounded-full bg-current opacity-55" />
        )}
      </button>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-black text-foreground/70">
            <Clock className="size-3" /> {hhmm(record.scheduled_time)}
          </span>
          <span className="min-w-0 truncate text-[9px] uppercase tracking-wide text-muted-foreground">
            {record.group_name}
          </span>
          {record.status === "reopened" && (
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[8px] font-bold text-warning-foreground">
              Reaberta
            </span>
          )}
        </div>
        <h3
          className={cn(
            "m-0 text-[12px] leading-snug text-foreground",
            done && "text-muted-foreground line-through",
          )}
        >
          {record.title}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[9px] text-success-foreground">
            {done && record.completed_at ? `Concluída às ${localTime(record.completed_at)}` : ""}
          </span>
          <div className="flex items-center gap-1">
            {done && !readOnly && (
              <button
                type="button"
                onClick={() => onToggle?.(record)}
                className="flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1.5 text-[10px] font-semibold text-foreground/70 shadow-sm hover:border-area hover:text-area"
              >
                <RotateCcw className="size-3" /> Reabrir
              </button>
            )}
            <button
              type="button"
              onClick={() => onNote?.(record)}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold shadow-sm transition-colors",
                record.note
                  ? "border-warning/45 bg-warning-soft text-warning-foreground"
                  : "border-border bg-white text-foreground/70 hover:border-area hover:text-area",
              )}
            >
              <MessageSquare className="size-3" /> {record.note ? "Observação" : "Anotar"}
            </button>
          </div>
        </div>
        {record.note && (
          <p className="mt-2 rounded-md bg-muted p-2 text-[10px] text-muted-foreground">
            {record.note}
          </p>
        )}
      </div>
    </article>
  );
}

function Column({
  title,
  tone,
  records,
  readOnly,
  onToggle,
  onNote,
  draggedId,
  draggedTone,
  dropTargetId,
  dropTargetTone,
  onCardDragStart,
  onCardDragOver,
  onCardDrop,
  onColumnDragOver,
  onColumnDrop,
  onCardDragEnd,
}: {
  title: string;
  tone: "pending" | "late" | "done";
  records: TaskRecord[];
  readOnly?: boolean | undefined;
  onToggle?: ((r: TaskRecord) => void) | undefined;
  onNote?: ((r: TaskRecord) => void) | undefined;
  draggedId?: string | null | undefined;
  draggedTone?: TaskColumnsTone | null | undefined;
  dropTargetId?: string | null | undefined;
  dropTargetTone?: TaskColumnsTone | null | undefined;
  onCardDragStart?:
    | ((event: DragEvent<HTMLElement>, record: TaskRecord, tone: TaskColumnsTone) => void)
    | undefined;
  onCardDragOver?:
    | ((event: DragEvent<HTMLElement>, record: TaskRecord, tone: TaskColumnsTone) => void)
    | undefined;
  onCardDrop?:
    | ((event: DragEvent<HTMLElement>, record: TaskRecord, tone: TaskColumnsTone) => void)
    | undefined;
  onColumnDragOver?: ((event: DragEvent<HTMLElement>, tone: TaskColumnsTone) => void) | undefined;
  onColumnDrop?: ((event: DragEvent<HTMLElement>, tone: TaskColumnsTone) => void) | undefined;
  onCardDragEnd?: (() => void) | undefined;
}) {
  return (
    <section
      onDragOver={(event) => onColumnDragOver?.(event, tone)}
      onDrop={(event) => onColumnDrop?.(event, tone)}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border bg-neutral-soft transition-shadow",
        dropTargetTone === tone && !dropTargetId && "ring-2 ring-area ring-offset-2",
      )}
    >
      <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <i
            className={cn(
              "size-2.5 rounded-full ring-2 ring-white",
              tone === "late" && "bg-late",
              tone === "done" && "bg-success",
              tone === "pending" && "bg-muted-foreground",
            )}
          />
          <b className="text-[11px]">{title}</b>
        </div>
        <span className="min-w-7 rounded-full border border-border bg-secondary px-2 py-0.5 text-center text-[9px] font-black text-foreground/70">
          {records.length}
        </span>
      </header>
      <div className="grid max-h-[520px] min-h-[126px] content-start gap-2 overflow-auto p-2.5">
        {records.length === 0 ? (
          <p className="pointer-events-none p-8 text-center text-[10px] text-muted-foreground">
            Nada por aqui. Solte uma atividade nesta coluna.
          </p>
        ) : (
          records.map((record) => (
            <TaskCard
              key={record.id}
              record={record}
              draggable={!readOnly && Boolean(onCardDragStart)}
              dragging={draggedId === record.id}
              dropTarget={dropTargetId === record.id}
              readOnly={readOnly}
              onDragStart={(event) => onCardDragStart?.(event, record, tone)}
              onDragOver={(event) => onCardDragOver?.(event, record, tone)}
              onDrop={(event) => onCardDrop?.(event, record, tone)}
              onDragEnd={onCardDragEnd}
              onToggle={onToggle}
              onNote={onNote}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function TaskBoard({
  records,
  view,
  readOnly,
  onToggle,
  onSaveNote,
  onMove,
}: {
  records: TaskRecord[];
  view: "board" | "list";
  readOnly?: boolean | undefined;
  onToggle?: ((record: TaskRecord) => void) | undefined;
  onSaveNote?: ((record: TaskRecord, note: string) => Promise<void> | void) | undefined;
  onMove?:
    | ((sourceId: string, targetLane: TaskLane, targetId?: string) => Promise<void> | void)
    | undefined;
}) {
  const columns = splitRecords(records);
  const orderedRecords = [...records].sort(
    (a, b) => a.display_order - b.display_order || a.scheduled_time.localeCompare(b.scheduled_time),
  );
  const [noteFor, setNoteFor] = useState<TaskRecord | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedTone, setDraggedTone] = useState<TaskColumnsTone | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropTargetTone, setDropTargetTone] = useState<TaskColumnsTone | null>(null);

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    record: TaskRecord,
    tone: TaskColumnsTone,
  ) {
    if ((event.target as HTMLElement).closest("button, input, textarea")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", record.id);
    setDraggedId(record.id);
    setDraggedTone(tone);
  }

  function handleDragOver(
    event: DragEvent<HTMLElement>,
    record: TaskRecord,
    tone: TaskColumnsTone,
  ) {
    if (!canDropInTone(tone)) return;
    if (record.id === draggedId) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(record.id);
    setDropTargetTone(tone);
  }

  function handleDrop(event: DragEvent<HTMLElement>, record: TaskRecord, tone: TaskColumnsTone) {
    event.preventDefault();
    event.stopPropagation();
    if (draggedId && canDropInTone(tone) && draggedId !== record.id) {
      void onMove?.(draggedId, tone, record.id);
    }
    clearDrag();
  }

  function handleColumnDragOver(event: DragEvent<HTMLElement>, tone: TaskColumnsTone) {
    if (!canDropInTone(tone)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(null);
    setDropTargetTone(tone);
  }

  function handleColumnDrop(event: DragEvent<HTMLElement>, tone: TaskColumnsTone) {
    event.preventDefault();
    if (draggedId && canDropInTone(tone)) void onMove?.(draggedId, tone);
    clearDrag();
  }

  function canDropInTone(tone: TaskColumnsTone) {
    if (!draggedId || !draggedTone) return false;
    return draggedTone === tone || draggedTone === "done" || tone === "done";
  }

  function clearDrag() {
    setDraggedId(null);
    setDraggedTone(null);
    setDropTargetId(null);
    setDropTargetTone(null);
  }

  function openNote(record: TaskRecord) {
    setNoteFor(record);
    setNoteText(record.note ?? "");
  }

  async function submitNote() {
    if (!noteFor) return;
    setSaving(true);
    try {
      await onSaveNote?.(noteFor, noteText);
      setNoteFor(null);
    } finally {
      setSaving(false);
    }
  }

  if (records.length === 0) {
    return (
      <div className="grid min-h-[300px] place-content-center place-items-center rounded-2xl border border-dashed border-border bg-card text-center">
        <span className="text-3xl">🗓️</span>
        <h2 className="mb-1 mt-3 text-lg font-semibold">Nenhuma atividade para este dia</h2>
        <p className="m-0 text-[11px] text-muted-foreground">
          A rotina deste setor não prevê atividades nesta data.
        </p>
      </div>
    );
  }

  return (
    <>
      {view === "board" ? (
        <div className="grid items-start gap-3 md:grid-cols-3">
          <Column
            title="Pendentes"
            tone="pending"
            records={columns.pending}
            readOnly={readOnly}
            onToggle={onToggle}
            onNote={openNote}
            draggedId={draggedId}
            draggedTone={draggedTone}
            dropTargetId={dropTargetId}
            dropTargetTone={dropTargetTone}
            onCardDragStart={onMove ? handleDragStart : undefined}
            onCardDragOver={onMove ? handleDragOver : undefined}
            onCardDrop={onMove ? handleDrop : undefined}
            onColumnDragOver={onMove ? handleColumnDragOver : undefined}
            onColumnDrop={onMove ? handleColumnDrop : undefined}
            onCardDragEnd={clearDrag}
          />
          <Column
            title="Em atraso"
            tone="late"
            records={columns.late}
            readOnly={readOnly}
            onToggle={onToggle}
            onNote={openNote}
            draggedId={draggedId}
            draggedTone={draggedTone}
            dropTargetId={dropTargetId}
            dropTargetTone={dropTargetTone}
            onCardDragStart={onMove ? handleDragStart : undefined}
            onCardDragOver={onMove ? handleDragOver : undefined}
            onCardDrop={onMove ? handleDrop : undefined}
            onColumnDragOver={onMove ? handleColumnDragOver : undefined}
            onColumnDrop={onMove ? handleColumnDrop : undefined}
            onCardDragEnd={clearDrag}
          />
          <Column
            title="Concluídas"
            tone="done"
            records={columns.done}
            readOnly={readOnly}
            onToggle={onToggle}
            onNote={openNote}
            draggedId={draggedId}
            draggedTone={draggedTone}
            dropTargetId={dropTargetId}
            dropTargetTone={dropTargetTone}
            onCardDragStart={onMove ? handleDragStart : undefined}
            onCardDragOver={onMove ? handleDragOver : undefined}
            onCardDrop={onMove ? handleDrop : undefined}
            onColumnDragOver={onMove ? handleColumnDragOver : undefined}
            onColumnDrop={onMove ? handleColumnDrop : undefined}
            onCardDragEnd={clearDrag}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          {orderedRecords.map((record) => (
            <TaskCard
              key={record.id}
              record={record}
              draggable={!readOnly && Boolean(onMove)}
              dragging={draggedId === record.id}
              dropTarget={dropTargetId === record.id}
              readOnly={readOnly}
              onDragStart={(event) => handleDragStart(event, record, taskTone(record))}
              onDragOver={(event) => handleDragOver(event, record, taskTone(record))}
              onDrop={(event) => handleDrop(event, record, taskTone(record))}
              onDragEnd={clearDrag}
              onToggle={onToggle}
              onNote={openNote}
            />
          ))}
        </div>
      )}

      <Dialog open={noteFor !== null} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observação</DialogTitle>
            <DialogDescription>{noteFor?.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={1000}
            readOnly={readOnly}
            placeholder="Registre um detalhe sobre esta atividade..."
            className="min-h-28"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>
              Fechar
            </Button>
            {!readOnly && (
              <Button onClick={submitNote} disabled={saving}>
                {saving ? "Salvando..." : "Salvar observação"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type TaskColumnsTone = "pending" | "late" | "done";

function taskTone(record: TaskRecord): TaskColumnsTone {
  if (record.status === "completed") return "done";
  return isLate({
    scheduledDate: record.scheduled_date,
    scheduledTime: record.scheduled_time,
    completed: false,
  })
    ? "late"
    : "pending";
}
