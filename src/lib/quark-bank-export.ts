import { formatMinutes, resolvePersonCity, resolvePersonSector } from "./quark";
import {
  quarkBankRowsForScope,
  quarkBankScopeLabels,
  type QuarkBankReport,
  type QuarkBankRow,
  type QuarkBankScope,
} from "./quark-bank-report";

export interface QuarkBankExportContext {
  startDate: string;
  endDate: string;
  filters: {
    collaborator: string;
    unit: string;
    city: string;
    sector: string;
    supervisor: string;
  };
}

const scopeDescriptions: Record<QuarkBankScope, string> = {
  people:
    "Um registro por colaborador com dados no período, incluindo saldo zero. Saldo = soma das movimentações diárias.",
  positive: "Colaboradores com saldo acumulado positivo no período, do maior para o menor saldo.",
  negative: "Colaboradores com saldo acumulado negativo no período, do menor para o maior saldo.",
  "top-positive": "Até 10 colaboradores com os maiores saldos positivos no período.",
  "top-negative": "Até 10 colaboradores com os menores saldos negativos no período.",
  alerts:
    "Somente dias com extras estritamente acima de 120 minutos: extras normais + noturnas + 100%. Cada linha é um colaborador/dia.",
};
const sheetNames: Record<QuarkBankScope, string> = {
  people: "Colaboradores",
  positive: "Saldos positivos",
  negative: "Saldos negativos",
  "top-positive": "Top 10 positivos",
  "top-negative": "Top 10 negativos",
  alerts: "Alertas acima de 2h",
};

// Numeric decimal hours keep negative balances and durations >24h usable in Excel.
const HOURS_FORMAT = '0.00" h";[Red]-0.00" h";0.00" h"';
const excelDate = (value: string) => new Date(`${value}T12:00:00Z`);

export async function createQuarkBankWorkbook(
  report: QuarkBankReport,
  context: QuarkBankExportContext,
  scope: QuarkBankScope | null = null,
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TechNET - Quark";
  workbook.subject = "Banco de horas — filtros atuais do painel";
  workbook.created = new Date();
  const scopes: QuarkBankScope[] = scope
    ? [scope]
    : ["people", "positive", "negative", "top-positive", "top-negative", "alerts"];
  const commonHeaders = [
    "Nome",
    "Matrícula",
    "ID colaborador",
    "Cidade",
    "Setor",
    "Unidade",
    "Supervisor",
    "Período - início",
    "Período - fim",
  ];
  const identity = ({ person }: QuarkBankRow) => [
    person.full_name,
    person.registration ?? "",
    person.collaborator_id,
    resolvePersonCity(person),
    resolvePersonSector(person),
    person.unit_name,
    person.directory?.supervisor || "Sem supervisor",
    excelDate(context.startDate),
    excelDate(context.endDate),
  ];
  for (const current of scopes) {
    const daily = current === "alerts";
    const headers = daily
      ? [
          ...commonHeaders,
          "Data do alerta",
          "Extras do dia (HH:MM)",
          "Extras do dia (horas)",
          "Extras normais (min)",
          "Extras noturnas (min)",
          "Extras 100% (min)",
          "Movimentação do dia (HH:MM)",
          "Movimentação do dia (horas)",
          "Saldo no período (HH:MM)",
          "Saldo no período (horas)",
        ]
      : [
          ...commonHeaders,
          "Último registro",
          "Saldo no período (HH:MM)",
          "Saldo no período (horas)",
          "Extras no período (HH:MM)",
          "Extras no período (horas)",
        ];
    const tab = workbook.addWorksheet(sheetNames[current], {
      views: [{ state: "frozen", xSplit: 1, ySplit: 7, showGridLines: false }],
      properties: { tabColor: { argb: current === "negative" || daily ? "FFDC3545" : "FF0F172A" } },
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:7",
      },
    });
    const contextLines = [
      `TECHNET | QUARK • ${quarkBankScopeLabels[current].toLocaleUpperCase("pt-BR")}`,
      scopeDescriptions[current],
      `Período: ${context.startDate.split("-").reverse().join("/")} a ${context.endDate.split("-").reverse().join("/")} • Exportado em ${workbook.created.toLocaleString("pt-BR")}`,
      `Filtros: nome/login = ${context.filters.collaborator}; cidade = ${context.filters.city}; setor = ${context.filters.sector}; unidade = ${context.filters.unit}; supervisor = ${context.filters.supervisor}.`,
      "HH:MM mantém o sinal e pode exceder 24h. Colunas (horas) são numéricas decimais para cálculos no Excel; colunas (min) estão em minutos.",
      daily
        ? `${report.alerts.length} alertas no recorte. Dias com exatamente 2h não entram.`
        : `${quarkBankRowsForScope(report, current).length} colaboradores no recorte. Extras = normais + noturnas + 100%.`,
    ];
    contextLines.forEach((line, index) => {
      tab.addRow([line]);
      tab.mergeCells(index + 1, 1, index + 1, headers.length);
      const cell = tab.getCell(index + 1, 1);
      cell.font = {
        name: "Calibri",
        size: index === 0 ? 16 : 11,
        bold: index === 0,
        color: { argb: index === 0 ? "FFDC3545" : "FF475569" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      tab.getRow(index + 1).height = index === 0 ? 32 : index === 3 ? 36 : 28;
    });
    const header = tab.addRow(headers);
    header.height = 34;
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    const values = daily
      ? report.alerts.map(({ row, day, extras }) => [
          ...identity(row),
          excelDate(day.work_date),
          formatMinutes(extras),
          extras / 60,
          day.normal_extra_minutes,
          day.night_extra_minutes,
          day.extra_100_minutes,
          formatMinutes(day.bank_balance_minutes),
          day.bank_balance_minutes / 60,
          formatMinutes(row.balance),
          row.balance / 60,
        ])
      : quarkBankRowsForScope(report, current).map((row) => [
          ...identity(row),
          excelDate(row.latest.work_date),
          formatMinutes(row.balance),
          row.balance / 60,
          formatMinutes(row.extras),
          row.extras / 60,
        ]);
    values.forEach((values, index) => {
      const row = tab.addRow(values);
      row.height = 32;
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF0F172A" } };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (index % 2 === 0)
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        const label = headers[column - 1] ?? "";
        if (label.endsWith("(horas)")) cell.numFmt = HOURS_FORMAT;
        if (cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy";
      });
    });
    tab.columns.forEach((column, index) => {
      column.width = index === 0 ? 38 : [2, 3, 4, 5, 6].includes(index) ? 26 : 19;
    });
    tab.autoFilter = {
      from: { row: 7, column: 1 },
      to: { row: Math.max(7, tab.rowCount), column: headers.length },
    };
    if (!values.length) {
      tab.addRow(["Nenhum registro corresponde a este recorte nos filtros selecionados."]);
      tab.mergeCells(8, 1, 8, headers.length);
      tab.getRow(8).font = { name: "Calibri", italic: true, color: { argb: "FF64748B" } };
    }
  }
  return await workbook.xlsx.writeBuffer();
}
