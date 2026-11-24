import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { VT_CITIES } from "@/lib/vt-revisitas";
import type { VtChartModel, VtChartScope } from "@/lib/vt-revisitas-charts";
import { VtRevisitasReport } from "./VtRevisitasReport";

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(Error("Falha ao converter a imagem."));
    }, "image/png"),
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadVtRevisitas(
  model: VtChartModel,
  scope: VtChartScope,
  format: "png" | "pdf",
) {
  if (!model.total) return;
  const { toCanvas } = await import("html-to-image");
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  Object.assign(sandbox.style, {
    position: "fixed",
    left: "-1400px",
    top: "0",
    width: "max-content",
    pointerEvents: "none",
  });
  document.body.append(sandbox);
  const root = createRoot(sandbox);
  const slug = [scope.city, scope.month, scope.technician]
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 100);
  const filename = `technet-revisitas-${slug}.${format}`;

  try {
    flushSync(() => root.render(createElement(VtRevisitasReport, { model, scope })));
    await Promise.all(Array.from(sandbox.querySelectorAll("img")).map((img) => img.decode()));
    const pages = Array.from(sandbox.querySelectorAll<HTMLElement>("[data-vt-report-page]"));
    if (!pages.length) throw Error("Relatório vazio.");
    const render = (page: HTMLElement, pixelRatio: number) =>
      toCanvas(page, { pixelRatio, skipFonts: true, backgroundColor: "#ffffff" });

    if (format === "pdf") {
      const { PDFDocument, PageSizes } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.setTitle(`Revisitas VT - ${VT_CITIES[scope.city]} - ${scope.month}`);
      pdf.setAuthor("TechNET");
      const [pageHeight, pageWidth] = PageSizes.A4;
      for (const section of pages) {
        const image = await render(section, 2);
        const png = await pdf.embedPng(await (await canvasBlob(image)).arrayBuffer());
        const page = pdf.addPage([pageWidth, pageHeight]);
        const sized = png.scaleToFit(pageWidth - 28, pageHeight - 28);
        page.drawImage(png, {
          ...sized,
          x: (pageWidth - sized.width) / 2,
          y: pageHeight - 14 - sized.height,
        });
      }
      const bytes = Uint8Array.from(await pdf.save());
      download(new Blob([bytes], { type: "application/pdf" }), filename);
      return;
    }

    const gap = 12;
    const totalHeight =
      pages.reduce((sum, page) => sum + Math.ceil(page.getBoundingClientRect().height), 0) +
      (pages.length - 1) * gap;
    const ratio = Math.min(2, 7800 / totalHeight);
    if (ratio < 1) {
      const error = Error(
        "O relatório ficou longo para uma imagem. Use Exportar PDF para incluir todos os técnicos.",
      );
      error.name = "VtReportError";
      throw error;
    }
    const output = document.createElement("canvas");
    output.width = Math.round(pages[0]!.getBoundingClientRect().width * ratio);
    output.height = Math.ceil(totalHeight * ratio);
    const context = output.getContext("2d");
    if (!context) throw Error("Imagem indisponível neste navegador.");
    context.fillStyle = "#edf1f5";
    context.fillRect(0, 0, output.width, output.height);
    let y = 0;
    for (const section of pages) {
      const image = await render(section, ratio);
      context.drawImage(image, 0, y, output.width, image.height);
      y += image.height + Math.floor(gap * ratio);
    }
    download(await canvasBlob(output), filename);
  } finally {
    root.unmount();
    sandbox.remove();
  }
}
