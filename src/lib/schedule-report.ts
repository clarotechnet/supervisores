import type { ScheduleUpload } from "./types";
import { scheduleCodeKind } from "./schedule-import";
import { scheduleMonthDates } from "./schedule-view";

export interface ScheduleReportRow {
  nome: string;
  login: string;
  diasPeriodo: number;
  diasTrabalhados: number;
  diasAtividade: number;
  m2Descontados: number;
  folgas: number;
  feriasLicenca: number;
  faltas: number;
  atestados: number;
  semEscala: number;
  plantoes: number;
  folgasSemana: number;
}

function normalized(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function isLunchExcludedM2(front: string, code: string): boolean {
  const normalizedFront = normalized(front).replace(/[^A-Z0-9]/g, "");
  if (!["MDU", "CONSTRUCAO", "DESCONEXAO"].includes(normalizedFront)) return false;
  const normalizedCode = normalized(code).replace(/[^A-Z0-9]/g, "");
  return normalizedCode === "M2";
}

function stateCodeForCity(city: string): "RN" | "CE" | "PE" | "BR" {
  const value = normalized(city);
  if (value === "NATAL" || value === "MOSSORO") return "RN";
  if (value === "FORTALEZA") return "CE";
  if (value === "RECIFE") return "PE";
  return "BR";
}

function isoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

function holidayMap(year: number, stateCode: string): Map<string, string> {
  const holidays = new Map<string, string>();
  const add = (month: number, day: number, name: string) => {
    holidays.set(isoDate(new Date(year, month - 1, day, 12)), name);
  };
  const addRelative = (base: Date, offset: number, name: string) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
    date.setDate(date.getDate() + offset);
    holidays.set(isoDate(date), name);
  };

  add(1, 1, "Confraternização Universal");
  add(4, 21, "Tiradentes");
  add(5, 1, "Dia do Trabalho");
  add(9, 7, "Independência do Brasil");
  add(10, 12, "Nossa Senhora Aparecida");
  add(11, 2, "Finados");
  add(11, 15, "Proclamação da República");
  add(11, 20, "Consciência Negra");
  add(12, 25, "Natal");

  const easter = easterDate(year);
  addRelative(easter, -48, "Carnaval");
  addRelative(easter, -47, "Carnaval");
  addRelative(easter, -2, "Sexta-feira Santa");
  addRelative(easter, 60, "Corpus Christi");

  if (stateCode === "RN") {
    add(10, 3, "Mártires de Cunhaú e Uruaçu");
  } else if (stateCode === "CE") {
    add(3, 25, "Data Magna do Ceará");
    add(8, 15, "Nossa Senhora da Assunção · Fortaleza");
    if (year === 2026) add(4, 13, "300 anos de Fortaleza");
  } else if (stateCode === "PE") {
    add(3, 6, "Data Magna de Pernambuco");
    add(6, 24, "São João · Recife");
    add(7, 16, "Nossa Senhora do Carmo · Recife");
    add(12, 8, "Nossa Senhora da Conceição · Recife");
  }
  return holidays;
}

function specialDateInfo(iso: string, city: string, holidays: Map<string, string>) {
  const date = new Date(`${iso}T12:00:00`);
  return { sunday: date.getDay() === 0, holiday: holidays.get(iso) ?? "" };
}
export function buildScheduleReportRows(schedule: ScheduleUpload): ScheduleReportRow[] {
  const dates = scheduleMonthDates(schedule.schedule_month);
  const year = Number(schedule.schedule_month.slice(0, 4));
  const holidays = holidayMap(year, stateCodeForCity(schedule.city));

  return schedule.payload.people
    .map((person) => {
      const row: ScheduleReportRow = {
        nome: person.name,
        login: person.login ?? "",
        diasPeriodo: dates.length,
        diasTrabalhados: 0,
        diasAtividade: 0,
        m2Descontados: 0,
        folgas: 0,
        feriasLicenca: 0,
        faltas: 0,
        atestados: 0,
        semEscala: 0,
        plantoes: 0,
        folgasSemana: 0,
      };

      for (const date of dates) {
        const code = person.assignments[date]?.trim() ?? "";
        if (!code) {
          row.semEscala += 1;
          continue;
        }
        const kind = scheduleCodeKind(code);
        const special = specialDateInfo(date, schedule.city, holidays);
        if (kind === "work") {
          row.diasAtividade += 1;
          if (isLunchExcludedM2(schedule.sector, code)) row.m2Descontados += 1;
          else row.diasTrabalhados += 1;
          if (special.sunday || special.holiday) row.plantoes += 1;
        } else if (kind === "off") {
          row.folgas += 1;
          if (!special.sunday && !special.holiday) row.folgasSemana += 1;
        } else if (kind === "vacation" || kind === "leave") {
          row.feriasLicenca += 1;
        } else if (kind === "absence") {
          row.faltas += 1;
        } else if (kind === "certificate") {
          row.atestados += 1;
        }
      }
      return row;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function kindLabel(code: string): string {
  if (!code.trim()) return "Sem escala";
  const kind = scheduleCodeKind(code);
  if (kind === "off") return "Folga";
  if (kind === "vacation") return "Férias";
  if (kind === "leave") return "Licença / afastamento";
  if (kind === "absence") return "Falta no dia";
  if (kind === "certificate") return "Atestado (AT)";
  return "Trabalho / turno";
}
function formatDateBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${iso}T12:00:00`));
}

function safeSlug(value: string): string {
  return normalized(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function downloadScheduleReport(schedule: ScheduleUpload): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TechNET";
  workbook.company = "TechNET";
  workbook.created = new Date();

  const rows = buildScheduleReportRows(schedule);
  const dates = scheduleMonthDates(schedule.schedule_month);
  const firstDate = dates[0] ?? schedule.schedule_month;
  const lastDate = dates.at(-1) ?? schedule.schedule_month;
  const monthLabel = new Date(`${schedule.schedule_month}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const summary = workbook.addWorksheet("Resumo por colaborador", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  summary.mergeCells("A1:Q1");
  summary.getCell("A1").value = `Relatório de Escalas · ${schedule.city} · ${schedule.sector}`;
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B2B" } };
  summary.getCell("A1").alignment = { vertical: "middle" };
  summary.getRow(1).height = 26;

  summary.mergeCells("A2:Q2");
  summary.getCell("A2").value =
    `${monthLabel} · M.2 não conta como dia trabalhado em MDU, Construção e Desconexão.`;
  summary.getCell("A2").font = { italic: true, color: { argb: "FF475569" } };

  const headers = [
    "Nome",
    "Login",
    "Cidade",
    "Frente",
    "Dias no período",
    "Dias trabalhados",
    "Dias com atividade",
    "M.2 descontados",
    "Folgas",
    "Férias/Licença",
    "Faltas",
    "Atestados (AT)",
    "Sem escala",
    "Plantões dom./feriados",
    "Folgas na semana",
    "Data inicial",
    "Data final",
  ];
  summary.addRow([]);
  const headerRow = summary.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 30;
  for (const item of rows) {
    summary.addRow([
      item.nome,
      item.login,
      schedule.city,
      schedule.sector,
      item.diasPeriodo,
      item.diasTrabalhados,
      item.diasAtividade,
      item.m2Descontados,
      item.folgas,
      item.feriasLicenca,
      item.faltas,
      item.atestados,
      item.semEscala,
      item.plantoes,
      item.folgasSemana,
      formatDateBr(firstDate),
      formatDateBr(lastDate),
    ]);
  }
  summary.autoFilter = { from: "A4", to: `Q${Math.max(4, summary.rowCount)}` };
  [34, 15, 14, 22, 15, 17, 18, 18, 10, 17, 10, 15, 12, 22, 18, 14, 14].forEach((width, index) => {
    summary.getColumn(index + 1).width = width;
  });
  summary.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return;
    row.alignment = { vertical: "middle" };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
  });

  const detail = workbook.addWorksheet("Detalhamento diário", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  detail.columns = [
    { header: "Data", key: "date", width: 13 },
    { header: "Nome", key: "name", width: 34 },
    { header: "Login", key: "login", width: 15 },
    { header: "Código", key: "code", width: 15 },
    { header: "Classificação", key: "kind", width: 22 },
    { header: "Conta como dia trabalhado?", key: "worked", width: 24 },
    { header: "Domingo/Feriado", key: "special", width: 28 },
    { header: "Regra M.2", key: "m2", width: 34 },
  ];
  detail.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detail.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
  const holidays = holidayMap(
    Number(schedule.schedule_month.slice(0, 4)),
    stateCodeForCity(schedule.city),
  );

  for (const person of schedule.payload.people) {
    for (const date of dates) {
      const code = person.assignments[date]?.trim() ?? "";
      const kind = code ? scheduleCodeKind(code) : null;
      const special = specialDateInfo(date, schedule.city, holidays);
      const excludedM2 = Boolean(code && isLunchExcludedM2(schedule.sector, code));
      detail.addRow({
        date: formatDateBr(date),
        name: person.name,
        login: person.login ?? "",
        code: code || "—",
        kind: kindLabel(code),
        worked: kind === "work" && !excludedM2 ? "Sim" : "Não",
        special: special.holiday || (special.sunday ? "Domingo" : ""),
        m2: excludedM2 ? "M.2 até 12h · não conta como dia trabalhado" : "",
      });
    }
  }
  detail.autoFilter = { from: "A1", to: `H${Math.max(1, detail.rowCount)}` };
  detail.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "middle" };
    if (rowNumber === 1) return;
    const classification = String(row.getCell(5).value ?? "");
    if (classification === "Falta no dia") {
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      row.getCell(5).font = { bold: true, color: { argb: "FF991B1B" } };
    } else if (classification === "Atestado (AT)") {
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCFBF1" } };
      row.getCell(5).font = { bold: true, color: { argb: "FF115E59" } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-escalas-${safeSlug(schedule.city)}-${safeSlug(schedule.sector)}-${schedule.schedule_month.slice(0, 7)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
