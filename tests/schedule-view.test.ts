import { describe, expect, it } from "vitest";
import type { SchedulePerson } from "../src/lib/types";
import { scheduleImagePages, SCHEDULE_IMAGE_ROWS } from "../src/lib/schedule-image";
import {
  compactScheduleCode,
  reconcileScheduleSelection,
  scheduleDayTotals,
  scheduleMonthDates,
} from "../src/lib/schedule-view";

const people: SchedulePerson[] = [
  {
    name: "Ana",
    jobTitle: "Controle",
    assignments: { "2026-10-01": "T. 1", "2026-10-02": "Folga" },
  },
  {
    name: "Bruno",
    jobTitle: "Controle",
    assignments: { "2026-10-01": "LCC.", "2026-10-02": "T. 2" },
  },
  { name: "Carla", jobTitle: "Controle", assignments: { "2026-10-01": "T. 2", "2026-10-02": "F" } },
];

describe("comparação mensal de escalas", () => {
  it("pagina a exportação Full HD sem perder ou duplicar colaboradores", () => {
    const many = Array.from({ length: 43 }, (_, index) => ({
      name: `Pessoa ${index}`,
      jobTitle: "Controle",
      assignments: {},
    }));
    const pages = scheduleImagePages(many);
    expect(pages.map((page) => page.length)).toEqual([
      SCHEDULE_IMAGE_ROWS,
      SCHEDULE_IMAGE_ROWS,
      SCHEDULE_IMAGE_ROWS,
      7,
    ]);
    expect(pages.flat()).toEqual(many);
    expect(scheduleImagePages(people)).toEqual([people]);
    expect(scheduleImagePages([])).toEqual([]);
  });
  it("gera somente os dias reais do mês, inclusive fevereiro bissexto", () => {
    expect(scheduleMonthDates("2026-10-01")).toHaveLength(31);
    expect(scheduleMonthDates("2026-04-01").at(-1)).toBe("2026-04-30");
    expect(scheduleMonthDates("2026-02-01").at(-1)).toBe("2026-02-28");
    expect(scheduleMonthDates("2028-02-01").at(-1)).toBe("2028-02-29");
  });

  it("preserva pessoas em comum ao trocar a escala sem carregar nomes ausentes", () => {
    expect(reconcileScheduleSelection(["Bruno", "Carla", "Daniel"], people)).toEqual([
      "Bruno",
      "Carla",
    ]);
    expect(reconcileScheduleSelection(["Daniel"], people)).toEqual(["Ana"]);
    expect(reconcileScheduleSelection(["Ana"], [])).toEqual([]);
  });

  it("contabiliza apenas os selecionados e não trata licença ou célula vazia como trabalho", () => {
    const selected = people.filter((person) => person.name !== "Carla");
    expect(scheduleDayTotals(selected, ["2026-10-01", "2026-10-02", "2026-10-03"])).toEqual([
      { date: "2026-10-01", work: 1, off: 0 },
      { date: "2026-10-02", work: 1, off: 1 },
      { date: "2026-10-03", work: 0, off: 0 },
    ]);
    expect(scheduleDayTotals(people, ["2026-10-02"])[0]?.off).toBe(2);
  });

  it("abrevia os códigos conhecidos e preserva horários e códigos personalizados", () => {
    expect(["T. 1", "T. 2", "Folga", "FÉRIAS", "LCC.", ""].map(compactScheduleCode)).toEqual([
      "T1",
      "T2",
      "F",
      "Fé",
      "L",
      "—",
    ]);
    expect(compactScheduleCode("08:00–17:00")).toBe("08:00–17:00");
    expect(compactScheduleCode("PLANTÃO")).toBe("PLANTÃO");
    expect(compactScheduleCode("Fé")).toBe("Fé");
    expect(compactScheduleCode("L")).toBe("L");
  });
});
