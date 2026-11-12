import { describe, expect, it } from "vitest";
import { parseQQMigrationGoal } from "../src/components/quality/reference-qq-goals";

describe("meta temporária de quebra de Migração", () => {
  it.each([
    ["27", 0.27],
    ["27%", 0.27],
    [" 27 % ", 0.27],
    ["27,5", 0.275],
    ["27.5%", 0.275],
    ["0", 0],
    ["100", 1],
  ] as const)("interpreta %s como percentual, inclusive limites", (value, expected) => {
    expect(parseQQMigrationGoal(value)).toBe(expected);
  });
  it.each(["", " ", "-1", "100,1", "101%", "NaN", "Infinity", "1e2", "27texto", "27%%", "27,5.5"])(
    "recusa valor inválido %s em vez de aplicar uma meta incorreta",
    (value) => expect(parseQQMigrationGoal(value)).toBeNull(),
  );
});
