import type { QuarkNearHomeReport } from "./quark-location-report";
import { resolvePersonCity, resolvePersonSector } from "./quark";

export type QuarkReportWorkbookKind = "ranking" | "details" | "individual" | "complete";

export interface QuarkLocationReportFilters {
  collaborator?: string;
  unit?: string;
  city?: string;
  sector?: string;
  supervisor?: string;
}

export async function createQuarkLocationWorkbook(
  report: QuarkNearHomeReport,
  startDate: string,
  endDate: string,
  radiusMeters: number,
  kind: QuarkReportWorkbookKind,
  filters: QuarkLocationReportFilters = {},
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TechNET - Quark";
  workbook.subject = "Análise de batidas próximas da moradia";
  workbook.created = new Date();

  function sheet(
    name: string,
    header: string[],
    rows: (string | number | null)[][],
    widths: number[],
  ) {
    const tab = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 5 }],
    });
    tab.addRow(["TECHNET | QUARK • RELATÓRIO DE PROXIMIDADE"]);
    tab.addRow(["Início", startDate, "Fim", endDate]);
    tab.addRow(["Raio (m)", radiusMeters, "Critério", "GPS a até o raio da moradia"]);
    tab.addRow([
      "Informativo: proximidade geográfica não determina, isoladamente, irregularidade.",
    ]);
    const headerRow = tab.addRow(header);
    for (const row of rows) tab.addRow(row);
    tab.columns.forEach((column, i) => {
      column.width = widths[i] ?? 18;
    });
    tab.getRow(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFDC3545" } };
    tab.getRow(4).font = { name: "Calibri", italic: true, color: { argb: "FF64748B" } };
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
    headerRow.height = 32;
    if (rows.length) {
      tab.autoFilter = {
        from: { row: 5, column: 1 },
        to: { row: 5 + rows.length, column: header.length },
      };
    }
    for (let row = 6; row <= 5 + rows.length; row++) {
      tab.getRow(row).alignment = { vertical: "middle", wrapText: false };
      if (row % 2 === 0) {
        tab.getRow(row).eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        });
      }
    }
    return tab;
  }

  const ranking = report.ranking;
  const details = report.details;

  if (kind === "complete") {
    const validPunches = ranking.reduce((total, entry) => total + entry.validPunches, 0);
    const distinctDays = new Set(details.map(({ punch }) => punch.work_date)).size;
    sheet(
      "Visão geral",
      ["Indicador", "Valor", "Observações"],
      [
        [
          "Colaboradores com batidas próximas",
          ranking.length,
          "Somente colaboradores no raio selecionado",
        ],
        ["Batidas próximas da moradia", details.length, "Coordenadas válidas dentro do raio"],
        ["Dias distintos com proximidade", distinctDays, "Datas únicas da equipe no período"],
        ["Batidas com GPS das pessoas listadas", validPunches, "Base do percentual de proximidade"],
        [
          "Proximidade global (%)",
          validPunches ? Number(((details.length / validPunches) * 100).toFixed(2)) : 0,
          "Próximas / batidas com GPS",
        ],
        ["Data inicial", startDate, ""],
        ["Data final", endDate, ""],
        ["Raio analisado (m)", radiusMeters, ""],
        ["Filtro de colaborador", filters.collaborator || "Todos", ""],
        ["Filtro de unidade", filters.unit || "Todas", ""],
        ["Filtro de cidade", filters.city || "Todas", ""],
        ["Filtro de setor", filters.sector || "Todos", ""],
        ["Filtro de supervisor", filters.supervisor || "Todos", ""],
      ],
      [46, 32, 62],
    );
  }

  if (kind === "ranking" || kind === "individual" || kind === "complete") {
    sheet(
      kind === "individual"
        ? "Resumo individual"
        : kind === "complete"
          ? "Resumo por colaborador"
          : "Ranking",
      [
        "#",
        "Colaborador",
        "Unidade",
        "Cidade",
        "Setor",
        "Supervisor",
        "Batidas próximas",
        "Dias distintos",
        "Batidas com GPS",
        "% próximas / GPS",
        "Último dia próximo",
        "Menor distância (m)",
      ],
      ranking.map((entry, i) => [
        i + 1,
        entry.person.full_name,
        entry.person.unit_name,
        resolvePersonCity(entry.person),
        resolvePersonSector(entry.person),
        entry.person.directory?.supervisor ?? "",
        entry.nearPunches,
        entry.nearDays,
        entry.validPunches,
        Number(entry.nearRate.toFixed(2)),
        entry.lastNearDate,
        Number(entry.nearestDistanceMeters.toFixed(1)),
      ]),
      [8, 42, 32, 22, 22, 28, 21, 18, 22, 21, 22, 22],
    );
  }

  if (kind === "details" || kind === "individual" || kind === "complete") {
    sheet(
      "Batidas próximas",
      [
        "Colaborador",
        "Supervisor",
        "Unidade",
        "Data",
        "Hora",
        "Distância (m)",
        "Latitude",
        "Longitude",
        "Local informado",
        "Coordenadas no mapa",
      ],
      details.map(({ person, punch, distanceMeters }) => [
        person.full_name,
        person.directory?.supervisor ?? "",
        person.unit_name,
        punch.work_date,
        punch.punch_time ?? "",
        Number(distanceMeters.toFixed(1)),
        punch.latitude,
        punch.longitude,
        punch.location ?? "",
        punch.latitude !== null && punch.longitude !== null
          ? `https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`
          : "",
      ]),
      [42, 26, 32, 18, 14, 18, 19, 19, 50, 63],
    );
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return Uint8Array.from(bytes as unknown as ArrayLike<number>).buffer;
}
