import { PDFDocument, PageSizes, PrintScaling, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ScheduleDateNote, SchedulePerson } from "./types";
import type { PdfRgb, SchedulePdfPalette } from "./schedule-pdf-theme";
import {
  compactScheduleCode,
  scheduleDayTotals,
  scheduleDutyDate,
  scheduleMonthDates,
} from "./schedule-view";
import { scheduleCodeKind } from "./schedule-import";

export interface SchedulePdfInput {
  people: SchedulePerson[];
  month: string;
  city: string;
  sector: string;
  notes: ScheduleDateNote[];
  palette: SchedulePdfPalette;
  filterDescription?: string | undefined;
  today?: string | undefined;
}
export interface SchedulePdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

const WIDTH = PageSizes.A3[1],
  HEIGHT = PageSizes.A3[0];
const MARGIN = 26,
  NAME_WIDTH = 225,
  HEADER_HEIGHT = 38;
const ROW_BOTTOM = HEIGHT - MARGIN - 111;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  const measured = new Map<string, number>();
  const measure = (text: string) => {
    let result = measured.get(text);
    if (result === undefined) {
      result = font.widthOfTextAtSize(text, size);
      measured.set(text, result);
    }
    return result;
  };
  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    let current = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (measure(current ? `${current} ${word}` : word) <= width) {
        current = current ? `${current} ${word}` : word;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (measure(word) <= width) {
        current = word;
        continue;
      }
      for (const char of word) {
        if (current && measure(current + char) > width) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
    }
    lines.push(current);
  }
  return lines;
}

export async function createSchedulePdf(input: SchedulePdfInput, fonts: SchedulePdfFonts) {
  if (!input.people.length) throw Error("Selecione pelo menos uma pessoa para gerar o PDF.");
  if (!scheduleDutyDate(input.month, "", "")) throw Error("Selecione um mês válido.");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  const dates = scheduleMonthDates(input.month);
  const month = new Date(`${input.month.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const notes = input.notes
    .filter((note) => dates.includes(note.note_date))
    .slice()
    .sort((a, b) => a.note_date.localeCompare(b.note_date));
  const marked = new Set(notes.map((note) => note.note_date));
  const totals = scheduleDayTotals(input.people, dates);
  const colors = input.palette;
  const tableWidth = WIDTH - 2 * MARGIN,
    dayWidth = (tableWidth - NAME_WIDTH) / dates.length;
  const color = (value: PdfRgb) => rgb(...value);
  const ensureText = (value: string) => {
    for (const char of value)
      if (!/\s/.test(char) && !supported.has(char.codePointAt(0)!))
        throw Error(
          "Há um caractere não suportado no texto da escala. Revise o texto antes de gerar o PDF.",
        );
  };
  // Validate every exported value before writing any page; never silently lose glyphs.
  for (const value of [
    input.city,
    input.sector,
    input.filterDescription ?? "",
    ...input.people.flatMap((person) => [
      person.name,
      person.login ?? "",
      person.jobTitle,
      ...dates.map((date) => person.assignments[date] ?? ""),
    ]),
    ...notes.map((note) => note.body),
  ])
    ensureText(value);
  const text = (
    page: PDFPage,
    value: string,
    x: number,
    top: number,
    size = 8,
    fill = colors.ink,
    font = regular,
    align: "left" | "center" | "right" = "left",
  ) => {
    const width = font.widthOfTextAtSize(value, size);
    page.drawText(value, {
      x: x - (align === "center" ? width / 2 : align === "right" ? width : 0),
      y: HEIGHT - top - size,
      size,
      font,
      color: color(fill),
    });
  };
  const rect = (
    page: PDFPage,
    x: number,
    top: number,
    width: number,
    height: number,
    fill: PdfRgb,
    border?: PdfRgb,
  ) =>
    page.drawRectangle({
      x,
      y: HEIGHT - top - height,
      width,
      height,
      color: color(fill),
      ...(border ? { borderColor: color(border), borderWidth: 0.45 } : {}),
    });
  const line = (page: PDFPage, x1: number, top1: number, x2: number, top2: number) =>
    page.drawLine({
      start: { x: x1, y: HEIGHT - top1 },
      end: { x: x2, y: HEIGHT - top2 },
      color: color(colors.line),
      thickness: 0.45,
    });
  const rounded = (
    page: PDFPage,
    x: number,
    top: number,
    width: number,
    height: number,
    fill: PdfRgb,
    border: PdfRgb,
  ) => {
    const r = Math.min(4, width / 2, height / 2);
    page.drawSvgPath(
      `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`,
      { x, y: HEIGHT - top, color: color(fill), borderColor: color(border), borderWidth: 0.45 },
    );
  };
  const multiline = (
    page: PDFPage,
    lines: string[],
    x: number,
    top: number,
    size: number,
    fill = colors.ink,
    font = regular,
    step = size + 2,
  ) => lines.forEach((value, index) => text(page, value, x, top + index * step, size, fill, font));

  function header(title: string) {
    const page = doc.addPage([WIDTH, HEIGHT]);
    rect(page, 0, 0, WIDTH, HEIGHT, colors.background);
    // Exact vector geometry/colors of public/technet-logo.svg, not a bitmap.
    const scale = 0.62,
      x = MARGIN + 32 * scale,
      y = HEIGHT - MARGIN - 32 * scale;
    page.drawCircle({ x, y, size: 31 * scale, color: rgb(1, 1, 1) });
    for (const radius of [29, 26, 23, 20, 17, 14, 11])
      page.drawCircle({
        x,
        y,
        size: radius * scale,
        borderWidth: 1.8 * scale,
        borderColor: rgb(227 / 255, 6 / 255, 19 / 255),
      });
    page.drawCircle({ x, y, size: 8.5 * scale, color: rgb(1, 1, 1) });
    text(page, "TechNet", MARGIN + 48, MARGIN - 1, 18, colors.primary, bold);
    text(page, title, MARGIN + 48, MARGIN + 23, 12, colors.ink, bold);
    text(
      page,
      `${input.people.length} colaborador(es) selecionado(s)`,
      WIDTH - MARGIN,
      MARGIN + 3,
      9,
      colors.muted,
      regular,
      "right",
    );
    text(
      page,
      "A3 paisagem - PDF vetorial",
      WIDTH - MARGIN,
      MARGIN + 22,
      8,
      colors.muted,
      regular,
      "right",
    );
    let top = MARGIN + 55;
    const context = wrap(`${input.city} | ${input.sector} | ${month}`, bold, 10, tableWidth);
    multiline(page, context, MARGIN, top, 10, colors.ink, bold, 13);
    top += context.length * 13 + 5;
    const filter = wrap(
      input.filterDescription || "Colaboradores selecionados - todos os dias do mês",
      regular,
      8,
      tableWidth,
    );
    multiline(page, filter, MARGIN, top, 8, colors.muted, regular, 11);
    return { page, top: top + filter.length * 11 + 12 };
  }

  const rows = input.people.map((person) => {
    const name = wrap(person.name, bold, 8.4, NAME_WIDTH - 16);
    const meta = wrap(
      [person.login, person.jobTitle || "Função não informada"].filter(Boolean).join(" - "),
      regular,
      6.8,
      NAME_WIDTH - 16,
    );
    const cells = dates.map((date) => {
      const label = compactScheduleCode(person.assignments[date] ?? "");
      // Keep normal status labels (including FALTA in a 31-day month) on one line.
      const size = bold.widthOfTextAtSize(label, 8) <= dayWidth - 7 ? 8 : 7;
      return { lines: wrap(label, bold, size, dayWidth - 7), size };
    });
    const height = Math.max(
      30,
      name.length * 10.5 + meta.length * 8.5 + 10,
      Math.max(...cells.map((cell) => cell.lines.length)) * 10 + 10,
    );
    return { person, name, meta, cells, height };
  });
  let offset = 0;
  while (offset < rows.length) {
    const { page, top } = header("Escala comparativa");
    const bodyTop = top + HEADER_HEIGHT;
    rect(page, MARGIN, top, tableWidth, HEADER_HEIGHT, colors.card, colors.line);
    text(page, "Colaborador / função", MARGIN + 8, top + 13, 9, colors.ink, bold);
    dates.forEach((date, index) => {
      const x = MARGIN + NAME_WIDTH + index * dayWidth;
      const weekday = new Date(`${date}T12:00:00`).getDay();
      const highlighted = weekday === 0 || date === input.today;
      rect(
        page,
        x,
        top,
        dayWidth,
        HEADER_HEIGHT,
        highlighted ? colors.secondary : colors.card,
        colors.line,
      );
      text(
        page,
        WEEKDAYS[weekday]!,
        x + dayWidth / 2,
        top + 6,
        7,
        weekday === 0 ? colors.primary : colors.muted,
        regular,
        "center",
      );
      text(
        page,
        `${Number(date.slice(-2))}${marked.has(date) ? " *" : ""}`,
        x + dayWidth / 2,
        top + 21,
        8,
        weekday === 0 ? colors.primary : colors.muted,
        bold,
        "center",
      );
      if (date === input.today)
        page.drawRectangle({
          x: x + 0.6,
          y: HEIGHT - top - HEADER_HEIGHT + 0.6,
          width: dayWidth - 1.2,
          height: HEADER_HEIGHT - 1.2,
          borderWidth: 0.8,
          borderColor: color(colors.primary),
        });
    });
    let y = bodyTop,
      count = 0;
    while (offset < rows.length) {
      const row = rows[offset]!;
      if (y + row.height > ROW_BOTTOM) {
        if (!count)
          throw Error(
            "Um texto da escala é longo demais para uma página. Revise esse cadastro antes de exportar.",
          );
        break;
      }
      rect(page, MARGIN, y, tableWidth, row.height, colors.card, colors.line);
      const contentHeight = row.name.length * 10.5 + row.meta.length * 8.5;
      const nameTop = y + (row.height - contentHeight) / 2;
      multiline(page, row.name, MARGIN + 8, nameTop, 8.4, colors.ink, bold, 10.5);
      multiline(
        page,
        row.meta,
        MARGIN + 8,
        nameTop + row.name.length * 10.5,
        6.8,
        colors.muted,
        regular,
        8.5,
      );
      dates.forEach((date, index) => {
        const x = MARGIN + NAME_WIDTH + index * dayWidth;
        const code = row.person.assignments[date]?.trim() ?? "";
        const label = compactScheduleCode(code);
        const badge =
          colors.badges[label === "T2" ? "t2" : code ? scheduleCodeKind(code) : "empty"];
        rounded(page, x + 2, y + 4, dayWidth - 4, row.height - 8, badge.background, badge.border);
        const { lines, size } = row.cells[index]!;
        lines.forEach((value, lineIndex) =>
          text(
            page,
            value,
            x + dayWidth / 2,
            y + (row.height - lines.length * 10) / 2 + lineIndex * 10,
            size,
            badge.foreground,
            bold,
            "center",
          ),
        );
        line(page, x, y, x, y + row.height);
      });
      y += row.height;
      offset++;
      count++;
    }
    for (const [index, label] of ["Em escala", "De folga"].entries()) {
      rect(page, MARGIN, y, tableWidth, 19, colors.card, colors.line);
      text(
        page,
        label,
        MARGIN + 8,
        y + 4,
        8,
        index === 0 ? colors.primary : colors.badges.off.background,
        bold,
      );
      totals.forEach((total, day) => {
        const x = MARGIN + NAME_WIDTH + day * dayWidth;
        line(page, x, y, x, y + 19);
        text(
          page,
          String(index === 0 ? total.work : total.off),
          x + dayWidth / 2,
          y + 4,
          8,
          index === 0 ? colors.primary : colors.badges.off.background,
          bold,
          "center",
        );
      });
      y += 19;
    }
    let legendX = MARGIN,
      legendTop = y + 12;
    for (const [label, kind] of [
      ["T1 - Turno 1", "work"],
      ["T2 - Turno 2", "t2"],
      ["F - Folga", "off"],
      ["Fé - Férias", "vacation"],
      ["L - Licença / afastamento", "leave"],
      ["FALTA - Falta", "absence"],
      ["AT - Atestado", "certificate"],
      ["- Sem marcação", "empty"],
    ] as const) {
      const width = regular.widthOfTextAtSize(label, 7.5) + 22;
      if (legendX + width > WIDTH - MARGIN) {
        legendTop += 17;
        legendX = MARGIN;
      }
      rect(
        page,
        legendX,
        legendTop,
        9,
        9,
        colors.badges[kind].background,
        colors.badges[kind].border,
      );
      text(page, label, legendX + 13, legendTop - 1, 7.5, colors.muted);
      legendX += width;
    }
    text(
      page,
      `Totais referentes a todos os ${input.people.length} colaboradores selecionados, não apenas a esta página.`,
      MARGIN,
      legendTop + 19,
      7.5,
      colors.muted,
    );
    if (notes.length)
      text(
        page,
        "* Data com observação da gestão. Texto completo nas páginas de observações deste PDF.",
        MARGIN,
        legendTop + 32,
        7.5,
        colors.muted,
      );
  }

  if (notes.length) {
    let section = header("Observações da gestão"),
      y = section.top;
    for (const note of notes) {
      const label = note.note_date.split("-").reverse().join("/");
      const lines = wrap(note.body, regular, 9, tableWidth - 24);
      let start = 0;
      do {
        if (y + 58 > HEIGHT - MARGIN - 25) {
          section = header("Observações da gestão");
          y = section.top;
        }
        const capacity = Math.floor((HEIGHT - MARGIN - 25 - y - 38) / 13);
        const part = lines.slice(start, start + capacity);
        const height = 38 + part.length * 13;
        rect(section.page, MARGIN, y, tableWidth, height, colors.card, colors.line);
        text(
          section.page,
          `${label}${start ? " (continuação)" : ""}`,
          MARGIN + 12,
          y + 10,
          10,
          colors.primary,
          bold,
        );
        multiline(section.page, part, MARGIN + 12, y + 30, 9, colors.ink, regular, 13);
        y += height + 12;
        start += part.length;
      } while (start < lines.length);
    }
  }
  const pageCount = doc.getPageCount();
  doc.getPages().forEach((page, index) => {
    text(page, "TechNet | Escalas", MARGIN, HEIGHT - 20, 7, colors.muted);
    text(
      page,
      `Página ${index + 1} de ${pageCount}`,
      WIDTH - MARGIN,
      HEIGHT - 20,
      7,
      colors.muted,
      regular,
      "right",
    );
  });
  doc.setTitle(`Escala - ${input.city} - ${input.sector} - ${month}`);
  doc.setAuthor("TechNet");
  doc.setCreator("TechNet - Escalas");
  doc.setLanguage("pt-BR");
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await doc.save(), pageCount };
}
