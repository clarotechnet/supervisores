import { describe, it, expect } from "vitest";
import { learnFixedRest, learnMissingCoverage } from "../src/lib/schedule-history-memory";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";
import { generateSchedulePreview } from "../src/lib/schedule-generator";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import type { SchedulePerson, ScheduleUpload } from "../src/lib/types";
const rule = getScheduleGenerationRule("natal", "adesao-servico")!;
const day = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
function person(i = 0, fixed = 3, month = "2027-01"): SchedulePerson {
  return {
    name: "PRIVATE TECHNICIAN " + i,
    login: "SECRET LOGIN " + i,
    jobTitle: "Técnico",
    assignments: Object.fromEntries(
      scheduleMonthDates(month).map((d) => [
        d,
        day(d) === 0 || day(d) === fixed ? "Folga" : "M. 1",
      ]),
    ),
  };
}
function source(
  city = "natal",
  sector = "adesao-servico",
  month = "2027-01",
  count = 20,
): ScheduleUpload {
  return {
    id: "official-source",
    city,
    sector,
    schedule_month: month + "-01",
    source_file: "Google Sheets",
    source_sheet: "ABA OFICIAL",
    employee_count: count,
    entry_count: count * 31,
    imported_by: null,
    imported_at: "",
    updated_at: "2027-01-31T15:00:00Z",
    payload: {
      dates: scheduleMonthDates(month),
      codes: ["M. 1", "Folga"],
      people: Array.from({ length: count }, (_, i) => person(i, 3, month)),
    },
  };
}
describe("memória de folga fixa em semana normal", () => {
  it("uma semana limpa basta mesmo com AT/férias/faltas no resto do mês", () => {
    const p = person();
    for (const d of Object.keys(p.assignments)) p.assignments[d] = "AT";
    for (const d of scheduleMonthDates("2027-01").filter(
      (d) => d >= "2027-01-10" && d <= "2027-01-16",
    ))
      p.assignments[d] = day(d) === 0 || day(d) === 3 ? "Folga" : "M. 1";
    p.assignments["2027-01-22"] = "FALTA";
    p.assignments["2027-01-27"] = "Férias";
    const previous = structuredClone(p),
      e = learnFixedRest(p, "2027-01", rule);
    expect(e).toMatchObject({
      day: 3,
      method: "normal-week",
      week: [
        "2027-01-10",
        "2027-01-11",
        "2027-01-12",
        "2027-01-13",
        "2027-01-14",
        "2027-01-15",
        "2027-01-16",
      ],
    });
    expect(p).toEqual(previous);
  });
  it("não confunde BH, compensação ou plantão de domingo com a folga fixa", () => {
    const p = person();
    for (const d of Object.keys(p.assignments)) p.assignments[d] = "Férias";
    for (const d of scheduleMonthDates("2027-01").filter(
      (d) => d >= "2027-01-03" && d <= "2027-01-09",
    ))
      p.assignments[d] = day(d) === 0 || day(d) === 2 ? "Folga" : "M. 1";
    for (const d of scheduleMonthDates("2027-01").filter(
      (d) => d >= "2027-01-17" && d <= "2027-01-23",
    ))
      p.assignments[d] = day(d) === 0 ? "M. 1" : [1, 4].includes(day(d)) ? "Folga" : "M. 1";
    expect(learnFixedRest(p, "2027-01", rule).day).toBe(2);
    p.assignments["2027-01-05"] = "BH";
    expect(learnFixedRest(p, "2027-01", rule).day).toBeNull();
  });
  it("considera a semana normal mais recente quando a gestão mudou o dia no mês", () => {
    const p = person();
    for (const d of scheduleMonthDates("2027-01").filter(
      (d) => d >= "2027-01-24" && d <= "2027-01-30",
    ))
      p.assignments[d] = [0, 5].includes(day(d)) ? "Folga" : "M. 1";
    expect(learnFixedRest(p, "2027-01", rule)).toMatchObject({
      day: 5,
      week: expect.arrayContaining(["2027-01-29"]),
    });
  });
  it("descarta semana com feriado local e preserva uma semana normal anterior", () => {
    const p = person();
    p.assignments["2027-01-27"] = "M. 1";
    p.assignments["2027-01-28"] = "Folga";
    expect(learnFixedRest(p, "2027-01", { ...rule, additionalHolidays: ["01-25"] }).day).toBe(3);
  });
  it("não identifica folga fixa somente por uma falta ou por mês inteiro afastado", () => {
    const p = person();
    for (const d of Object.keys(p.assignments)) p.assignments[d] = "AT";
    expect(learnFixedRest(p, "2027-01", rule)).toMatchObject({ day: null, method: "unknown" });
    p.assignments["2027-01-27"] = "FALTA";
    expect(learnFixedRest(p, "2027-01", rule).day).toBeNull();
  });
});
describe("geração a partir da escala sincronizada", () => {
  it("mantém todas as folgas de quarta mesmo divergindo da meta percentual e conserva impedimentos explícitos", () => {
    const s = source(),
      original = structuredClone(s);
    const preview = generateSchedulePreview(s, "2027-02", {
      previousRule: { excludedFromDuty: [s.payload.people[0]!.name] },
    });
    expect(preview.fixedRestPolicy).toBe("preserve-history");
    expect(preview.fixedRestEvidence?.every((e) => e.day === 3)).toBe(true);
    for (const p of preview.payload.people)
      for (const d of preview.payload.dates.filter((d) => day(d) === 3))
        expect(p.assignments[d]).toBe("Folga");
    expect(preview.blockingIssues.filter((x) => x.startsWith("Distribuição"))).toEqual([]);
    expect(preview.warnings.some((x) => x.startsWith("Folgas fixas individuais mantidas"))).toBe(
      true,
    );
    expect(preview.eventCoverage.map((e) => [e.planned, e.assigned])).toEqual([
      [3, 3],
      [3, 3],
      [3, 3],
      [10, 10],
    ]);
    for (const e of preview.eventCoverage)
      expect(preview.payload.people[0]!.assignments[e.date]).toBe("Folga");
    expect(s).toEqual(original);
  });
  it("não usa o feriado para trocar a folga fixa de sexta por um plantão", () => {
    const s = source("natal", "adesao-servico", "2026-12", 24);
    s.payload.people = s.payload.people.map((_, i) => person(i, i < 8 ? 5 : 3, "2026-12"));
    const result = generateSchedulePreview(s, "2027-01");
    expect(result.eventCoverage.find((e) => e.date === "2027-01-01")).toEqual({
      date: "2027-01-01",
      planned: 5,
      assigned: 5,
    });
    for (const p of result.payload.people.slice(0, 8))
      expect(p.assignments["2027-01-01"]).toBe("Folga");
    s.payload.people = s.payload.people.map((_, i) => person(i, 5, "2026-12"));
    const insufficient = generateSchedulePreview(s, "2027-01");
    expect(insufficient.payload.people.every((p) => p.assignments["2027-01-01"] === "Folga")).toBe(
      true,
    );
    expect(
      insufficient.blockingIssues.some((issue) => issue.startsWith("2027-01-01: cobertura")),
    ).toBe(true);
  });
  it("a mesma memória vale para Controle, CE e PE, sem usar modelo de dezembro RN", () => {
    for (const [city, sector] of [
      ["natal", "controle-operacional"],
      ["fortaleza", "manutencao"],
      ["recife", "instalacao"],
      ["recife", "desconexao"],
    ]) {
      const s = source(city!, sector!);
      s.payload.people.forEach(
        (p, i) => (p.jobTitle = i < 5 ? "SUPERVISOR COP" : "CONTROLADOR (ADESÃO)"),
      );
      const result = generateSchedulePreview(s, "2027-02");
      expect(result.referenceSeedId).toBeUndefined();
      expect(result.fixedRestEvidence?.every((e) => e.day === 3)).toBe(true);
      for (const p of result.payload.people)
        for (const d of result.payload.dates.filter((d) => day(d) === 3))
          expect(p.assignments[d]).toBe("Folga");
    }
  });
  it("aprende cobertura não cadastrada a partir de dezembro manual da própria cidade", () => {
    const s = source("fortaleza", "instalacao", "2026-12", 20),
      r = getScheduleGenerationRule(s.city, s.sector)!;
    for (const [index, date] of ["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"].entries())
      for (const p of s.payload.people.slice(index * 3, index * 3 + 3))
        p.assignments[date] = "M. 1";
    for (const p of s.payload.people) p.assignments["2026-12-25"] = "Folga";
    for (const p of s.payload.people.slice(12, 17)) p.assignments["2026-12-25"] = "M. 1";
    expect(learnMissingCoverage(s, r).rule).toMatchObject({
      sundayDutyCount: 3,
      holidayDutyCount: 5,
    });
    const result = generateSchedulePreview(s, "2027-01");
    expect(result.rule).toMatchObject({ sundayDutyCount: 3, holidayDutyCount: 5 });
    expect(result.eventCoverage.every((e) => e.planned === (e.date === "2027-01-01" ? 5 : 3))).toBe(
      true,
    );
  });
  it("não inventa quantidade a partir de domingos contraditórios", () => {
    const s = source("fortaleza", "instalacao", "2026-12", 12),
      r = getScheduleGenerationRule(s.city, s.sector)!;
    s.payload.people[0]!.assignments["2026-12-06"] = "M. 1";
    expect(learnMissingCoverage(s, r).rule.sundayDutyCount).toBeNull();
    expect(
      generateSchedulePreview(s, "2027-01").blockingIssues.some((x) =>
        x.includes("não configurada"),
      ),
    ).toBe(true);
  });
  it("leva a cobertura aprendida e aprovada para meses sem feriado na base", () => {
    const s = source("fortaleza", "instalacao", "2027-02", 20);
    const p = generateSchedulePreview(s, "2027-03", {
      previousRule: { sundayDutyCount: 3, holidayDutyCount: 5 },
    });
    expect(p.rule).toMatchObject({ sundayDutyCount: 3, holidayDutyCount: 5 });
    expect(p.eventCoverage.every((e) => e.planned === 3)).toBe(true);
  });
});

function decemberBoundaryPerson(fixed: 5 | 6): SchedulePerson {
  const p: SchedulePerson = {
    name: "BOUNDARY SUPERVISOR " + fixed,
    jobTitle: "SUPERVISOR COP",
    assignments: Object.fromEntries(
      scheduleMonthDates("2026-12").map((d) => [d, day(d) === 0 ? "Folga" : "T. 1"]),
    ),
  };
  Object.assign(p.assignments, {
    "2026-11-29": "Folga",
    "2026-11-30": "T. 1",
    "2026-12-25": "Folga",
    "2027-01-01": "Folga",
    "2027-01-02": fixed === 6 ? "Folga" : "T. 1",
    "2027-01-03": "Folga",
    "2027-01-04": "T. 1",
  });
  p.assignments[fixed === 5 ? "2026-12-04" : "2026-12-05"] = "Folga";
  if (fixed === 5)
    Object.assign(p.assignments, {
      "2026-12-06": "PLANTÃO",
      "2026-12-07": "Folga",
      "2026-12-11": "Folga",
    });
  else p.assignments["2026-12-26"] = "Folga";
  return p;
}
describe("semana normal que começa antes do primeiro dia da competência", () => {
  const control = getScheduleGenerationRule("natal", "controle-operacional")!;
  it.each([5, 6] as const)(
    "identifica a folga de dia %s na semana preenchida de 29/11 a 05/12",
    (fixed) => {
      const p = decemberBoundaryPerson(fixed);
      const before = structuredClone(p);
      expect(learnFixedRest(p, "2026-12", control)).toMatchObject({
        day: fixed,
        method: "normal-week",
        week: [
          "2026-11-29",
          "2026-11-30",
          "2026-12-01",
          "2026-12-02",
          "2026-12-03",
          "2026-12-04",
          "2026-12-05",
        ],
      });
      expect(p).toEqual(before);
    },
  );
  it.each(["2026-11-29", "2026-11-30"])(
    "não inventa a parte anterior da semana quando falta %s",
    (date) => {
      const p = decemberBoundaryPerson(5);
      delete p.assignments[date];
      expect(learnFixedRest(p, "2026-12", control).day).toBeNull();
    },
  );
  it.each(["AT", "Férias", "FALTA", "BH", "Folga compensatória"])(
    "descarta a primeira semana se um dia dela contém %s",
    (code) => {
      const p = decemberBoundaryPerson(5);
      p.assignments["2026-11-30"] = code;
      expect(learnFixedRest(p, "2026-12", control).day).toBeNull();
    },
  );
  it("mantém a preferência por uma semana normal mais recente", () => {
    const p = decemberBoundaryPerson(5);
    p.assignments["2026-12-15"] = "Folga";
    expect(learnFixedRest(p, "2026-12", control)).toMatchObject({
      day: 2,
      week: expect.arrayContaining(["2026-12-15"]),
    });
  });
  it("leva sexta e sábado à prévia de janeiro preservando os dias já marcados e a base", () => {
    const s = source("natal", "controle-operacional", "2026-12", 2);
    s.payload.people = [decemberBoundaryPerson(5), decemberBoundaryPerson(6)];
    const before = structuredClone(s);
    const preview = generateSchedulePreview(s, "2027-01");
    expect(preview.fixedRestEvidence?.map((e) => e.day)).toEqual([5, 6]);
    expect(preview.blockingIssues.some((x) => x.includes("folga fixa não identificada"))).toBe(
      false,
    );
    for (const [i, fixed] of [5, 6].entries()) {
      const p = preview.payload.people[i]!;
      for (const date of preview.payload.dates.filter((d) => day(d) === fixed))
        expect(p.assignments[date]).toBe("Folga");
    }
    // A inferência de folga não autoriza reescrever plantões já definidos na origem.
    expect(preview.eventCoverage.find((e) => e.date === "2027-01-01")?.assigned).toBe(0);
    expect(preview.payload.people.every((p) => p.assignments["2027-01-03"] === "Folga")).toBe(true);
    expect(s).toEqual(before);
  });
});
