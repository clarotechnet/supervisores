import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  data: {} as unknown,
  error: null as unknown,
  calls: [] as Array<{ name: string; body: Record<string, unknown> }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, options: { body: Record<string, unknown> }) => {
        state.calls.push({ name, body: options.body });
        return { data: state.data, error: state.error };
      },
    },
  },
}));
import { canManageSchedulesForRole } from "../src/lib/access";
import {
  fetchControlAccess,
  requestControlAccess,
  reviewControlAccess,
  listControlAccessRequests,
  type ControlAccessRequest,
} from "../src/services/schedule-access";
describe("Controle operacional: consulta autorizada, gestão separada", () => {
  beforeEach(() => {
    state.data = { ok: true };
    state.error = null;
    state.calls = [];
  });
  it("administrador gerencia Controle sem alterar outros papéis", () => {
    expect(canManageSchedulesForRole("admin", "controle-operacional")).toBe(true);
    expect(canManageSchedulesForRole("controller", "controle-operacional")).toBe(false);
    expect(canManageSchedulesForRole("supervisor", "controle-operacional")).toBe(false);
  });
  it("supervisor mantém a gestão normal nas outras frentes", () => {
    for (const front of [
      "adesao-servico",
      "mdu",
      "vt",
      "construcao",
      "desconexao",
      "instalacao",
      "manutencao",
    ])
      expect(canManageSchedulesForRole("supervisor", front)).toBe(true);
    expect(canManageSchedulesForRole("supervisor")).toBe(true);
  });
  it("não concede consulta quando o servidor não confirmou boolean true", async () => {
    state.data = { ok: true, canView: "true" };
    expect((await fetchControlAccess("natal")).canView).toBe(false);
  });
  it("um pedido enviado continua sem acesso enquanto está pendente", async () => {
    state.data = { ok: true, canView: false, request: { status: "pending" } };
    const result = await fetchControlAccess("natal");
    expect(result.canView).toBe(false);
    expect(result.request?.status).toBe("pending");
  });
  it("consulta é liberada somente pela resposta de autorização", async () => {
    state.data = { ok: true, canView: true, request: { status: "approved" } };
    expect((await fetchControlAccess("natal")).canView).toBe(true);
  });
  it("solicitar nunca envia decisão, usuário-alvo ou aprovador", async () => {
    await requestControlAccess("natal", "  Consulta da equipe  ");
    expect(state.calls).toEqual([
      {
        name: "schedule-access",
        body: {
          action: "request",
          city: "natal",
          note: "Consulta da equipe",
        },
      },
    ]);
  });
  it("decisão inclui o timestamp revisado e não aceita identidade de aprovador no cliente", async () => {
    const request = {
      id: "request-id",
      updated_at: "2026-10-28T16:00:00Z",
    } as ControlAccessRequest;
    await reviewControlAccess(request, "revoked", " Retirado ");
    expect(state.calls[0]?.body).toEqual({
      action: "review",
      requestId: "request-id",
      updatedAt: request.updated_at,
      decision: "revoked",
      note: "Retirado",
    });
  });
  it("lista filtrada permite alcançar autorizações antigas", async () => {
    state.data = { ok: true, requests: [{ id: "older" }], total: 151, hasMore: true };
    const page = await listControlAccessRequests("approved", 100);
    expect(state.calls[0]?.body).toEqual({ action: "list", filter: "approved", offset: 100 });
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(151);
  });
  it("nega acesso quando a API falha", async () => {
    state.error = Error("Unavailable");
    await expect(fetchControlAccess("natal")).rejects.toThrow("Unavailable");
  });
  it("preserva o motivo de erro devolvido pela Edge", async () => {
    state.error = { context: Response.json({ error: "Acesso revogado" }, { status: 403 }) };
    await expect(fetchControlAccess("natal")).rejects.toThrow("Acesso revogado");
  });
  it("resposta incompleta não é interpretada como sucesso", async () => {
    state.data = null;
    await expect(requestControlAccess("natal", "")).rejects.toThrow("não confirmou");
  });
});

it("indica indisponibilidade do serviço quando a função de autorização não está publicada", async () => {
  state.error = {
    context: Response.json({ message: "Requested function not found" }, { status: 404 }),
  };
  await expect(fetchControlAccess("natal")).rejects.toThrow(
    "O serviço de autorizações está indisponível",
  );
});
