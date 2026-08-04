import { describe, expect, it } from "vitest";
import { SECTOR_OPTIONS } from "../src/lib/types";

describe("setores disponíveis no cadastro", () => {
  it("oferece a opção Supervisor MDU", () => {
    expect(SECTOR_OPTIONS).toContainEqual({ slug: "mdu", label: "Supervisor MDU" });
  });
});
