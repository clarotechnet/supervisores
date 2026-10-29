import { describe, it, expect } from "vitest";
import {
  filterScheduleTeam,
  scheduleRoleDetails,
  schedulePersonStats,
  scheduleVisibleDates,
  scheduleTeamCsv,
} from "../src/lib/schedule-dashboard";
import type { SchedulePerson } from "../src/lib/types";
const people: SchedulePerson[] = [
  {
    name: "ANA TESTE",
    login: "Z01",
    jobTitle: "CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO",
    assignments: {
      "2026-11-30": "PLANTÃO",
      "2026-12-01": "T. 1",
      "2026-12-02": "Folga",
      "2026-12-03": "Férias",
      "2026-12-04": "AT",
      "2026-12-05": "FALTA",
      "2026-12-06": "PLANTÃO",
    },
  },
  {
    name: "BRUNO TESTE",
    login: "Z02",
    jobTitle: "SUPERVISOR COP NTL",
    assignments: { "2026-12-06": "T. 1" },
  },
  { name: "CARLA TESTE", jobTitle: "ANALISTA DE CAMPO", assignments: { "2026-12-06": "Folga" } },
];
describe("dados da nova apresentação de escalas", () => {
  it("usa somente a função e as bases presentes no cadastro sem excluir outros cargos", () => {
    expect(scheduleRoleDetails(people[0]!.jobTitle)).toEqual({
      kind: "Controlador",
      area: "Adesão",
      bases: ["FTZ", "MSRO"],
    });
    expect(scheduleRoleDetails(people[2]!.jobTitle).kind).toBe("Analista");
    expect(filterScheduleTeam(people, "")).toEqual(people);
  });
  it("combina busca acentuada, função, área e base sem modificar a seleção", () => {
    const before = JSON.stringify(people);
    expect(
      filterScheduleTeam(people, "adesao", "Controlador", "Adesão", "MSRO").map((p) => p.name),
    ).toEqual(["ANA TESTE"]);
    expect(filterScheduleTeam(people, "z02").map((p) => p.name)).toEqual(["BRUNO TESTE"]);
    expect(JSON.stringify(people)).toBe(before);
  });
  it("conta o mês exibido sem somar o dia anterior", () => {
    expect(schedulePersonStats(people[0]!, "2026-12")).toMatchObject({
      work: 2,
      off: 1,
      vacation: 1,
      certificate: 1,
      absence: 1,
      duty: 1,
      dutyDates: ["2026-12-06"],
    });
  });
  it("não inventa plantão por haver trabalho no domingo", () => {
    expect(schedulePersonStats(people[1]!, "2026-12").duty).toBe(0);
  });
  it("inclui o último dia anterior apenas quando já consta no payload oficial", () => {
    expect(scheduleVisibleDates("2026-12", ["2026-11-30"])[0]).toBe("2026-11-30");
    expect(scheduleVisibleDates("2026-12", ["2026-11-29"])[0]).toBe("2026-12-01");
    expect(scheduleVisibleDates("2027-01", [])).toHaveLength(31);
  });
  it("exporta somente as pessoas e o mês solicitados com códigos originais", () => {
    const csv = scheduleTeamCsv([people[0]!], "2026-12");
    expect(csv).toContain('"2026-12-06";"ANA TESTE";"Z01"');
    expect(csv).not.toContain("BRUNO TESTE");
    expect(csv).not.toContain("2026-11-30");
    expect(csv).toContain('"PLANTÃO"');
  });
  it("protege texto iniciado por fórmula ao exportar CSV", () => {
    const csv = scheduleTeamCsv(
      [{ ...people[0]!, name: "=TEST()", assignments: { "2026-12-01": "=1+1" } }],
      "2026-12",
    );
    expect(csv).toContain('"\'=TEST()"');
    expect(csv).toContain('"\'=1+1"');
  });
});
