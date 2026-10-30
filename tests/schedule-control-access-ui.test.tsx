import { controlAccessRequestCity } from "../src/lib/schedule-control-access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
const state = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    error: null as Error | null,
    isPending: true,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  options: {} as Record<string, unknown>,
  mutate: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options = options;
    return state.query;
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
  useMutation: () => ({ isPending: false, mutate: state.mutate }),
}));
vi.mock("@/services/schedule-access", () => ({
  fetchControlAccess: vi.fn(),
  requestControlAccess: vi.fn(),
}));
import { useControlScheduleAccess } from "../src/hooks/useControlScheduleAccess";
import {
  ScheduleControlAccessShortcut,
  ScheduleControlAccessRequestPanel,
} from "../src/components/ScheduleControlAccessRequestDialog";
const noop = () => undefined;
const defaults: ComponentProps<typeof ScheduleControlAccessRequestPanel> = {
  city: "natal",
  cityLabel: "Natal",
  allowed: false,
  loading: false,
  error: null,
  request: null,
  onRefresh: noop,
  onViewSchedule: noop,
};
function panel(props: Partial<typeof defaults> = {}) {
  return renderToStaticMarkup(<ScheduleControlAccessRequestPanel {...defaults} {...props} />);
}
function probe(
  admin = false,
  sector = "controle-operacional",
  active = true,
  userId: string | undefined = "user",
) {
  function Probe() {
    const value = useControlScheduleAccess(userId, admin, "natal", sector, active);
    return <output>{JSON.stringify({ allowed: value.allowed, loading: value.loading })}</output>;
  }
  return renderToStaticMarkup(<Probe />);
}
describe("atalho e pedido de acesso ao Controle", () => {
  beforeEach(() => {
    state.query.data = undefined;
    state.query.error = null;
    state.query.isPending = true;
    state.query.isFetching = false;
    state.query.isError = false;
    state.options = {};
    state.mutate.mockClear();
  });
  it.each(["controller", "supervisor"] as const)(
    "mostra o atalho para %s mesmo fora da frente restrita",
    (role) => {
      const html = renderToStaticMarkup(
        <ScheduleControlAccessShortcut role={role} onRequest={noop} onReview={noop} />,
      );
      expect(html).toContain("Acesso ao Controle");
      expect(html).not.toContain("Autorizações Controle");
      expect(state.mutate).not.toHaveBeenCalled();
    },
  );
  it("administrador encontra as autorizações no cabeçalho", () => {
    expect(
      renderToStaticMarkup(
        <ScheduleControlAccessShortcut role="admin" onRequest={noop} onReview={noop} />,
      ),
    ).toContain("Autorizações Controle");
  });
  it("não mostra ações sem perfil carregado", () => {
    expect(
      renderToStaticMarkup(
        <ScheduleControlAccessShortcut role={undefined} onRequest={noop} onReview={noop} />,
      ),
    ).toBe("");
  });
  it.each(["natal", "mossoro", "fortaleza", "recife"])(
    "quem vem de %s alcança o Controle RN cadastrado em Natal",
    (city) => {
      expect(controlAccessRequestCity(city)).toBe("natal");
    },
  );
  it("sem autorização mostra motivo opcional e botão para solicitar, sem link do Sheets", () => {
    const html = panel();
    expect(html).toContain("Solicitar acesso");
    expect(html).toContain("Motivo da solicitação (opcional)");
    expect(html).not.toContain("docs.google.com");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("pedido pendente não gera outro botão de envio", () => {
    const html = panel({
      request: { status: "pending", requested_at: "2026-10-30T15:00:00Z" } as NonNullable<
        typeof defaults.request
      >,
    });
    expect(html).toContain("Aguarde");
    expect(html).not.toContain("> Solicitar acesso");
    expect(html).not.toContain("<textarea");
  });
  it.each(["denied", "revoked"] as const)(
    "permite reenviar após %s, mantendo o motivo do administrador",
    (status) => {
      const html = panel({
        request: { status, review_note: "Conferir com gestão" } as NonNullable<
          typeof defaults.request
        >,
      });
      expect(html).toContain("Conferir com gestão");
      expect(html).toContain("Solicitar acesso");
    },
  );
  it("autorizado pode abrir a escala sem solicitar outra aprovação", () => {
    const html = panel({ allowed: true });
    expect(html).toContain("Ver escala do Controle");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("docs.google.com");
  });
  it("carregamento ou erro não libera acesso nem envia pedido automaticamente", () => {
    expect(panel({ loading: true })).toContain("Verificando autorização");
    const html = panel({ error: Error("Serviço indisponível") });
    expect(html).toContain("Tentar novamente");
    expect(html).not.toContain("Ver escala do Controle");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("formulários da página e do popup têm identificadores diferentes", () => {
    const html = renderToStaticMarkup(
      <>
        <ScheduleControlAccessRequestPanel {...defaults} />
        <ScheduleControlAccessRequestPanel {...defaults} />
      </>,
    );
    const ids = [...html.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
  it("consulta autorização com a identidade e cidade na chave", () => {
    probe();
    expect(state.options.queryKey).toEqual(["schedule-control-access", "user", "natal"]);
    expect(state.options.enabled).toBe(true);
    expect(state.options.refetchInterval).toBe(15000);
  });
  it("popup fechado não consulta nem mantém polling", () => {
    probe(false, "controle-operacional", false);
    expect(state.options.enabled).toBe(false);
    expect(state.options.refetchInterval).toBe(false);
  });
  it("outras frentes mantêm consulta normal sem pedir autorização ao Controle", () => {
    expect(probe(false, "vt")).toContain("true");
    expect(state.options.enabled).toBe(false);
    expect(state.options.refetchInterval).toBe(false);
  });
  it("administrador não depende de aprovação", () => {
    expect(probe(true)).toContain("true");
    expect(state.options.enabled).toBe(false);
  });
  it("sem usuário a consulta permanece desabilitada", () => {
    probe(false, "controle-operacional", true, "");
    expect(state.options.enabled).toBe(false);
  });
  it("somente confirmação positiva do servidor libera a consulta", () => {
    state.query.isPending = false;
    state.query.data = { canView: false, request: { status: "pending" } };
    expect(probe()).toContain("false");
    state.query.data = { canView: true, request: { status: "approved" } };
    expect(probe()).toContain("true");
  });
  it("falha na verificação bloqueia também uma autorização em cache", () => {
    state.query.data = { canView: true };
    state.query.isError = true;
    state.query.error = Error("Falha");
    state.query.isPending = false;
    expect(probe()).toContain("false");
  });
});
