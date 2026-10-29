import { describe, it, expect } from "vitest";
import {
  buildAssistedGeneration,
  applyGenerationChoice,
} from "../src/lib/schedule-assisted-generation";
import { scheduleMonthDates } from "../src/lib/schedule-view";
import {
  validateGenerationChoice,
  rankedGenerationOptions,
} from "../supabase/functions/_shared/schedule-ai-generation";
import type { ScheduleGenerationSource } from "../src/services/schedule-generation-source";
function source(): ScheduleGenerationSource {
  const dates = scheduleMonthDates("2027-01");
  return {
    id: "official-id",
    operationalSourceId: "official-id",
    city: "fortaleza",
    sector: "manutencao",
    schedule_month: "2027-01-01",
    source_file: "Escala operacional sincronizada",
    source_sheet: "OFICIAL",
    employee_count: 21,
    entry_count: 651,
    imported_by: null,
    imported_at: "",
    updated_at: "2027-01-31",
    payload: {
      dates,
      codes: ["M. 1", "Folga"],
      people: Array.from({ length: 21 }, (_, i) => ({
        name: "PRIVATE NAME " + i,
        login: "SECRET LOGIN " + i,
        jobTitle: "PRIVATE ROLE",
        assignments: Object.fromEntries(
          dates.map((d) => [
            d,
            [0, 3].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "Folga" : "M. 1",
          ]),
        ),
      })),
    },
  };
}
describe("composição IA de prévias", () => {
  it("gera propostas distintas com folgas iguais e envia somente contagens e ids anônimos", () => {
    const s = source(),
      original = structuredClone(s),
      options = buildAssistedGeneration(s, "2027-02");
    expect(options.input.options).toHaveLength(3);
    expect(() => validateGenerationChoice(options.input)).not.toThrow();
    expect(
      new Set(options.input.options.map((o) => JSON.stringify(o.events))).size,
    ).toBeGreaterThan(1);
    for (const p of Object.values(options.previews)) {
      expect(p.blockingIssues).toEqual([]);
      expect(p.fixedRestEvidence?.every((e) => e.day === 3)).toBe(true);
    }
    const external = JSON.stringify(options.input);
    for (const secret of ["PRIVATE NAME", "SECRET LOGIN", "PRIVATE ROLE", "AT", "M. 1"])
      expect(external).not.toContain(secret);
    expect(s).toEqual(original);
  });
  it("aplica a opção escolhida apenas na prévia e registra sua origem", () => {
    const s = source(),
      options = buildAssistedGeneration(s, "2027-02"),
      chosen =
        rankedGenerationOptions(options.input)[1] || rankedGenerationOptions(options.input)[0]!;
    const result = applyGenerationChoice(options, s, {
      ok: true,
      source: "generation",
      mode: "ai",
      selectedOption: chosen.id,
      summary: "Rodízio equilibrado",
      note: "",
      writeActions: 0,
    });
    expect(result.payload).toEqual(options.previews[chosen.id]!.payload);
    expect(result.generationDecision).toMatchObject({
      mode: "ai",
      sourceId: "official-id",
      sourceUpdatedAt: "2027-01-31",
      selectedOption: chosen.id,
    });
    expect(() =>
      applyGenerationChoice(options, s, {
        ok: true,
        source: "generation",
        mode: "ai",
        selectedOption: "invented",
        summary: "",
        note: "",
        writeActions: 0,
      }),
    ).toThrow();
  });
  it("mantém o funcionamento pelas regras quando não há escolha remota", () => {
    const s = source(),
      options = buildAssistedGeneration(s, "2027-02");
    const p = applyGenerationChoice(options, s);
    expect(p.generationDecision?.mode).toBe("rules");
    expect(p.blockingIssues).toEqual([]);
  });
});
