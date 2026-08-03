import { describe, expect, it } from "vitest";
import {
  formatAssignmentNotification,
  formatOverdueTask,
  groupOverdueTasks,
} from "../src/lib/assignment-notification";

const assignmentNotification = {
  id: "notification-id",
  recipient_id: "supervisor-id",
  type: "task_assigned" as const,
  title: "Nova atividade atribuída pelo gestor",
  message: "Conferir indicadores do turno",
  entity_id: "task-id",
  metadata: {
    due_time: "14:30:00",
    scheduled_date: "2026-08-04",
  },
  read_at: null,
  created_at: "2026-08-03T17:00:00Z",
};

describe("notificação de nova atividade", () => {
  it("formata título, data e horário do aviso", () => {
    expect(formatAssignmentNotification(assignmentNotification)).toBe(
      "Conferir indicadores do turno · 04/08/2026 às 14:30",
    );
  });
});

describe("notificação de atraso para o gestor", () => {
  const overdueTasks = [
    {
      id: "task-1",
      user_id: "supervisor-1",
      supervisor_name: "Ana Lima",
      title: "Conferir rota do dia",
      scheduled_time: "08:00:00",
    },
    {
      id: "task-2",
      user_id: "supervisor-1",
      supervisor_name: "Ana Lima",
      title: "Verificar técnicos sem login",
      scheduled_time: "08:10:00",
    },
    {
      id: "task-3",
      user_id: "supervisor-2",
      supervisor_name: "João Silva",
      title: "Atualizar indicadores",
      scheduled_time: "09:00:00",
    },
  ];

  it("agrupa as atividades atrasadas por supervisor", () => {
    const groups = groupOverdueTasks(overdueTasks);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.supervisorName).toBe("Ana Lima");
    expect(groups[0]?.tasks).toHaveLength(2);
    expect(groups[1]?.supervisorName).toBe("João Silva");
  });

  it("mostra horário e nome da atividade atrasada", () => {
    expect(formatOverdueTask(overdueTasks[0]!)).toBe("08:00 · Conferir rota do dia");
  });
});
