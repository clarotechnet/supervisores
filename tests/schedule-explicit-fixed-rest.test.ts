import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  fixedRestColumn,
  fixedRestDeclaration,
  readFixedRest,
} from "../supabase/functions/_shared/schedule-fixed-rest-value";
import {
  parseSheet,
  mergeSheets,
  officialMonthValues,
  parseOfficialMonthTab,
  findScheduleCell,
} from "../supabase/functions/_shared/schedule-google-source";
import {
  controlMonthValues,
  readControlMonthSource,
} from "../supabase/functions/_shared/schedule-operational-master";
import { validatePreviewAnalysisInput } from "../supabase/functions/_shared/schedule-ai-preview";
import { analyzeSchedule } from "../supabase/functions/_shared/schedule-ai-analysis";
import { learnFixedRest } from "../src/lib/schedule-history-memory";
import { balanceFixedRests } from "../src/lib/schedule-fixed-rest";
import { getScheduleGenerationRule } from "../src/lib/schedule-generator-rules";
import { generateSchedulePreview } from "../src/lib/schedule-generator";
import { parseScheduleWorkbook } from "../src/lib/schedule-import";
import type { SchedulePerson, ScheduleUpload } from "../src/lib/types";
import { scheduleCoveragePolicy } from "../supabase/functions/_shared/schedule-coverage-policy";

const rule = getScheduleGenerationRule("natal", "adesao-servico")!;
const dates = Array.from({ length: 31 }, (_, i) => "2026-12-" + String(i + 1).padStart(2, "0"));
function person(name = "Fixture", fixedRest = "Quinta"): SchedulePerson {
  return {
    name,
    login: name,
    jobTitle: "TECNICO",
    fixedRest,
    assignments: Object.fromEntries(
      dates.map((d) => [
        d,
        [0, 1].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "Folga" : "M. 1",
      ]),
    ),
  };
}
const payload = () => ({ dates, people: [person()], codes: ["M. 1", "Folga"] });
describe("coluna explícita Folga fixa", () => {
  it("isola os quantitativos por cidade e frente e atualiza o último domingo a cada mês", () => {
    const old = { sundayDutyCount: 3, holidayDutyCount: 5 };
    const december = scheduleCoveragePolicy(old, "natal", "adesao-servico", "2026-12");
    expect(december).toMatchObject({
      sundayDutyCount: 3,
      holidayDutyCount: 3,
      dateDutyOverrides: { "2026-12-27": 10 },
    });
    expect(scheduleCoveragePolicy(old, "natal", "adesao-servico", "2027-01")).toMatchObject({
      dateDutyOverrides: { "2027-01-31": 10 },
    });
    for (const [city, front] of [
      ["natal", "vt"],
      ["mossoro", "mossoro"],
      ["recife", "instalacao"],
      ["natal", "controle-operacional"],
    ])
      expect(scheduleCoveragePolicy(old, city!, front!, "2026-12")).toBe(old);
    expect(getScheduleGenerationRule("natal", "vt")?.holidayDutyCount).toBe(5);
    expect(getScheduleGenerationRule("mossoro", "mossoro")?.holidayDutyCount).toBe(1);
    expect(getScheduleGenerationRule("recife", "instalacao")?.holidayDutyCount).toBe(1);
    expect(old.holidayDutyCount).toBe(5);
  });
  it("a conferência usa a quota explícita atual, inclusive diante de um snapshot antigo maior", () => {
    const p = payload();
    const people = Array.from({ length: 5 }, (_, i) => ({
      ...person(String(i)),
      assignments: Object.fromEntries(dates.map((d) => [d, "M. 1"])),
    }));
    const planned = { ...p, people };
    const current = {
      ...p,
      people: people.map((person, i) => ({
        ...person,
        assignments: { ...person.assignments, "2026-12-25": i < 3 ? "M. 1" : "Folga" },
      })),
    };
    const coverage = scheduleCoveragePolicy(
      { holidayDutyCount: 5, analysisMonth: "2026-12" },
      "natal",
      "adesao-servico",
      "2026-12",
    );
    const analysis = analyzeSchedule(planned, current, coverage);
    expect(analysis.issues.filter((i) => i.date === "2026-12-25" && i.kind === "coverage")).toEqual(
      [],
    );
    current.people[3]!.assignments["2026-12-25"] = "M. 1";
    expect(
      analyzeSchedule(planned, current, coverage).issues.find((i) => i.date === "2026-12-25")
        ?.title,
    ).toContain("acima");
  });
  it("interpreta a semana de PE desde novembro e preserva 01/01 e 02/01 sem duplicar dezembro", () => {
    const weekly = Array.from({ length: 35 }, (_, i) =>
      new Date(Date.UTC(2026, 10, 29 + i, 12)).toISOString().slice(0, 10),
    );
    const rows: unknown[][] = [
      ["Mês-ano:", "dezembro-26", "", ...weekly.map(() => "dia")],
      ["Login", "Nome", "Função", ...weekly.map((d) => String(Number(d.slice(-2)))), "Folga fixa"],
      [
        "Z1",
        "Weekly",
        "TECNICO",
        ...weekly.map((d) =>
          d === "2026-11-29"
            ? "Folga"
            : d === "2026-12-29"
              ? "AT"
              : d === "2027-01-01"
                ? "Folga"
                : "M. 1",
        ),
        "Sabado",
      ],
    ];
    const parsed = parseSheet(rows, "Recife - Instalação DEZ 26", "2026-12")!;
    expect(parsed.dates).toEqual(weekly);
    expect(parsed.people[0]!.assignments["2026-11-29"]).toBe("Folga");
    expect(parsed.people[0]!.assignments["2026-12-29"]).toBe("AT");
    expect(parsed.people[0]!.assignments["2027-01-01"]).toBe("Folga");
    expect(parsed.people[0]!.fixedRest).toBe("Sabado");
    for (const date of ["2026-12-01", "2026-12-29", "2027-01-01", "2027-01-02"])
      expect(findScheduleCell(rows, "2026-12", "Weekly", "Z1", date).column).toBe(
        weekly.indexOf(date) + 3,
      );
  });
  it.each([
    ["Segunda", 1],
    ["terça-feira", 2],
    ["QUARTA", 3],
    ["qui.", 4],
    ["Sexta feira", 5],
    ["Sabado", 6],
    ["Sábado", 6],
  ])("normaliza %s sem depender de acento ou abreviação", (fixedRest, day) => {
    expect(fixedRestDeclaration({ fixedRest: String(fixedRest) }).day).toBe(day);
  });
  it("distingue coluna ausente, vazia, inválida e atestado", () => {
    expect(fixedRestDeclaration({}).declared).toBe(false);
    for (const value of ["", "AT", "Férias", "amanhã"])
      expect(fixedRestDeclaration({ fixedRest: value })).toMatchObject({
        declared: true,
        day: null,
      });
    expect(readFixedRest(["Sábado"], 0)).toEqual({ fixedRest: "Sábado" });
    expect(() => fixedRestColumn(["Folga fixa", "FOLGA FIXA"])).toThrow("duplicado");
  });
  it("prefere a referência explícita ao padrão das folgas compensatórias", () => {
    expect(learnFixedRest(person(), "2026-12", rule)).toMatchObject({
      day: 4,
      method: "sheet-column",
    });
    expect(learnFixedRest(person("Fixture", ""), "2026-12", rule)).toMatchObject({
      day: null,
      method: "sheet-column",
    });
    const legacy = person();
    delete legacy.fixedRest;
    expect(learnFixedRest(legacy, "2026-12", rule).method).not.toBe("sheet-column");
  });
  it("lê o cabeçalho em posições diferentes e preserva os códigos originais", () => {
    const p = payload();
    const rows = officialMonthValues(p, "2026-12");
    rows[1]!.splice(34, 0, "Folgas", "Férias");
    rows[2]!.splice(34, 0, "9", "0");
    const parsed = parseSheet(rows, "Recife - Instalação DEZ 26", "2026-12")!;
    expect(parsed.people[0]).toMatchObject({
      fixedRest: "Quinta",
      assignments: p.people[0]!.assignments,
    });
    expect(parsed.dates).toEqual(dates);
    rows[2]!.push("extra");
    expect(mergeSheets([parsed]).people[0]!.fixedRest).toBe("Quinta");
  });
  it("sincroniza mudanças somente na referência mesmo sem mudanças nos dias", () => {
    const p = payload();
    const rows = officialMonthValues(p, "2026-12");
    rows[2]![34] = "Sábado";
    const result = parseOfficialMonthTab(rows, p, p, "2026-12");
    expect(result.changes).toEqual([]);
    expect(result.payload.people[0]!.fixedRest).toBe("Sábado");
    expect(result.payload.people[0]!.assignments).toEqual(p.people[0]!.assignments);
  });
  it("lê a coluna de Controle sem tratá-la como data da extensão", () => {
    const p = payload();
    const rows = controlMonthValues(p, "2026-12");
    rows[2]![33] = "Terça";
    const result = readControlMonthSource(rows, p, p, "2026-12");
    expect(result.payload.dates).toEqual(dates);
    expect(result.payload.people[0]!.fixedRest).toBe("Terça");
  });
  it("mantém o dia individual mesmo quando a meta de distribuição pede outro", () => {
    const p = person();
    const result = balanceFixedRests([p], "2026-12", {
      ...rule,
      fixedOffDistribution: { 1: 1 },
      fixedOffStrategy: undefined,
    });
    expect(result.people[0]!.fixedRest).toBe("Quinta");
    expect(result.people[0]!.assignments).toEqual(p.assignments);
  });
  it("preserva a referência no contrato de análise da prévia", () => {
    const p = payload();
    const result = validatePreviewAnalysisInput({
      city: "natal",
      sector: "adesao-servico",
      month: "2026-12",
      planned: p,
      current: p,
      rule: {},
    });
    expect(result.current.people[0]!.fixedRest).toBe("Quinta");
    expect(() =>
      validatePreviewAnalysisInput({
        city: "natal",
        sector: "adesao-servico",
        month: "2026-12",
        planned: p,
        current: { ...p, people: [{ ...p.people[0], fixedRest: 4 }] },
        rule: {},
      }),
    ).toThrow();
  });
  it("IA recusa plantão no dia fixo e não confunde uma folga compensatória com ele", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2026, 11, 27 + i)).toISOString().slice(0, 10),
    );
    const people = [
      person("Fixed", "Sexta"),
      person("Compensation", "Quinta"),
      person("Working", "Sábado"),
    ].map((p) => ({
      ...p,
      assignments: Object.fromEntries(
        days.map((d) => [d, ["2026-12-27", "2027-01-01"].includes(d) ? "Folga" : "M. 1"]),
      ),
    }));
    people[2]!.assignments["2027-01-01"] = "AT";
    const current = { dates: days, people, codes: ["M. 1", "Folga", "AT"] };
    const result = analyzeSchedule(current, current, {
      analysisMonth: "2027-01",
      holidayDutyCount: 1,
      sundayDutyCount: 0,
      allowRestCompensation: true,
      fixedOffByName: { FIXED: 2, COMPENSATION: 5 },
    });
    const issue = result.issues.find((i) => i.date === "2027-01-01" && i.kind === "coverage")!;
    expect(issue.candidates.some((c) => c.name === "Fixed")).toBe(false);
    expect(issue.candidates.some((c) => c.name === "Compensation")).toBe(true);
  });
  it("gera janeiro com o dia do Sheets e fecha até 06/02", () => {
    const p = payload();
    const source: ScheduleUpload = {
      id: "fixture",
      city: "natal",
      sector: "adesao-servico",
      schedule_month: "2026-12-01",
      source_file: "Sheets",
      source_sheet: "Fixture",
      employee_count: 1,
      entry_count: 31,
      payload: p,
      imported_by: null,
      imported_at: "",
      updated_at: "",
    };
    const preview = generateSchedulePreview(source, "2027-01");
    expect(preview.fixedRestEvidence?.[0]).toMatchObject({ day: 4, method: "sheet-column" });
    expect(preview.payload.people[0]!.fixedRest).toBe("Quinta");
    expect(preview.payload.people[0]!.assignments["2027-01-07"]).toBe("Folga");
    expect(preview.calendarWeeks.at(-1)?.at(-1)).toBe("2027-02-06");
    expect(source.payload).toEqual(p);
  });
  it("importa a coluna de um Excel sem transformá-la em data ou código de escala", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DEZEMBRO 2026");
    sheet.addRow(["", "", ...[1, 2, 3, 4].map((d) => new Date(2026, 11, d)), ""]);
    sheet.addRow(["Nome", "Função", "01", "02", "03", "04", "Folga fixa"]);
    sheet.addRow(["Fixture", "TECNICO", "M. 1", "M. 1", "Folga", "M. 1", "Sabado"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseScheduleWorkbook(new File([buffer as BlobPart], "fixture.xlsx"));
    expect(parsed[0]!.payload.people[0]!.fixedRest).toBe("Sabado");
    expect(parsed[0]!.payload.codes).not.toContain("Sabado");
    expect(parsed[0]!.payload.dates).toHaveLength(4);
  });
});
