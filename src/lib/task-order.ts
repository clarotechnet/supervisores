import type { TaskRecord } from "./types";

export type TaskLane = "pending" | "late" | "done";

export function moveTaskRecord(
  records: TaskRecord[],
  sourceId: string,
  targetId: string,
): TaskRecord[] {
  const ordered = [...records].sort(
    (a, b) => a.display_order - b.display_order || a.scheduled_time.localeCompare(b.scheduled_time),
  );
  const sourceIndex = ordered.findIndex((record) => record.id === sourceId);
  const targetIndex = ordered.findIndex((record) => record.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return ordered;

  const [moved] = ordered.splice(sourceIndex, 1);
  if (!moved) return ordered;
  ordered.splice(targetIndex, 0, moved);
  return ordered.map((record, index) => ({ ...record, display_order: index }));
}

export function moveTaskRecordToLane(
  records: TaskRecord[],
  sourceId: string,
  targetLane: TaskLane,
  targetId?: string,
  completedAt = new Date().toISOString(),
): TaskRecord[] {
  const ordered = [...records].sort(
    (a, b) => a.display_order - b.display_order || a.scheduled_time.localeCompare(b.scheduled_time),
  );
  const sourceIndex = ordered.findIndex((record) => record.id === sourceId);
  if (sourceIndex < 0 || targetId === sourceId) return ordered;

  const [moved] = ordered.splice(sourceIndex, 1);
  if (!moved) return ordered;

  const targetIndex = targetId ? ordered.findIndex((record) => record.id === targetId) : -1;
  ordered.splice(targetIndex >= 0 ? targetIndex : ordered.length, 0, {
    ...moved,
    status:
      targetLane === "done"
        ? "completed"
        : moved.status === "completed"
          ? "reopened"
          : moved.status,
    completed_at:
      targetLane === "done"
        ? moved.status === "completed" && moved.completed_at
          ? moved.completed_at
          : completedAt
        : null,
  });

  return ordered.map((record, index) => ({ ...record, display_order: index }));
}
