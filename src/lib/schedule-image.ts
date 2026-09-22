import type { ScheduleDateNote, SchedulePerson } from "./types";
import { compactScheduleCode, scheduleDayTotals, scheduleMonthDates } from "./schedule-view";
import { scheduleCodeKind } from "./schedule-import";

export const SCHEDULE_IMAGE_WIDTH = 1920;
export const SCHEDULE_IMAGE_HEIGHT = 1080;
export const SCHEDULE_IMAGE_ROWS = 12;

interface ScheduleImageInput {
  people: SchedulePerson[];
  month: string;
  city: string;
  sector: string;
  notes: ScheduleDateNote[];
  theme?: "light" | "dark";
}

const LIGHT_COLORS = {
  ink: "#0a1829",
  red: "#e62436",
  redSoft: "#fcecee",
  muted: "#64748b",
  line: "#cbd5e1",
  background: "#f4f6fa",
  card: "#ffffff",
  amber: "#96551a",
  amberSoft: "#fff4d6",
  empty: "#edf1f5",
  off: "#334155",
  offText: "#ffffff",
  offBorder: "#0f172a",
  leave: "#e2e8f0",
  leaveText: "#0a1829",
  t2: "#0a1829",
  t2Text: "#ffffff",
};

const DARK_COLORS: typeof LIGHT_COLORS = {
  ink: "#f8fafc",
  red: "#fb7185",
  redSoft: "#3b1822",
  muted: "#94a3b8",
  line: "#475569",
  background: "#08111f",
  card: "#111c2e",
  amber: "#fbbf24",
  amberSoft: "#3b2e16",
  empty: "#1e293b",
  off: "#e2e8f0",
  offText: "#0f172a",
  offBorder: "#f8fafc",
  leave: "#1e3a5f",
  leaveText: "#bfdbfe",
  t2: "#2563eb",
  t2Text: "#ffffff",
};

export function scheduleImagePages(people: SchedulePerson[]): SchedulePerson[][] {
  const pages: SchedulePerson[][] = [];
  for (let start = 0; start < people.length; start += SCHEDULE_IMAGE_ROWS) {
    pages.push(people.slice(start, start + SCHEDULE_IMAGE_ROWS));
  }
  return pages;
}

function drawPage(input: ScheduleImageInput, page: number, pageCount: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SCHEDULE_IMAGE_WIDTH;
  canvas.height = SCHEDULE_IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível gerar a imagem neste navegador.");
  const colors = input.theme === "dark" ? DARK_COLORS : LIGHT_COLORS;

  function box(x: number, y: number, width: number, height: number, color: string, radius = 0) {
    ctx!.fillStyle = color;
    ctx!.beginPath();
    ctx!.roundRect(x, y, width, height, radius);
    ctx!.fill();
  }
  function text(
    value: string,
    x: number,
    y: number,
    size = 16,
    color = colors.ink,
    weight = 400,
    align: CanvasTextAlign = "left",
    maxWidth?: number,
  ) {
    ctx!.font = `${weight} ${size}px Arial, sans-serif`;
    ctx!.fillStyle = color;
    ctx!.textAlign = align;
    ctx!.textBaseline = "middle";
    ctx!.fillText(value, x, y, maxWidth);
  }
  function line(x1: number, y1: number, x2: number, y2: number, color = colors.line) {
    ctx!.beginPath();
    ctx!.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    ctx!.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    ctx!.strokeStyle = color;
    ctx!.lineWidth = 1;
    ctx!.stroke();
  }
  function strokeBox(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    radius = 0,
  ) {
    ctx!.beginPath();
    ctx!.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, radius);
    ctx!.strokeStyle = color;
    ctx!.lineWidth = 2;
    ctx!.stroke();
  }
  function fitted(
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    color = colors.ink,
    weight = 400,
  ) {
    ctx!.font = `${weight} ${size}px Arial, sans-serif`;
    let visible = value;
    while (visible.length > 0 && ctx!.measureText(visible).width > width)
      visible = visible.slice(0, -1);
    text(visible === value ? value : `${visible.slice(0, -1)}…`, x, y, size, color, weight);
  }

  const dates = scheduleMonthDates(input.month);
  const totals = scheduleDayTotals(input.people, dates);
  const month = new Date(`${input.month.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const marked = new Set(input.notes.map((note) => note.note_date));
  const left = 48;
  const nameWidth = 308;
  const tableWidth = SCHEDULE_IMAGE_WIDTH - left * 2;
  const dayWidth = (tableWidth - nameWidth) / dates.length;
  const tableTop = 218;
  const headerHeight = 64;
  const rowHeight = Math.min(100, Math.floor(612 / input.people.length));
  const rowsTop = tableTop + headerHeight;
  const totalsTop = rowsTop + rowHeight * input.people.length;

  box(0, 0, canvas.width, canvas.height, colors.background);
  box(left, 36, 8, 126, colors.red, 4);
  text("TechNET", left + 24, 57, 23, colors.red, 800);
  text("Escala comparativa", left + 24, 104, 38, colors.ink, 800);
  fitted(`${input.city} · ${input.sector} · ${month}`, left + 24, 148, 1450, 22, colors.muted);
  text(
    `${input.people.length} colaboradores nesta imagem`,
    canvas.width - left,
    80,
    17,
    colors.muted,
    400,
    "right",
  );
  text(
    `Página ${page + 1} de ${pageCount}`,
    canvas.width - left,
    111,
    17,
    colors.ink,
    700,
    "right",
  );

  box(
    left,
    tableTop,
    tableWidth,
    headerHeight + input.people.length * rowHeight + 70,
    colors.card,
    16,
  );
  text("COLABORADOR / FUNÇÃO", left + 16, tableTop + 32, 15, colors.ink, 700);
  dates.forEach((date, index) => {
    const x = left + nameWidth + index * dayWidth;
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (weekday === 0) box(x + 2, tableTop + 6, dayWidth - 4, headerHeight - 12, colors.redSoft, 8);
    const color = weekday === 0 ? colors.red : colors.muted;
    text(
      ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][weekday]!,
      x + dayWidth / 2,
      tableTop + 21,
      13,
      color,
      400,
      "center",
    );
    text(
      `${Number(date.slice(-2))}${marked.has(date) ? " •" : ""}`,
      x + dayWidth / 2,
      tableTop + 44,
      18,
      color,
      700,
      "center",
    );
  });

  input.people.forEach((person, row) => {
    const y = rowsTop + row * rowHeight;
    box(left, y, tableWidth, 1, colors.line);
    // Wrap long names onto two lines without hiding the selected person's identity.
    ctx.font = "700 15px Arial, sans-serif";
    const words = person.name.split(" ");
    let first = "";
    while (words.length && ctx.measureText(`${first} ${words[0]}`.trim()).width <= nameWidth - 32) {
      first = `${first} ${words.shift()}`.trim();
    }
    if (!first) first = words.shift() ?? "";
    const second = words.join(" ");
    const center = y + rowHeight / 2;
    text(first, left + 16, center - (second ? 14 : 8), 15, colors.ink, 700, "left", nameWidth - 32);
    if (second) text(second, left + 16, center + 2, 15, colors.ink, 700, "left", nameWidth - 32);
    fitted(
      person.jobTitle || "Função não informada",
      left + 16,
      center + (second ? 18 : 13),
      nameWidth - 32,
      11,
      colors.muted,
    );

    dates.forEach((date, index) => {
      const x = left + nameWidth + index * dayWidth;
      const code = person.assignments[date]?.trim() ?? "";
      const kind = code ? scheduleCodeKind(code) : null;
      const label = compactScheduleCode(code);
      let background = colors.empty;
      let foreground = colors.muted;
      if (kind === "work") {
        background = colors.redSoft;
        foreground = colors.red;
      }
      if (kind === "off") {
        background = colors.off;
        foreground = colors.offText;
      }
      if (kind === "vacation") {
        background = colors.amberSoft;
        foreground = colors.amber;
      }
      if (kind === "leave") {
        background = colors.leave;
        foreground = colors.leaveText;
      }
      if (label === "T2") {
        background = colors.t2;
        foreground = colors.t2Text;
      }
      box(x + 2, y + 5, dayWidth - 4, rowHeight - 10, background, 9);
      if (kind === "off")
        strokeBox(x + 2, y + 5, dayWidth - 4, rowHeight - 10, colors.offBorder, 9);
      text(label, x + dayWidth / 2, center, 15, foreground, 700, "center", dayWidth - 10);
    });
  });
  box(left, totalsTop, tableWidth, 1, colors.line);
  text("Em escala", left + 16, totalsTop + 23, 15, colors.red, 700);
  text("De folga", left + 16, totalsTop + 49, 15, colors.off, 700);
  totals.forEach((total, index) => {
    const x = left + nameWidth + (index + 0.5) * dayWidth;
    text(String(total.work), x, totalsTop + 23, 15, colors.red, 700, "center");
    text(String(total.off), x, totalsTop + 49, 15, colors.off, 700, "center");
  });

  const tableBottom = totalsTop + 70;
  line(left + nameWidth, tableTop, left + nameWidth, tableBottom);
  for (let index = 1; index < dates.length; index += 1) {
    const x = left + nameWidth + index * dayWidth;
    line(x, tableTop, x, tableBottom);
  }
  line(left, rowsTop, left + tableWidth, rowsTop);
  for (let row = 1; row <= input.people.length; row += 1) {
    const y = rowsTop + row * rowHeight;
    line(left, y, left + tableWidth, y);
  }
  line(left, totalsTop + 35, left + tableWidth, totalsTop + 35);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, tableTop + 0.5, tableWidth - 1, tableBottom - tableTop - 1);

  const legendY = totalsTop + 95;
  let legendX = left;
  const legendPart = (value: string, color: string, weight = 400) => {
    text(value, legendX, legendY, 16, color, weight);
    legendX += ctx.measureText(value).width + 30;
  };
  legendPart("T1 · Turno 1", colors.red, 700);
  legendPart("T2 · Turno 2", colors.t2, 700);
  legendPart("F · Folga", colors.off, 800);
  legendPart("Fé · Férias", colors.amber, 700);
  legendPart("L · Licença / afastamento", colors.leaveText, 700);
  legendPart("— · Sem marcação", colors.muted);
  if (marked.size)
    text(
      "• Data com observação da gestão. Consulte o texto no sistema.",
      left,
      legendY + 28,
      14,
      colors.muted,
    );
  text("Totais referentes aos colaboradores desta imagem.", left, 1038, 14, colors.muted);
  text("TechNET · Escalas", canvas.width - left, 1038, 16, colors.ink, 700, "right");
  return canvas;
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar o PNG."))),
      "image/png",
    ),
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadScheduleImage(input: ScheduleImageInput): Promise<number> {
  const pages = scheduleImagePages(input.people);
  if (!pages.length) throw new Error("Selecione pelo menos uma pessoa.");
  const slug = `${input.city}-${input.sector}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const filename = `escala-${slug}-${input.month.slice(0, 7)}`;
  if (pages.length === 1) {
    download(await pngBlob(drawPage(input, 0, 1)), `${filename}.png`);
    return 1;
  }

  const files: Record<string, Uint8Array> = {};
  for (let page = 0; page < pages.length; page += 1) {
    const canvas = drawPage({ ...input, people: pages[page]! }, page, pages.length);
    const blob = await pngBlob(canvas);
    files[`${filename}-${String(page + 1).padStart(2, "0")}.png`] = new Uint8Array(
      await blob.arrayBuffer(),
    );
    canvas.width = 0;
    canvas.height = 0;
  }
  const { zipSync } = await import("fflate");
  const zipped = zipSync(files, { level: 0 });
  download(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), `${filename}.zip`);
  return pages.length;
}
