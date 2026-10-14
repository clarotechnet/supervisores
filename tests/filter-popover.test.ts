import { describe, expect, it } from "vitest";
import { filterPopoverPosition } from "../src/lib/filter-popover";

describe("caixas de filtros ancoradas", () => {
  it("abre abaixo do próprio botão mesmo com cabeçalho do sistema", () => {
    expect(
      filterPopoverPosition(
        { left: 750, top: 101, bottom: 139 },
        { width: 300, height: 530 },
        { width: 1366, height: 768 },
      ),
    ).toEqual({ left: 750, top: 147, maxHeight: 613 });
  });
  it("mantém o menu dentro da borda direita", () => {
    const result = filterPopoverPosition(
      { left: 1250, top: 100, bottom: 130 },
      { width: 320, height: 250 },
      { width: 1366, height: 768 },
    );
    expect(result.left).toBe(1038);
    expect(result.top).toBe(138);
  });
  it("vira para cima quando não há espaço abaixo", () => {
    const result = filterPopoverPosition(
      { left: 40, top: 650, bottom: 690 },
      { width: 270, height: 240 },
      { width: 1366, height: 768 },
    );
    expect(result.top).toBe(402);
    expect(result.maxHeight).toBe(634);
  });
  it("limita a altura disponível e a largura em telas pequenas", () => {
    const result = filterPopoverPosition(
      { left: 180, top: 30, bottom: 60 },
      { width: 320, height: 530 },
      { width: 280, height: 320 },
    );
    expect(result.left).toBe(8);
    expect(result.top).toBe(68);
    expect(result.maxHeight).toBe(244);
  });
});
