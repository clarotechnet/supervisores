import regularUrl from "@/assets/pdf/NotoSans-Regular.ttf?url";
import boldUrl from "@/assets/pdf/NotoSans-Bold.ttf?url";
import { createSchedulePdf, type SchedulePdfFonts, type SchedulePdfInput } from "./schedule-pdf";

let fonts: Promise<SchedulePdfFonts> | null = null;
function loadFonts() {
  if (!fonts)
    fonts = Promise.all(
      [regularUrl, boldUrl].map(async (url) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok)
          throw Error("Não foi possível carregar as fontes do PDF. Tente novamente.");
        return new Uint8Array(await response.arrayBuffer());
      }),
    )
      .then(([regular, bold]) => ({ regular: regular!, bold: bold! }))
      .catch((error) => {
        fonts = null;
        throw error;
      });
  return fonts;
}
export async function downloadSchedulePdf(input: SchedulePdfInput) {
  const result = await createSchedulePdf(input, await loadFonts());
  const slug = `${input.city}-${input.sector}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `escala-${slug}-${input.month.slice(0, 7)}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return result.pageCount;
}
