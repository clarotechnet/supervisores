import { describe, expect, it } from "vitest";
import type { ScheduleUpload } from "../src/lib/types";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import {
  generateSchedulePreview,
} from "../src/lib/schedule-generator";
import {
  getScheduleGenerationRule,
  isExcludedFromDuty,
} from "../src/lib/schedule-generator-rules";

function source(city: string, sector: string, names: string[]): ScheduleUpload {
  const dates = scheduleMonthDates("2026-11");
  return {
    id: "source-test",
    city, sector, schedule_month: "2026-11-01",
    source_file: "Teste", source_sheet: "NOV 26",
    imported_by: null, imported_at: "", updated_at: "",
    employee_count: names.length, entry_count: names.length * dates.length,
    payload: {
      dates,
      codes: ["M. 1", "Folga"],
      people: names.map((name, i) => ({
        name, login: "Z" + (10000 + i), jobTitle: "Técnico",
        assignments: Object.fromEntries(dates.map((d) => [
          d, new Date(d + "T12:00:00Z").getUTCDay() === 0 ? "Folga" : "M. 1",
        ])),
      })),
    },
  };
}
const names = (n: number) => Array.from(
  { length: n }, (_, i) => "COLABORADOR " + (i + 1),
);

describe("catálogo de regras de escalas", () => {
  it("respeita Fábio em T. 1 e cobertura 3 na Manutenção CE", () => {
    const rule = getScheduleGenerationRule("fortaleza", "manutencao");
    expect(rule?.sundayDutyCount).toBe(3);
    expect(rule?.holidayDutyCount).toBe(3);
    expect(rule?.personShiftOverrides?.["FABIO DE SOUZA APOLINARIO"]).toBe("T. 1");
  });
  it("exclui todos os 11 colaboradores de Controle RN", () => {
    const rule = getScheduleGenerationRule("natal", "controle-operacional")!;
    expect(rule.excludedFromDuty).toHaveLength(11);
    expect(isExcludedFromDuty("José Victor", rule)).toBe(true);
    expect(isExcludedFromDuty("Matheus Freitas", rule)).toBe(true);
    expect(rule.sundayDutyCount).toBeNull();
  });
  it("adota sábado M. 1 em Desconexão CE e PE", () => {
    expect(getScheduleGenerationRule("fortaleza", "desconexao")?.saturdayShift).toBe("M. 1");
    expect(getScheduleGenerationRule("recife", "desconexao")?.saturdayShift).toBe("M. 1");
  });
});

describe("geração prévia sem usar IA para decidir restrições", () => {
  it("aloca exatamente 1 por plantão em Recife Instalação e preserva duas folgas", () => {
    const preview = generateSchedulePreview(source("recife", "instalacao", names(12)), "2026-12");
    const events = preview.eventCoverage.filter((x) => x.planned === 1);
    expect(events.map((x) => x.date)).toEqual([
      "2026-12-06", "2026-12-13", "2026-12-20", "2026-12-25", "2026-12-27",
    ]);
    expect(events.every((x) => x.assigned === 1)).toBe(true);
    expect(preview.blockingIssues).toEqual([]);
    const onHoliday = preview.payload.people.find(
      (p) => p.assignments["2026-12-25"] === "M. 1");
    expect(onHoliday?.assignments["2026-12-26"]).toBe("Folga");
    for (const person of preview.payload.people) {
      for (const first of ["2026-12-07", "2026-12-14", "2026-12-21"]) {
        const dates = scheduleMonthDates("2026-12");
        const start = dates.indexOf(first);
        const rest = dates.slice(start, start + 7)
          .filter((day) => person.assignments[day] === "Folga").length;
        expect(rest).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it("bloqueia geração de plantões sem quota de Fortaleza Instalação", () => {
    const preview = generateSchedulePreview(source("fortaleza", "instalacao", names(12)), "2026-12");
    expect(preview.blockingIssues.some((x) => x.includes("não configurada"))).toBe(true);
    expect(preview.eventCoverage.every((x) => x.assigned === 0)).toBe(true);
  });
  it("não cria plantão em Desconexão CE e transforma sábado M. 2 em M. 1", () => {
    const preview = generateSchedulePreview(source("fortaleza", "desconexao", names(8)), "2026-12");
    expect(preview.eventCoverage.every((x) => x.assigned === 0)).toBe(true);
    expect(preview.payload.people.every((p) =>
      p.assignments["2026-12-05"] !== "M. 2")).toBe(true);
  });
  it("preserva T. 1 de Fábio sem perder a folga compensatória de sábado", () => {
    const preview = generateSchedulePreview(source("fortaleza", "manutencao", [
      "FABIO DE SOUZA APOLINARIO", ...names(12),
    ]), "2026-12");
    const fabio = preview.payload.people.find((p) =>
      p.name === "FABIO DE SOUZA APOLINARIO");
    expect(fabio?.assignments["2026-12-04"]).toBe("T. 1");
    expect(fabio?.assignments["2026-12-05"]).toBe("Folga");
    expect(preview.eventCoverage.every((e) => e.assigned === 3)).toBe(true);
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
