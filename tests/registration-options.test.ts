import { describe, expect, it } from "vitest";
import { SECTOR_OPTIONS } from "../src/lib/types";
import { userRoleLabel } from "../src/lib/access";

describe("setores disponíveis no cadastro", () => {
  it("oferece a opção Supervisor MDU", () => {
    expect(SECTOR_OPTIONS).toContainEqual({ slug: "mdu", label: "Supervisor MDU" });
  });

  it("reconhece o novo tipo de usuário Controlador", () => {
    expect(userRoleLabel("controller")).toBe("Controlador");
  });
});
