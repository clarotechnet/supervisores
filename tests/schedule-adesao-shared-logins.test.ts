import { describe, expect, it } from "vitest";
import { mergeSheets } from "../supabase/functions/_shared/schedule-google-source";

const adesao = { city: "natal", sector: "adesao-servico" };
type Sheet = Parameters<typeof mergeSheets>[0][number];
const sheet = (title: string, people: Sheet["people"]): Sheet => ({
  title,
  people,
  dates: [...new Set(people.flatMap((person) => Object.keys(person.assignments)))],
  codes: [...new Set(people.flatMap((person) => Object.values(person.assignments)))],
});
const person = (
  name: string,
  login: string | undefined,
  fixedRest: string,
  assignments: Record<string, string> = {
    "2026-12-01": "M. 1",
  },
) => ({ name, login, fixedRest, assignments, jobTitle: "" });

describe("importação de Adesão-Serviço RN com login compartilhado", () => {
  it("trata FORA TOA como ausência de login e não mistura folgas", () => {
    const source = sheet("Dezembro 26 Adesão-Serviço", [
      person("PESSOA A", "FORA TOA", "Quinta"),
      person("PESSOA B", "  Fora   Toa ", "Terça"),
    ]);
    expect(() => mergeSheets([source])).toThrow("Folga fixa divergente");
    const result = mergeSheets([source], adesao);
    expect(result.people.map(({ name, login, fixedRest }) => ({ name, login, fixedRest }))).toEqual(
      [
        { name: "PESSOA A", login: undefined, fixedRest: "Quinta" },
        { name: "PESSOA B", login: undefined, fixedRest: "Terça" },
      ],
    );
    expect(source.people[0]!.login).toBe("FORA TOA");
  });

  it("mantém técnico e auxiliar com o mesmo login e suas linhas completas", () => {
    const assignments = { "2026-12-01": "M. 1", "2026-12-02": "Folga" };
    const source = sheet("Dezembro 26 Adesão-Serviço", [
      person("TECNICO A", "Z123", "Quarta", assignments),
      person("AUXILIAR B", "Z123", "Quarta", { ...assignments }),
    ]);
    const result = mergeSheets([source], adesao);
    expect(result.people).toHaveLength(2);
    expect(result.people.every((person) => person.login === "Z123")).toBe(true);
    expect(result.people.map((person) => person.assignments)).toEqual([assignments, assignments]);
    expect(result.entryCount).toBe(4);
  });

  it("consolida a mesma pessoa em abas diferentes, inclusive sem login individual", () => {
    const first = sheet("Parte 1", [
      person("TÉCNICO A", "z123", "Quarta"),
      person("PESSOA B", "FORA TOA", "Terça"),
    ]);
    const second = sheet("Parte 2", [
      person(" tecnico  A ", "Z123", "Quarta-feira", { "2026-12-02": "Folga" }),
      person("Pessoa B", undefined, "TER", { "2026-12-02": "M. 1" }),
    ]);
    const result = mergeSheets([first, second], adesao);
    expect(result.people).toHaveLength(2);
    expect(result.entryCount).toBe(4);
    expect(result.people.find((person) => person.login === "z123")?.assignments).toEqual({
      "2026-12-01": "M. 1",
      "2026-12-02": "Folga",
    });
    expect(result.people.find((person) => person.name === "PESSOA B")?.login).toBeUndefined();
  });

  it("continua rejeitando folga divergente da mesma pessoa e mantém as outras frentes intactas", () => {
    const first = sheet("Parte 1", [person("PESSOA A", "Z123", "Terça")]);
    const second = sheet("Parte 2", [person("Pessoa A", "Z123", "Quarta")]);
    expect(() => mergeSheets([first, second], adesao)).toThrow("Folga fixa divergente");
    const otherwiseShared = sheet("VT", [person("PESSOA B", "Z123", "Terça")]);
    expect(
      mergeSheets([first, otherwiseShared], { city: "natal", sector: "vt" }).people,
    ).toHaveLength(1);
  });
});
