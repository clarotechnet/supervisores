import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { createSchedulePdf, type SchedulePdfInput } from "../src/lib/schedule-pdf";
import type { SchedulePdfPalette } from "../src/lib/schedule-pdf-theme";
const badge = { background: [1, 1, 1], foreground: [0, 0, 0], border: [0.8, 0.8, 0.8] };
const palette = {
  background: [1, 1, 1],
  card: [1, 1, 1],
  ink: [0, 0, 0],
  muted: [0.4, 0.4, 0.4],
  line: [0.8, 0.8, 0.8],
  primary: [0.9, 0.1, 0.1],
  secondary: [0.9, 0.9, 0.9],
  badges: Object.fromEntries(
    ["work", "off", "vacation", "leave", "absence", "certificate", "t2", "empty"].map((kind) => [
      kind,
      badge,
    ]),
  ),
} as SchedulePdfPalette;
const fonts = {
  regular: readFileSync(new URL("../src/assets/pdf/NotoSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../src/assets/pdf/NotoSans-Bold.ttf", import.meta.url)),
};
const input: SchedulePdfInput = {
  people: [
    {
      name: "João da Conceição",
      login: "QA001",
      jobTitle: "Supervisão",
      assignments: { "2026-11-01": "T. 1", "2026-11-30": "F" },
    },
  ],
  month: "2026-11-01",
  city: "Natal",
  sector: "Adesão-Serviço",
  notes: [],
  palette,
};
describe("PDF vetorial de escalas", () => {
  it("cria A3 paisagem com fontes incorporadas e sem imagens rasterizadas", async () => {
    const before = structuredClone(input);
    const { bytes, pageCount } = await createSchedulePdf(input, fonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pageCount).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(1190.55, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
    expect(pdf.getAuthor()).toBe("TechNet");
    expect(page.node.Resources()?.has(PDFName.of("Font"))).toBe(true);
    expect(page.node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "<<>>").toBe(
      "<<\n>>",
    );
    expect(input).toEqual(before);
  }, 15000);
  it("pagina todas as pessoas e observações extensas em um único PDF", async () => {
    const people = Array.from({ length: 43 }, (_, index) => ({
      ...input.people[0]!,
      name: `QA ${index} João da Conceição`,
      login: `QA${index}`,
    }));
    const note = {
      id: "note",
      schedule_upload_id: "upload",
      note_date: "2026-11-01",
      body: "Observação de teste. ".repeat(2000),
      author_id: "qa",
      author_name: "QA",
      created_at: "2026-10-21",
      updated_at: "2026-10-21",
    };
    const { bytes, pageCount } = await createSchedulePdf(
      { ...input, people, notes: [note] },
      fonts,
    );
    expect(pageCount).toBeGreaterThan(4);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages()).toHaveLength(pageCount);
    expect(pdf.getPages().every((page) => page.getWidth() > page.getHeight())).toBe(true);
  }, 15000);
  it("não cria PDFs vazios, meses inválidos ou caracteres ausentes na fonte", async () => {
    await expect(createSchedulePdf({ ...input, people: [] }, fonts)).rejects.toThrow(
      "Selecione pelo menos",
    );
    await expect(createSchedulePdf({ ...input, month: "2026-13-01" }, fonts)).rejects.toThrow(
      "mês válido",
    );
    await expect(
      createSchedulePdf({ ...input, people: [{ ...input.people[0]!, name: "QA 🦄" }] }, fonts),
    ).rejects.toThrow("caractere não suportado");
  }, 15000);
});
