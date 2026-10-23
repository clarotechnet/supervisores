import { describe, expect, it } from "vitest";
import {
  isIncomingMessage,
  notificationCenterItems,
  updateUnreadItem,
} from "../src/lib/notification-center";
import type { AppNotification, ConversationMessage } from "../src/lib/types";

const task: AppNotification = {
  id: "n1",
  recipient_id: "s1",
  type: "task_assigned",
  title: "Tarefa delegada",
  message: "Conferir indicadores",
  entity_id: null,
  metadata: { scheduled_date: "2026-10-23", due_time: "14:00:00" },
  read_at: null,
  created_at: "2026-10-23T11:00:00Z",
};
const message: ConversationMessage = {
  id: "m1",
  supervisor_id: "s1",
  manager_id: "a1",
  sender_id: "a1",
  sender_role: "admin",
  body: "Mensagem da gestão",
  read_at: null,
  created_at: "2026-10-23T12:00:00Z",
};
const overdue = [
  {
    id: "t1",
    user_id: "s1",
    supervisor_name: "Ana",
    title: "Conferir rota",
    scheduled_time: "08:00:00",
  },
  {
    id: "t2",
    user_id: "s1",
    supervisor_name: "Ana",
    title: "Atualizar registro",
    scheduled_time: "08:10:00",
  },
  {
    id: "t3",
    user_id: "s2",
    supervisor_name: "Bruno",
    title: "Conferir backlog",
    scheduled_time: "09:00:00",
  },
];

describe("central de notificações no cabeçalho", () => {
  it("agrupa atrasos por supervisor e mantém as outras notificações em ordem recente", () => {
    const items = notificationCenterItems([task], [message], overdue, new Set(), "admin");
    expect(items.map((item) => item.kind)).toEqual(["overdue", "overdue", "message", "task"]);
    expect(items[0]?.title).toBe("Ana está com 2 atividades atrasadas");
    expect(items[1]?.title).toBe("Bruno está com 1 atividade atrasada");
    expect(items[3]?.description).toContain("23/10/2026 às 14:00");
  });
  it("dispensa atrasos apenas na sessão e volta a mostrar o grupo se chegar uma nova atividade", () => {
    const dismissed = new Set(["t1", "t2"]);
    const first = notificationCenterItems([], [], overdue, dismissed, "admin");
    expect(first).toHaveLength(1);
    const next = notificationCenterItems(
      [],
      [],
      [...overdue, { ...overdue[0]!, id: "t4" }],
      dismissed,
      "admin",
    );
    expect(next).toHaveLength(2);
    expect(next[0]?.title).toBe("Ana está com 3 atividades atrasadas");
    expect(dismissed.size).toBe(2);
  });
  it("não inclui notificações e mensagens já lidas", () => {
    const read_at = "2026-10-23T13:00:00Z";
    expect(
      notificationCenterItems(
        [{ ...task, read_at }],
        [{ ...message, read_at }],
        [],
        new Set(),
        "supervisor",
      ),
    ).toEqual([]);
  });
  it("preserva o texto e o tipo de uma menção para abrir a observação completa", () => {
    const mention = {
      ...task,
      type: "task_note_mention" as const,
      metadata: { task_title: "Rota" },
      message: "Observação longa\ncom outra linha",
    };
    const item = notificationCenterItems([mention], [], [], new Set(), "supervisor")[0];
    expect(item?.kind).toBe("mention");
    expect(item?.description).toBe(mention.message);
  });
  it("não duplica itens recebidos na consulta inicial e no tempo real", () => {
    const rows = [task];
    const updated = updateUnreadItem(rows, { ...task, title: "Título atualizado" });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.title).toBe("Título atualizado");
    expect(rows[0]?.title).toBe("Tarefa delegada");
  });
  it("remove um item que foi marcado como lido em outra tela", () => {
    expect(updateUnreadItem([task], { ...task, read_at: "2026-10-23T13:00:00Z" })).toEqual([]);
  });
  it("aceita apenas mensagens recebidas pelo papel e supervisor corretos", () => {
    expect(isIncomingMessage(message, "s1", "supervisor")).toBe(true);
    expect(isIncomingMessage(message, "s2", "supervisor")).toBe(false);
    expect(isIncomingMessage(message, "a1", "admin")).toBe(false);
    expect(isIncomingMessage(message, "c1", "controller")).toBe(false);
    expect(
      isIncomingMessage({ ...message, sender_id: "s1", sender_role: "supervisor" }, "a1", "admin"),
    ).toBe(true);
  });
  it("mantém a central vazia sem fabricar alertas", () => {
    expect(notificationCenterItems([], [], [], new Set(), "admin")).toEqual([]);
  });
});
