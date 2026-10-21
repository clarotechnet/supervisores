import { SCHEDULE_KIND_STYLE, SCHEDULE_T2_STYLE } from "./schedule-view";
import { cn } from "./utils";

export type PdfRgb = [number, number, number];
export interface SchedulePdfBadge {
  background: PdfRgb;
  foreground: PdfRgb;
  border: PdfRgb;
}
export interface SchedulePdfPalette {
  background: PdfRgb;
  card: PdfRgb;
  ink: PdfRgb;
  muted: PdfRgb;
  line: PdfRgb;
  primary: PdfRgb;
  secondary: PdfRgb;
  badges: Record<keyof typeof SCHEDULE_KIND_STYLE | "t2" | "empty", SchedulePdfBadge>;
}

// Resolve the page's actual CSS (including OKLCH, dark variants and alpha)
// into sRGB. This tiny color sample is NOT a screenshot of the PDF content.
export function captureSchedulePdfPalette(scope: HTMLElement): SchedulePdfPalette {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw Error("Não foi possível ler as cores do tema.");
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:-10000px;visibility:hidden;pointer-events:none";
  scope.append(probe);
  const resolve = (color: string, under: PdfRgb = [1, 1, 1]): PdfRgb => {
    ctx.fillStyle = `rgb(${under.map((channel) => channel * 255).join(",")})`;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0]! / 255, data[1]! / 255, data[2]! / 255];
  };
  const sample = (classes: string) => {
    probe.className = classes;
    return getComputedStyle(probe);
  };
  try {
    const background = resolve(sample("bg-background").backgroundColor);
    const card = resolve(sample("bg-card").backgroundColor, background);
    const ink = resolve(sample("text-foreground").color, card);
    const muted = resolve(sample("text-muted-foreground").color, card);
    const line = resolve(sample("border-border").borderColor, card);
    const primary = resolve(sample("text-primary").color, card);
    const secondary = resolve(sample("bg-secondary").backgroundColor, card);
    const badge = (classes: string): SchedulePdfBadge => {
      const style = sample(classes);
      const background = resolve(style.backgroundColor, card);
      return {
        background,
        foreground: resolve(style.color, background),
        border: resolve(style.borderColor, background),
      };
    };
    const badges = Object.fromEntries(
      Object.entries(SCHEDULE_KIND_STYLE).map(([kind, classes]) => [kind, badge(classes)]),
    ) as SchedulePdfPalette["badges"];
    badges.t2 = badge(cn(SCHEDULE_KIND_STYLE.work, SCHEDULE_T2_STYLE));
    badges.empty = badge("border-transparent bg-secondary/30 text-muted-foreground");
    return { background, card, ink, muted, line, primary, secondary, badges };
  } finally {
    probe.remove();
  }
}
