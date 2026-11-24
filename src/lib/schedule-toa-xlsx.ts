import type { Cell, Worksheet } from "exceljs";
import {
  parseToaProfiles,
  TOA_HEADERS,
  TOA_PERSON_SHIFT,
  type ScheduleToaPlan,
  type ToaCatalog,
} from "./schedule-toa";
import type { ScheduleUpload } from "./types";

const TURNOS = "Turnos TOA";
const SOURCE = "escala";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TURNOS_LAST_ROW = 2000;

function cellText(cell: Cell | undefined): string {
  if (!cell || (cell.isMerged && cell.master.address !== cell.address)) return "";
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) return scalar(cell.result);
    if ("richText" in value)
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    if ("text" in value) return value.text.trim();
  }
  return scalar(value);
}

function scalar(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function profileCells(sheet: Worksheet) {
  const rows: string[][] = [];
  const columnCount = Math.min(25, sheet.columnCount);
  if (sheet.rowCount > 15000) throw Error("A aba de cadastro TOA é maior que 15.000 linhas.");
  sheet.eachRow((row) => {
    rows.push(Array.from({ length: columnCount }, (_, i) => cellText(row.findCell(i + 1))));
  });
  return rows;
}

export async function readScheduleToaCatalog(file: File): Promise<ToaCatalog> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 12 * 1024 * 1024) {
    throw Error("Selecione um cadastro ou compilado TOA em XLSX de até 12 MB.");
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const named = (name: string) =>
    workbook.worksheets.find((s) => s.name.trim().toUpperCase() === name);
  const sources = [named("COMPILADO"), named("LOGINS"), named("CADASTRO"), workbook.worksheets[0]];
  const profiles = sources.reduce<ToaCatalog["profiles"]>(
    (found, sheet) => (found.length || !sheet ? found : parseToaProfiles(profileCells(sheet))),
    [],
  );
  if (!profiles.length)
    throw Error("Não encontrei uma aba com as colunas LOGIN e Nome preenchidas.");
  const ruleSheet = workbook.getWorksheet(TURNOS);
  const city = cellText(ruleSheet?.getCell("F1"));
  const sector = cellText(ruleSheet?.getCell("F2"));
  if (!ruleSheet || !city || !sector) return { profiles };
  const values = [];
  for (let row = 2; row <= Math.min(ruleSheet.rowCount, TURNOS_LAST_ROW); row++) {
    const code = cellText(ruleSheet.getCell(row, 1));
    const shift = cellText(ruleSheet.getCell(row, 2));
    const area = cellText(ruleSheet.getCell(row, 3));
    if (code && shift) values.push({ code, shift, ...(area ? { area } : {}) });
  }
  return { profiles, rules: { city, sector, values } };
}

function columnName(column: number) {
  let letters = "";
  for (; column > 0; column = Math.floor((column - 1) / 26)) {
    letters = String.fromCharCode(65 + ((column - 1) % 26)) + letters;
  }
  return letters;
}

function setFormula(cell: Cell, formula: string, result: string) {
  cell.value = { formula, result };
}

function fill(cell: Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function titleRow(sheet: Worksheet, headers: (string | Date)[], datesStart: number) {
  const row = sheet.addRow(headers);
  row.height = 25;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  row.eachCell((cell, col) => {
    const onCalendar = col >= datesStart;
    fill(cell, onCalendar ? "FF406481" : "FF283B4E");
    if (onCalendar) {
      cell.numFmt = "dd/mm";
      if (cell.value instanceof Date && cell.value.getUTCDay() === 0) fill(cell, "FF81402F");
    }
  });
}

function widths(sheet: Worksheet, widths: number[]) {
  widths.forEach((width, i) => (sheet.getColumn(i + 1).width = width));
}

export async function buildScheduleToaWorkbook(schedule: ScheduleUpload, plan: ScheduleToaPlan) {
  if (!plan.people.length || !plan.dates.length)
    throw Error("A escala selecionada não tem colaboradores ou datas.");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "TechNET";
  book.title = `Compilado TOA · ${schedule.city} · ${schedule.sector} · ${schedule.schedule_month.slice(0, 7)}`;
  book.calcProperties.fullCalcOnLoad = true;
  const main = book.addWorksheet("COMPILADO", {
    views: [{ state: "frozen", xSplit: 5, ySplit: 1, showGridLines: false }],
  });
  const source = book.addWorksheet(SOURCE, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 1, showGridLines: false }],
  });
  const rulesSheet = book.addWorksheet(TURNOS, {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const dates = plan.dates.map((date) => new Date(`${date}T00:00:00Z`));
  titleRow(main, [...TOA_HEADERS, ...dates], TOA_HEADERS.length + 1);
  titleRow(source, ["Nº", "LOGIN", "Nome", ...dates], 4);
  titleRow(rulesSheet, ["Código na escala", "Turno no compilado", "Área alternativa"], Infinity);
  widths(main, [6, 17, 9, 14, 34, 22, 25, 24, 31, ...dates.map(() => 24)]);
  widths(source, [6, 14, 34, ...dates.map(() => 15)]);
  widths(rulesSheet, [24, 45, 62, 3, 16, 39]);
  main.getColumn(4).numFmt = "@";
  main.getColumn(8).numFmt = "@";
  source.getColumn(2).numFmt = "@";
  rulesSheet.getCell("E1").value = "Cidade";
  rulesSheet.getCell("F1").value = schedule.city;
  rulesSheet.getCell("E2").value = "Frente";
  rulesSheet.getCell("F2").value = schedule.sector;
  rulesSheet.getCell("E3").value = "Competência";
  rulesSheet.getCell("F3").value = schedule.schedule_month.slice(0, 7);
  rulesSheet.getCell("E5").value = "Sem horário";
  rulesSheet.getCell("F5").value =
    "Se a coluna B estiver vazia, o compilado mantém o código da escala.";
  rulesSheet.getCell("E6").value = "Escala padrão";
  rulesSheet.getCell("F6").value =
    `Use “${TOA_PERSON_SHIFT}” na coluna B para ler a coluna ESCALA.`;
  for (const row of [5, 6]) {
    rulesSheet.getRow(row).height = 33;
    rulesSheet.getCell(row, 6).alignment = { vertical: "middle", wrapText: true };
  }
  for (const [index, rule] of plan.rules.entries()) {
    const row = rulesSheet.getRow(index + 2);
    [rule.code, rule.shift || null, rule.area ?? null].forEach((value, i) => {
      row.getCell(i + 1).value = value;
    });
    if (!rule.shift) fill(row.getCell(2), "FFFFEDB8");
  }

  const rulesByCode = new Map(plan.rules.map((rule) => [rule.code, rule]));
  const lookups = `'${TURNOS}'!$A$2:$C$${TURNOS_LAST_ROW}`;
  for (const [index, person] of plan.people.entries()) {
    const sourceRow = source.addRow([
      index + 1,
      person.login || null,
      person.name,
      ...person.marks.map((code) => code || null),
    ]);
    const row = main.addRow([
      index + 1,
      person.city,
      person.state || null,
      person.login || null,
      person.name,
      person.bucket || null,
      person.area || null,
      person.cep || null,
      person.shift || null,
    ]);
    row.height = 30;
    const areaRow = main.addRow([]);
    areaRow.height = 25;
    const cepRow = main.addRow([]);
    cepRow.height = 18;
    for (let col = 1; col <= TOA_HEADERS.length; col++) {
      main.mergeCells(row.number, col, cepRow.number, col);
      const cell = row.getCell(col);
      cell.font = { name: "Arial", size: 9, bold: col === 5 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 5 ? "left" : "center",
        wrapText: true,
      };
      fill(cell, !cell.value ? "FFFFF4D5" : index % 2 === 0 ? "FFF3F6F9" : "FFFFFFFF");
    }
    for (const [dayIndex, code] of person.marks.entries()) {
      const column = TOA_HEADERS.length + dayIndex + 1;
      const dayMark = `'${SOURCE}'!${columnName(dayIndex + 4)}${sourceRow.number}`;
      const literal = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${dayMark},"~","~~"),"*","~*"),"?","~?")`;
      const shiftLookup = `VLOOKUP(${literal},${lookups},2,FALSE)`;
      const areaLookup = `VLOOKUP(${literal},${lookups},3,FALSE)`;
      const standard = `$I${row.number}`;
      const base = `$G${row.number}`;
      const cep = `$H${row.number}`;
      const rule = rulesByCode.get(code);
      const shift = rule?.shift === TOA_PERSON_SHIFT ? person.shift || code : rule?.shift || code;
      const shiftCell = row.getCell(column);
      const areaCell = areaRow.getCell(column);
      const cepCell = cepRow.getCell(column);
      cepCell.numFmt = "@";
      setFormula(
        shiftCell,
        `IF(${dayMark}="","",IFERROR(IF(${shiftLookup}=0,${dayMark},IF(${shiftLookup}="${TOA_PERSON_SHIFT}",IF(${standard}="",${dayMark},${standard}),${shiftLookup})),${dayMark}))`,
        shift,
      );
      const baseArea = `IF(${base}="","",${base})`;
      setFormula(
        areaCell,
        `IF(${dayMark}="","",IFERROR(IF(${areaLookup}=0,${baseArea},${areaLookup}),${baseArea}))`,
        code ? rule?.area || person.area : "",
      );
      setFormula(cepCell, `IF(OR(${dayMark}="",${cep}=""),"",${cep})`, code ? person.cep : "");
      for (const cell of [shiftCell, areaCell, cepCell]) {
        cell.font = {
          name: "Arial",
          size: 9,
          bold: cell === shiftCell,
          color: { argb: cell === shiftCell ? "FF172D43" : "FF42556B" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
      fill(shiftCell, !code ? "FFF4F6F8" : shift === "FOLGA" ? "FFFCE6E6" : "FFEDF3F8");
      fill(cepCell, "FFF7F9FC");
      cepCell.border = { bottom: { style: "thin", color: { argb: "FFD0DBE5" } } };
    }
    for (let col = 1; col <= TOA_HEADERS.length; col++) {
      cepRow.getCell(col).border = { bottom: { style: "thin", color: { argb: "FFD0DBE5" } } };
    }
  }
  return book;
}

export async function downloadScheduleToa(schedule: ScheduleUpload, plan: ScheduleToaPlan) {
  const workbook = await buildScheduleToaWorkbook(schedule, plan);
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const scope = `${schedule.city}-${schedule.sector}`.replace(/[^a-z0-9-]+/gi, "-");
  a.href = url;
  a.download = `compilado-toa-${scope}-${schedule.schedule_month.slice(0, 7)}${plan.needsReview ? "-revisao" : ""}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
