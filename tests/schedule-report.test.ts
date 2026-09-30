import { describe, expect, it } from "vitest";
import type { ScheduleUpload } from "../src/lib/types";
import { buildScheduleReportRows, isLunchExcludedM2 } from "../src/lib/schedule-report";

function scheduleWithM2(): ScheduleUpload {
  const assignments: Record<string, string> = {};
  for (let day = 1; day <= 24; day += 1) {
    assignments[`2026-10-${String(day).padStart(2, "0")}`] = [2, 5, 8].includes(day)
      ? "M.2"
      : "M.1";
  }
  assignments["2026-10-25"] = "FALTA";
  assignments["2026-10-26"] = "AT";
  assignments["2026-10-27"] = "FÉRIAS";
  assignments["2026-10-28"] = "LCC.";
  assignments["2026-10-29"] = "Folga";

  return {
    id: "schedule-1",
    city: "natal",
    sector: "mdu",
    schedule_month: "2026-10-01",
    source_file: "teste.xlsx",
    source_sheet: "OUTUBRO 2026",
    employee_count: 1,
    entry_count: Object.keys(assignments).length,
    payload: {
      dates: Array.from(
        { length: 31 },
        (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
      ),
      people: [
        {
          name: "Técnico Teste",
          login: "Z000001",
          jobTitle: "TÉCNICO",
          assignments,
        },
      ],
      codes: ["M.1", "M.2", "FALTA", "AT", "FÉRIAS", "LCC.", "Folga"],
    },
    imported_by: null,
    imported_at: "2026-09-30T12:00:00.000Z",
    updated_at: "2026-09-30T12:00:00.000Z",
  };
}

describe("relatório de escalas", () => {
  it("desconta M.2 apenas nas frentes MDU, Construção e Desconexão", () => {
    expect(isLunchExcludedM2("mdu", "M.2")).toBe(true);
    expect(isLunchExcludedM2("Construção", "M. 2")).toBe(true);
    expect(isLunchExcludedM2("desconexao", "M2")).toBe(true);
    expect(isLunchExcludedM2("controle-operacional", "M.2")).toBe(false);
    expect(isLunchExcludedM2("mdu", "M.1")).toBe(false);
  });

  it("mantém atividade e reduz dias trabalhados de 24 para 21 quando há três M.2", () => {
    const [row] = buildScheduleReportRows(scheduleWithM2());
    expect(row).toMatchObject({
      diasPeriodo: 31,
      diasAtividade: 24,
      diasTrabalhados: 21,
      m2Descontados: 3,
      folgas: 1,
      feriasLicenca: 2,
      faltas: 1,
      atestados: 1,
      semEscala: 2,
    });
  });
});
