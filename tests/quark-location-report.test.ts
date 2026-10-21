import { describe, expect, it } from "vitest";
import {
  buildQuarkNearHomeReport,
  numberedQuarkPunchesByDay,
} from "../src/lib/quark-location-report";
import { createQuarkLocationWorkbook } from "../src/lib/quark-location-export";
import {
  buildLocationSummaries,
  mergeQuarkPeople,
  type QuarkHome,
  type QuarkPerson,
  type QuarkPunch,
} from "../src/lib/quark";

const person: QuarkPerson = {
  unit_id: 1,
  collaborator_id: "42",
  unit_name: "DMV - RECIFE",
  unit_city: "Recife",
  full_name: "Pessoa de Teste",
  registration: null,
  job_title: null,
  job_link_title: null,
  api_sector: "Campo",
  admission_date: null,
  is_active: true,
  is_esocial: false,
  first_seen_at: "2026-09-01T00:00:00Z",
  last_seen_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const home: QuarkHome = {
  unit_id: 1,
  collaborator_id: "42",
  address: "Rua de Teste, 10",
  latitude: -8.06,
  longitude: -34.89,
  city: "Recife",
  state: "PE",
  postal_code: "",
  neighborhood: "",
  updated_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const [personView] = mergeQuarkPeople([person], [], [home]);
const base: QuarkPunch = {
  point_id: "test",
  unit_id: 1,
  collaborator_id: "42",
  work_date: "2026-09-29",
  punch_time: "08:00:00",
  punched_at: null,
  latitude: -8.06,
  longitude: -34.89,
  location: "Casa",
  observation: null,
  record_type: null,
  is_offline: false,
  is_out_of_tolerance: false,
  is_active: true,
  updated_at: "2026-09-29T12:00:00Z",
};
const punches: QuarkPunch[] = [
  { ...base, point_id: "set-29", work_date: "2026-09-29" },
  { ...base, point_id: "set-30", work_date: "2026-09-30" },
  { ...base, point_id: "out-01", work_date: "2026-10-01", latitude: -8.07 },
  { ...base, point_id: "out-02", work_date: "2026-10-02", latitude: null },
];

describe("relatório Quark — proximidade da moradia", () => {
  it("mantém a mesma contagem do Resumo da equipe no mesmo recorte e raio", () => {
    const period = punches.filter(
      (row) => row.work_date >= "2026-09-26" && row.work_date <= "2026-10-25",
    );
    const report = buildQuarkNearHomeReport([personView!], period, 200);
    const [summary] = buildLocationSummaries([personView!], period, 200);
    expect(report.details).toHaveLength(summary!.nearHome);
    expect(report.ranking[0]?.nearPunches).toBe(2);
    expect(report.ranking[0]?.nearDays).toBe(2);
    expect(report.ranking[0]?.validPunches).toBe(3);
    expect(report.ranking[0]?.nearRate).toBeCloseTo(66.6667, 3);
    expect(report.ranking[0]?.lastNearDate).toBe("2026-09-30");
    expect(report.details.map((entry) => entry.punch.point_id)).toEqual(["set-30", "set-29"]);
  });

  it("explica 2 batidas no período do painel versus 0 em outubro", () => {
    const period = buildQuarkNearHomeReport([personView!], punches, 200);
    const october = buildQuarkNearHomeReport(
      [personView!],
      punches.filter((punch) => punch.work_date.startsWith("2026-10")),
      200,
    );
    expect(period.details).toHaveLength(2);
    expect(october.details).toHaveLength(0);
  });

  it("respeita o raio e ignora colaboradores sem moradia", () => {
    expect(buildQuarkNearHomeReport([personView!], punches, 0).details).toHaveLength(2);
    const [personWithoutHome] = mergeQuarkPeople([person], [], []);
    expect(buildQuarkNearHomeReport([personWithoutHome!], punches, 200).ranking).toHaveLength(0);
  });

  it("reinicia o número da batida a cada dia em mapa e tabela", () => {
    const rows = [
      ...[8, 12, 13, 17].map((hour, i) => ({
        ...base,
        point_id: `dia1-${i}`,
        work_date: "2026-10-10",
        punch_time: `${String(hour).padStart(2, "0")}:00:00`,
      })),
      ...[8, 12, 13, 17].map((hour, i) => ({
        ...base,
        point_id: `dia2-${i}`,
        work_date: "2026-10-11",
        punch_time: `${String(hour).padStart(2, "0")}:00:00`,
      })),
    ];
    const numbered = numberedQuarkPunchesByDay(rows);
    expect(rows.map((item) => numbered.get(item.point_id))).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    // Filter to the nearby points without recalculating their daily positions.
    // Their original positions remain 3rd/4th on day 1 and 2nd/4th on day 2.
    const onlyNear = [rows[2]!, rows[3]!, rows[5]!, rows[7]!];
    expect(onlyNear.map((item) => numbered.get(item.point_id))).toEqual([3, 4, 2, 4]);
  });

  it("exporta relatório completo de todos os próximos, preservando filtros e detalhe individual", async () => {
    const secondPerson = { ...person, collaborator_id: "43", full_name: "Segunda Pessoa" };
    const secondHome = { ...home, collaborator_id: "43" };
    const [secondView] = mergeQuarkPeople([secondPerson], [], [secondHome]);
    const secondPunches: QuarkPunch[] = [
      {
        ...base,
        collaborator_id: "43",
        point_id: "seg-1",
        work_date: "2026-10-10",
        latitude: -8.06,
        longitude: -34.89,
      },
      {
        ...base,
        collaborator_id: "43",
        point_id: "seg-2",
        work_date: "2026-10-11",
        latitude: -8.07,
        longitude: -34.89,
      },
    ];
    const all = buildQuarkNearHomeReport(
      [personView!, secondView!],
      [...punches, ...secondPunches],
      200,
    );
    expect(all.ranking).toHaveLength(2);
    expect(all.details).toHaveLength(3);
    const filters = {
      collaborator: "Todos",
      unit: "DMV - RECIFE",
      city: "Recife",
      sector: "Campo",
      supervisor: "Todos",
    };
    const bytes = await createQuarkLocationWorkbook(
      all,
      "2026-09-26",
      "2026-10-25",
      200,
      "complete",
      filters,
    );
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Visão geral",
      "Resumo por colaborador",
      "Batidas próximas",
    ]);
    const overview = workbook.getWorksheet("Visão geral")!;
    expect(overview.getCell("B6").value).toBe(2);
    expect(overview.getCell("B7").value).toBe(3);
    expect(overview.getCell("B16").value).toBe("Recife");
    const people = workbook.getWorksheet("Resumo por colaborador")!;
    expect([people.getCell("B6").value, people.getCell("B7").value]).toEqual([
      "Pessoa de Teste",
      "Segunda Pessoa",
    ]);
    const details = workbook.getWorksheet("Batidas próximas")!;
    expect(details.getCell("A6").value).toBe("Segunda Pessoa");
    expect(details.getCell("A7").value).toBe("Pessoa de Teste");
    expect(details.getCell("A8").value).toBe("Pessoa de Teste");

    // A selection limited to one technician cannot include another technician's punches.
    const filtered = buildQuarkNearHomeReport([secondView!], secondPunches, 200);
    expect(filtered.ranking).toHaveLength(1);
    expect(filtered.details.map((entry) => entry.person.full_name)).toEqual(["Segunda Pessoa"]);
  }, 30000);

  it("gera XLSX real de duas abas para o colaborador", async () => {
    const report = buildQuarkNearHomeReport([personView!], punches, 200);
    const bytes = await createQuarkLocationWorkbook(
      report,
      "2026-09-26",
      "2026-10-25",
      200,
      "individual",
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo individual",
      "Batidas próximas",
    ]);
    expect(workbook.worksheets[0]?.getCell("B6").value).toBe("Pessoa de Teste");
    expect(workbook.worksheets[1]?.getCell("D6").value).toBe("2026-09-30");
  }, 30000);
});
