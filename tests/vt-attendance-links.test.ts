import { describe, expect, it } from "vitest";
import { parseVtAttendanceLinks, vtAttendanceLinksKey } from "../src/hooks/useVtAttendanceLinks";

describe("vínculos manuais da prévia VT", () => {
  it("não compartilha confirmações entre usuários, cidades ou competências", () => {
    const keys = [
      vtAttendanceLinksKey("user-1", "fortaleza", "2026-11"),
      vtAttendanceLinksKey("user-2", "fortaleza", "2026-11"),
      vtAttendanceLinksKey("user-1", "natal", "2026-11"),
      vtAttendanceLinksKey("user-1", "fortaleza", "2026-12"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(vtAttendanceLinksKey(undefined, "fortaleza", "2026-11")).toBeUndefined();
  });

  it("recupera os logins confirmados e ignora dados de navegador inválidos", () => {
    const data = JSON.stringify([
      [" Bruno Fréire ", "LOGIN:z1"],
      ["FABIO DE SOUSA", "LOGIN:Z2"],
      ["INVÁLIDO", "NOME:X"],
      ["SEM LOGIN", "LOGIN:"],
      [1, "LOGIN:Z3"],
    ]);
    expect(parseVtAttendanceLinks(data)).toEqual(
      new Map([
        ["BRUNO FREIRE", "LOGIN:Z1"],
        ["FABIO DE SOUSA", "LOGIN:Z2"],
      ]),
    );
    for (const raw of [null, "{", '{"BRUNO FREIRE":"LOGIN:Z1"}']) {
      expect(parseVtAttendanceLinks(raw).size).toBe(0);
    }
  });
});
