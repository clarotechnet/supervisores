import { describe, expect, it } from "vitest";
import type { ScheduleUpload } from "../src/lib/types";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import { generateSchedulePreview, scheduleCalendarWeeks } from "../src/lib/schedule-generator";
import { getScheduleGenerationRule, isExcludedFromDuty } from "../src/lib/schedule-generator-rules";

function source(
  city: string,
  sector: string,
  names: string[],
  baseMonth = "2026-11",
): ScheduleUpload {
  const dates = scheduleMonthDates(baseMonth);
  return {
    id: "source-test",
    city,
    sector,
    schedule_month: baseMonth + "-01",
    source_file: "Teste",
    source_sheet: "NOV 26",
    imported_by: null,
    imported_at: "",
    updated_at: "",
    employee_count: names.length,
    entry_count: names.length * dates.length,
    payload: {
      dates,
      codes: ["M. 1", "Folga"],
      people: names.map((name, i) => ({
        name,
        login: "Z" + (10000 + i),
        jobTitle: "Técnico",
        assignments: Object.fromEntries(
          dates.map((d) => [d, new Date(d + "T12:00:00Z").getUTCDay() === 0 ? "Folga" : "M. 1"]),
        ),
      })),
    },
  };
}
const names = (n: number) => Array.from({ length: n }, (_, i) => "COLABORADOR " + (i + 1));

describe("catálogo de regras de escalas", () => {
  it("respeita Fábio em T. 1 e cobertura 3 na Manutenção CE", () => {
    const rule = getScheduleGenerationRule("fortaleza", "manutencao");
    expect(rule?.sundayDutyCount).toBe(3);
    expect(rule?.holidayDutyCount).toBe(3);
    expect(rule?.personShiftOverrides?.["FABIO DE SOUZA APOLINARIO"]).toBe("T. 1");
  });
  it("exclui os 19 nomes marcados em verde na nova referência de Controle RN", () => {
    const rule = getScheduleGenerationRule("natal", "controle-operacional")!;
    expect(rule.excludedFromDuty).toHaveLength(19);
    expect(isExcludedFromDuty("José Victor", rule)).toBe(true);
    expect(isExcludedFromDuty("Matheus Freitas", rule)).toBe(true);
    expect(rule.sundayDutyCount).toBe(3);
    expect(rule.holidayDutyCount).toBe(3);
    expect(rule.dutyCode).toBe("PLANTÃO");
  });
  it("adota sábado M. 1 em Desconexão CE e PE", () => {
    expect(getScheduleGenerationRule("fortaleza", "desconexao")?.saturdayShift).toBe("M. 1");
    expect(getScheduleGenerationRule("recife", "desconexao")?.saturdayShift).toBe("M. 1");
  });
});

describe("semanas completas nas viradas de mês", () => {
  it("mostra outubro incluindo setembro e dezembro incluindo janeiro", () => {
    expect(scheduleCalendarWeeks("2026-10")[0]).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    const dec = scheduleCalendarWeeks("2026-12");
    expect(dec[0]).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
    expect(dec.at(-1)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
  it("preserva o histórico de novembro e fecha semanas de dezembro 5x2", () => {
    const s = source("recife", "desconexao", names(5));
    s.payload.people[0]!.assignments["2026-11-30"] = "Folga";
    const preview = generateSchedulePreview(s, "2026-12");
    expect(preview.outsideAssignments[0]?.["2026-11-30"]).toBe("Folga");
    expect(s.payload.people[0]!.assignments["2026-11-30"]).toBe("Folga");
    expect(preview.outsideAssignments[0]?.["2027-01-02"]).toBeDefined();
    for (const [index, person] of preview.payload.people.entries()) {
      const weekDays = preview.calendarWeeks.flat();
      for (const week of preview.calendarWeeks) {
        const rests = week.filter(
          (d) => (person.assignments[d] ?? preview.outsideAssignments[index]?.[d]) === "Folga",
        ).length;
        expect(rests).toBeGreaterThanOrEqual(2);
      }
      expect(weekDays[0]).toBe("2026-11-29");
    }
  });
  it("gera outubro com base em setembro, sem modificar setembro", () => {
    const s = source("recife", "desconexao", names(5), "2026-09");
    const preview = generateSchedulePreview(s, "2026-10");
    expect(preview.calendarWeeks[0]?.[0]).toBe("2026-09-27");
    expect(preview.outsideAssignments[0]?.["2026-09-28"]).toBe("M. 1");
    expect(s.payload.people[0]!.assignments["2026-09-28"]).toBe("M. 1");
    expect(preview.payload.dates.every((date) => date.startsWith("2026-10"))).toBe(true);
  });
  it("rejeita usar a própria competência como fonte", () => {
    expect(() =>
      generateSchedulePreview(source("recife", "desconexao", names(3)), "2026-11"),
    ).toThrow("mês anterior");
  });
});

describe("Controle RN: referência de dezembro e plantões semanais", () => {
  it("aloca 3 plantonistas por evento, incluindo supervisor e controlador de Adesão", () => {
    const s = source("natal", "controle-operacional", names(15), "2026-11");
    s.payload.people.forEach((p, i) => {
      p.jobTitle =
        i < 3
          ? "SUPERVISOR COP (ADESÃO)"
          : i < 10
            ? "CONTROLADOR (ADESÃO) - NTL"
            : "CONTROLADOR (DESC NTL)";
      // Base 5x2 com folgas fixas alternadas e pessoal elegível no feriado de sexta.
      const fixed = i % 2 === 0 ? 5 : 3;
      for (const day of s.payload.dates) {
        if (new Date(day + "T12:00:00Z").getUTCDay() === fixed) p.assignments[day] = "Folga";
      }
    });
    const preview = generateSchedulePreview(s, "2026-12");
    expect(preview.eventCoverage.every((day) => day.assigned === 3)).toBe(true);
    for (const event of preview.eventCoverage) {
      const staff = preview.payload.people.filter((p) => p.assignments[event.date] === "PLANTÃO");
      expect(staff).toHaveLength(3);
      expect(staff.some((p) => p.jobTitle.startsWith("SUPERVISOR COP"))).toBe(true);
      expect(staff.some((p) => p.jobTitle.startsWith("CONTROLADOR (ADESÃO)"))).toBe(true);
    }
    expect(preview.payload.people.every((p) => p.assignments["2026-12-05"] !== "M. 1")).toBe(true);
    for (const p of preview.payload.people.filter(
      (p) => p.assignments["2026-12-06"] === "PLANTÃO",
    )) {
      expect(p.assignments["2026-12-07"]).toBe("Folga");
      const index = s.payload.people.findIndex((base) => base.login === p.login);
      expect(p.assignments[index % 2 === 0 ? "2026-12-11" : "2026-12-09"]).toBe("Folga");
      const week = [
        "2026-12-06",
        "2026-12-07",
        "2026-12-08",
        "2026-12-09",
        "2026-12-10",
        "2026-12-11",
        "2026-12-12",
      ];
      expect(week.filter((d) => p.assignments[d] === "Folga")).toHaveLength(2);
    }
  });

  it("reconhece retorno após AT na virada sem espalhar AT por janeiro", () => {
    const s = source("recife", "desconexao", names(4), "2026-12");
    const p = s.payload.people[0]!;
    p.assignments["2026-12-31"] = "AT";
    p.assignments["2027-01-01"] = "AT";
    p.assignments["2027-01-02"] = "AT";
    p.assignments["2027-01-03"] = "M. 1"; // gestão confirmou retorno
    const generated = generateSchedulePreview(s, "2027-01");
    const result = generated.payload.people[0]!;
    expect(result.assignments["2027-01-01"]).toBe("AT");
    expect(result.assignments["2027-01-03"]).toBe("M. 1");
    expect(result.assignments["2027-01-04"]).not.toBe("AT");
    expect(generated.warnings.some((x) => x.includes("retorno/alteração"))).toBe(true);
  });

  it("preserva 01–03/01 já programados no modelo de dezembro", () => {
    const s = source("natal", "controle-operacional", names(12), "2026-12");
    s.payload.people.forEach((p, i) => {
      p.jobTitle =
        i < 2
          ? "SUPERVISOR COP (ADESÃO)"
          : i < 7
            ? "CONTROLADOR (ADESÃO) - NTL"
            : "CONTROLADOR (DESC NTL)";
      for (const d of ["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25"]) {
        p.assignments[d] = "Folga";
      }
      p.assignments["2027-01-01"] = i < 3 ? "PLANTÃO" : "Folga";
      p.assignments["2027-01-02"] = "Folga";
      p.assignments["2027-01-03"] = i < 3 ? "PLANTÃO" : "Folga";
    });
    const preview = generateSchedulePreview(s, "2027-01");
    for (let i = 0; i < s.payload.people.length; i++) {
      const p = preview.payload.people[i]!;
      expect(p.assignments["2027-01-01"]).toBe(s.payload.people[i]?.assignments["2027-01-01"]);
      expect(p.assignments["2027-01-02"]).toBe("Folga");
      expect(p.assignments["2027-01-03"]).toBe(s.payload.people[i]?.assignments["2027-01-03"]);
    }
    expect(preview.eventCoverage.find((d) => d.date === "2027-01-03")?.assigned).toBe(3);
  });
});

describe("geração prévia sem usar IA para decidir restrições", () => {
  it("aloca exatamente 1 por plantão em Recife Instalação e preserva duas folgas", () => {
    const base = source("recife", "instalacao", names(12));
    // Uma semana 5x2 normal foi marcada na escala anterior.
    for (const p of base.payload.people) p.assignments["2026-11-11"] = "Folga";
    const preview = generateSchedulePreview(base, "2026-12");
    const events = preview.eventCoverage.filter((x) => x.planned === 1);
    expect(events.map((x) => x.date)).toEqual([
      "2026-12-06",
      "2026-12-13",
      "2026-12-20",
      "2026-12-25",
      "2026-12-27",
    ]);
    expect(events.every((x) => x.assigned === 1)).toBe(true);
    expect(preview.blockingIssues).toEqual([]);
    const onHoliday = preview.payload.people.find((p) => p.assignments["2026-12-25"] === "M. 1");
    expect(onHoliday).toBeDefined();
    // O feriado não obriga uma folga no sábado de outra semana.
    // A jornada deve ser validada por semana domingo–sábado.
    for (const person of preview.payload.people) {
      for (const first of ["2026-12-06", "2026-12-13", "2026-12-20"]) {
        const dates = scheduleMonthDates("2026-12");
        const start = dates.indexOf(first);
        const rest = dates
          .slice(start, start + 7)
          .filter((day) => person.assignments[day] === "Folga").length;
        expect(rest).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it("bloqueia geração de plantões sem quota de Fortaleza Instalação", () => {
    const preview = generateSchedulePreview(
      source("fortaleza", "instalacao", names(12)),
      "2026-12",
    );
    expect(preview.blockingIssues.some((x) => x.includes("não configurada"))).toBe(true);
    expect(preview.eventCoverage.every((x) => x.assigned === 0)).toBe(true);
  });
  it("não cria plantão em Desconexão CE e transforma sábado M. 2 em M. 1", () => {
    const preview = generateSchedulePreview(source("fortaleza", "desconexao", names(8)), "2026-12");
    expect(preview.eventCoverage.every((x) => x.assigned === 0)).toBe(true);
    expect(preview.payload.people.every((p) => p.assignments["2026-12-05"] !== "M. 2")).toBe(true);
  });
  it("preserva T. 1 de Fábio e garante dois descansos na semana do plantão", () => {
    const preview = generateSchedulePreview(
      source("fortaleza", "manutencao", ["FABIO DE SOUZA APOLINARIO", ...names(12)]),
      "2026-12",
    );
    const fabio = preview.payload.people.find((p) => p.name === "FABIO DE SOUZA APOLINARIO");
    expect(fabio?.assignments["2026-12-04"]).toBe("T. 1");
    for (const week of preview.calendarWeeks.filter(
      (w) => w[0]! >= "2026-12-01" && w[6]! <= "2026-12-31",
    )) {
      const full = week.map((d) => fabio?.assignments[d] || "");
      expect(full.filter((x) => x === "Folga").length).toBeGreaterThanOrEqual(2);
    }
    expect(preview.eventCoverage.every((e) => e.assigned === 3)).toBe(true);
  });
  it.each(["Férias", "FÉRIAS", "Ferias", "Fé"])(
    "não prolonga %s do mês anterior para os dias não marcados no novo mês",
    (code) => {
      const s = source("recife", "instalacao", names(8));
      s.payload.people[0]!.assignments["2026-11-30"] = code;
      const original = structuredClone(s);
      const preview = generateSchedulePreview(s, "2026-12");
      expect(Object.values(preview.payload.people[0]!.assignments)).not.toContain(code);
      expect(preview.payload.people[0]!.assignments["2026-12-02"]).toBe("M. 1");
      expect(preview.outsideAssignments[0]?.["2027-01-02"]).not.toBe(code);
      expect(preview.warnings).toContainEqual(
        expect.stringContaining("férias anteriores não prorrogadas"),
      );
      expect(preview.blockingIssues.some((x) => x.includes("confirmar datas de"))).toBe(false);
      expect(preview.eventCoverage.every((e) => e.assigned === 1)).toBe(true);
      expect(s).toEqual(original);
    },
  );

  it("preserva férias explícitas e um retorno já registrado na origem", () => {
    const s = source("recife", "instalacao", names(8));
    const person = s.payload.people[0]!;
    person.assignments["2026-11-30"] = "Férias";
    person.assignments["2026-12-01"] = "Férias";
    person.assignments["2026-12-02"] = "M. 1";
    const preview = generateSchedulePreview(s, "2026-12");
    expect(preview.payload.people[0]!.assignments["2026-12-01"]).toBe("Férias");
    expect(preview.payload.people[0]!.assignments["2026-12-02"]).toBe("M. 1");
    expect(
      Object.entries(preview.payload.people[0]!.assignments)
        .filter(([day]) => day > "2026-12-02")
        .map(([, code]) => code),
    ).not.toContain("Férias");
    expect(preview.blockingIssues.some((x) => x.includes("confirmar datas de Férias"))).toBe(false);
  });

  it("mantém AT de origem como bloqueio a confirmar, sem inventar retorno", () => {
    const s = source("recife", "instalacao", names(8));
    s.payload.people[0]!.assignments["2026-11-30"] = "AT";
    const preview = generateSchedulePreview(s, "2026-12");
    expect(preview.payload.people[0]!.assignments["2026-12-25"]).toBe("AT");
    expect(preview.warnings.some((x) => x.includes("confirmar continuidade"))).toBe(true);
    expect(preview.blockingIssues.some((x) => x.includes("confirmar datas de AT"))).toBe(true);
  });
});

it("uma semana com folga marcada basta para seguir o padrão após férias", () => {
  const s = source("natal", "controle-operacional", names(12), "2027-01");
  s.payload.people.forEach((person, index) => {
    person.jobTitle = index < 3 ? "SUPERVISOR COP" : "CONTROLADOR (ADESÃO)";
    for (const day of s.payload.dates) person.assignments[day] = "Férias";
    for (const day of scheduleMonthDates("2027-01").filter(
      (d) => d >= "2027-01-03" && d <= "2027-01-09",
    ))
      person.assignments[day] = ["2027-01-03", "2027-01-05"].includes(day) ? "Folga" : "T. 1";
  });
  const original = structuredClone(s);
  const generated = generateSchedulePreview(s, "2027-02");
  const person = generated.payload.people[0]!;
  for (const day of ["2027-02-02", "2027-02-09", "2027-02-16", "2027-02-23"])
    expect(person.assignments[day]).toBe("Folga");
  expect(Object.values(person.assignments)).not.toContain("Férias");
  expect(
    generated.blockingIssues.some((line) => line.includes("folga fixa não identificada")),
  ).toBe(false);
  expect(generated.eventCoverage.every((event) => event.assigned === 3)).toBe(true);
  expect(s).toEqual(original);
});

it("usa a folga já marcada na primeira semana do mês novo quando a origem inteira é férias", () => {
  const s = source("natal", "controle-operacional", names(12), "2027-01");
  s.payload.people.forEach((person, index) => {
    person.jobTitle = index < 3 ? "SUPERVISOR COP" : "CONTROLADOR (ADESÃO)";
    for (const day of s.payload.dates) person.assignments[day] = "Férias";
    person.assignments["2027-02-02"] = "Folga";
    person.assignments["2027-02-03"] = "T. 1";
  });
  const generated = generateSchedulePreview(s, "2027-02");
  expect(
    generated.blockingIssues.some((line) => line.includes("folga fixa não identificada")),
  ).toBe(false);
  for (const p of generated.payload.people) {
    expect(p.assignments["2027-02-02"]).toBe("Folga");
    expect(p.assignments["2027-02-09"]).toBe("Folga");
    expect(p.assignments["2027-02-03"]).toBe("T. 1");
    expect(Object.values(p.assignments)).not.toContain("Férias");
  }
});
