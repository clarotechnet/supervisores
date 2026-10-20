import { describe, expect, it } from "vitest";
import type { SchedulePerson } from "../src/lib/types";
import { scheduleImagePages, SCHEDULE_IMAGE_ROWS } from "../src/lib/schedule-image";
import {
  compactScheduleCode,
  reconcileScheduleSelection,
  scheduleDayTotals,
  scheduleMonthDates,
  scheduleDutyDate,
  schedulePeopleOnDuty,
  schedulePeopleOnDutyInMonth,
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
  it("mostra quem tem ao menos um plantão em qualquer dia do mês, sem contar outros meses", () => {
    const rows: SchedulePerson[] = [
      ...people,
      { name: "Último dia", jobTitle: "", assignments: { "2026-10-31": "T. 1" } },
      {
        name: "Outro mês",
        jobTitle: "",
        assignments: { "2026-09-30": "T. 1", "2026-11-01": "T. 2", "2026-10-01": "Folga" },
      },
      { name: "Férias", jobTitle: "", assignments: { "2026-10-01": "Férias" } },
      { name: "Licença", jobTitle: "", assignments: { "2026-10-01": "LCC." } },
      { name: "Falta", jobTitle: "", assignments: { "2026-10-01": "FALTA" } },
      { name: "Atestado", jobTitle: "", assignments: { "2026-10-01": "AT" } },
      { name: "Vazio", jobTitle: "", assignments: { "2026-10-01": "  " } },
    ];
    const before = structuredClone(rows);
    expect(schedulePeopleOnDutyInMonth(rows, "2026-10-01").map((row) => row.name)).toEqual([
      "Ana",
      "Bruno",
      "Carla",
      "Último dia",
    ]);
    expect(schedulePeopleOnDutyInMonth(rows, "2026-11-01").map((row) => row.name)).toEqual([
      "Outro mês",
    ]);
    expect(schedulePeopleOnDutyInMonth(rows, "2026-12-01")).toEqual([]);
    expect(schedulePeopleOnDutyInMonth(rows, "")).toEqual([]);
    expect(rows).toEqual(before);
  });
  it("usa somente datas reais do mês na busca mensal de plantões", () => {
    const rows: SchedulePerson[] = [
      {
        name: "Data inválida",
        jobTitle: "",
        assignments: { "2026-11-31": "T1", "2026-02-29": "T2" },
      },
      { name: "Bissexto", jobTitle: "", assignments: { "2028-02-29": "T2" } },
    ];
    expect(schedulePeopleOnDutyInMonth(rows, "2026-11-01")).toEqual([]);
    expect(schedulePeopleOnDutyInMonth(rows, "2026-02-01")).toEqual([]);
    expect(schedulePeopleOnDutyInMonth(rows, "2028-02-01").map((row) => row.name)).toEqual([
      "Bissexto",
    ]);
  });
  it("filtra plantonistas pela data sem alterar os registros ou a ordem da escala", () => {
    const before = structuredClone(people);
    expect(schedulePeopleOnDuty(people, "2026-10-01").map((person) => person.name)).toEqual([
      "Ana",
      "Carla",
    ]);
    expect(schedulePeopleOnDuty(people, "2026-10-02").map((person) => person.name)).toEqual([
      "Bruno",
    ]);
    expect(schedulePeopleOnDuty(people, "2026-10-03")).toEqual([]);
    expect(schedulePeopleOnDuty(people, "2026-11-01")).toEqual([]);
    expect(schedulePeopleOnDuty(people, "")).toEqual([]);
    expect(people).toEqual(before);
  });
  it("inclui turnos e horários e exclui folgas, ausências e células vazias", () => {
    const codes = [
      "T. 1",
      "T2",
      "08:00–17:00",
      "PLANTÃO",
      "M.2",
      "F",
      "Folga",
      "BH",
      "Férias",
      "Fé",
      "LCC.",
      "L",
      "FALTA",
      "AT",
      "Atestado",
      "",
      "  ",
    ];
    const rows = codes.map((code) => ({
      name: code,
      jobTitle: "",
      assignments: { "2026-10-01": code },
    }));
    expect(schedulePeopleOnDuty(rows, "2026-10-01").map((person) => person.name)).toEqual(
      codes.slice(0, 5),
    );
  });
  it("mantém a data do plantão dentro do mês selecionado, inclusive em mudanças de mês", () => {
    expect(scheduleDutyDate("2026-10-01", "", "2026-10-20")).toBe("2026-10-20");
    expect(scheduleDutyDate("2026-10-01", "2026-10-05", "2026-10-20")).toBe("2026-10-05");
    expect(scheduleDutyDate("2026-11-01", "2026-10-31", "2026-10-20")).toBe("2026-11-01");
    expect(scheduleDutyDate("2026-02-01", "2026-02-29", "2026-10-20")).toBe("2026-02-01");
    expect(scheduleDutyDate("2028-02-01", "2028-02-29", "2026-10-20")).toBe("2028-02-29");
    expect(scheduleDutyDate("2026-10", "", "2026-10-20")).toBe("2026-10-20");
    expect(scheduleDutyDate("", "2026-10-20", "2026-10-20")).toBe("");
  });
  it("pagina a exportação sem perder ou duplicar colaboradores", () => {
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

  it("contabiliza apenas os selecionados e não trata licença, falta, atestado ou célula vazia como trabalho", () => {
    const selected = people.filter((person) => person.name !== "Carla");
    expect(scheduleDayTotals(selected, ["2026-10-01", "2026-10-02", "2026-10-03"])).toEqual([
      { date: "2026-10-01", work: 1, off: 0 },
      { date: "2026-10-02", work: 1, off: 1 },
      { date: "2026-10-03", work: 0, off: 0 },
    ]);
    expect(scheduleDayTotals(people, ["2026-10-02"])[0]?.off).toBe(2);
    const withAbsences: SchedulePerson[] = [
      { name: "Falta", jobTitle: "", assignments: { "2026-10-01": "FALTA" } },
      { name: "Atestado", jobTitle: "", assignments: { "2026-10-01": "AT" } },
    ];
    expect(scheduleDayTotals(withAbsences, ["2026-10-01"])).toEqual([
      { date: "2026-10-01", work: 0, off: 0 },
    ]);
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
    expect(compactScheduleCode("FALTA")).toBe("FALTA");
    expect(compactScheduleCode("AT")).toBe("AT");
  });
});
