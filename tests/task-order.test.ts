import { describe, expect, it } from "vitest";
import { moveTaskRecord, moveTaskRecordToLane } from "../src/lib/task-order";
import type { TaskRecord } from "../src/lib/types";

function record(id: string, displayOrder: number): TaskRecord {
  return {
    id,
    checklist_id: "checklist",
    task_template_id: null,
    assigned_task_id: null,
    user_id: "user",
    supervisor_name: "Supervisor",
    sector_id: "sector",
    title: id,
    group_name: "Grupo",
    scheduled_date: "2026-08-04",
    scheduled_time: "08:00:00",
    status: "pending",
    completed_at: null,
    display_order: displayOrder,
    note: null,
    updated_at: "2026-08-04T00:00:00Z",
  };
}

describe("ordenação manual da rotina", () => {
  it("move uma atividade e recalcula posições contínuas", () => {
    const moved = moveTaskRecord([record("a", 0), record("b", 1), record("c", 2)], "c", "a");
    expect(moved.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(moved.map((item) => item.display_order)).toEqual([0, 1, 2]);
  });

  it("mantém a ordem quando um identificador não existe", () => {
    const moved = moveTaskRecord([record("a", 0), record("b", 1)], "x", "a");
    expect(moved.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("move uma pendente para concluídas e registra a conclusão", () => {
    const moved = moveTaskRecordToLane(
      [record("a", 0), record("b", 1)],
      "a",
      "done",
      "b",
      "2026-08-04T12:00:00Z",
    );

    expect(moved.map((item) => item.id)).toEqual(["a", "b"]);
    expect(moved[0]).toMatchObject({
      status: "completed",
      completed_at: "2026-08-04T12:00:00Z",
    });
  });

  it("reabre uma concluída ao movê-la para pendentes", () => {
    const completed = {
      ...record("a", 0),
      status: "completed" as const,
      completed_at: "2026-08-04T12:00:00Z",
    };
    const moved = moveTaskRecordToLane([completed, record("b", 1)], "a", "pending");

    expect(moved.at(-1)).toMatchObject({ id: "a", status: "reopened", completed_at: null });
  });
});
