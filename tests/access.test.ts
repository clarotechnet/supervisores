import { describe, expect, it } from "vitest";
import {
  canManageSchedulesForRole,
  isPathAllowedForRole,
  landingPathForRole,
  userRoleLabel,
} from "../src/lib/access";

describe("acesso do controlador", () => {
  it("entra diretamente em Escalas", () => {
    expect(landingPathForRole("controller")).toBe("/escalas");
    expect(userRoleLabel("controller")).toBe("Controlador");
  });

  it("não abre páginas de rotina ou administração", () => {
    expect(isPathAllowedForRole("controller", "/escalas")).toBe(true);
    expect(isPathAllowedForRole("controller", "/painel")).toBe(false);
    expect(isPathAllowedForRole("controller", "/admin")).toBe(false);
  });

  it("permite ao supervisor consultar e gerenciar escalas", () => {
    expect(isPathAllowedForRole("supervisor", "/escalas")).toBe(true);
    expect(isPathAllowedForRole("supervisor", "/painel")).toBe(true);
    expect(isPathAllowedForRole("admin", "/escalas")).toBe(true);
  });

  it("não permite ao controlador importar ou excluir escalas", () => {
    expect(canManageSchedulesForRole("controller")).toBe(false);
    expect(canManageSchedulesForRole("supervisor")).toBe(true);
    expect(canManageSchedulesForRole("admin")).toBe(true);
  });
});
