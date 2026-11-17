import { describe, expect, it } from "vitest";
import {
  validatePublicationException,
  reviewSchedulePublication,
  savedPublicationIssues,
} from "../supabase/functions/_shared/schedule-publication-exception";
const valid = {
  reason: "Equipe de apoio confirmada para cobrir o plantão.",
  acknowledged: true,
  reviewToken: "a".repeat(64),
};
describe("aceitação de pendências na publicação", () => {
  it("exige motivo de 20 a 2000 caracteres, confirmação explícita e revisão atual", () => {
    for (const value of [
      null,
      [],
      {},
      { ...valid, reason: "curta" },
      { ...valid, reason: "x".repeat(2001) },
      { ...valid, acknowledged: 1 },
      { ...valid, reviewToken: "old" },
      { ...valid, reason: "Motivo com controle inválido\u0001" },
    ])
      expect(() => validatePublicationException(value)).toThrow();
    expect(
      validatePublicationException({
        ...valid,
        reason: "  " + valid.reason + "  ",
        issues: ["forged"],
      }),
    ).toEqual(valid);
  });
  it("mantém os avisos originais ao preparar pendências persistidas", () => {
    const warnings = [
      { level: "warning", message: "aviso" },
      { level: "blocking", message: "Plantão: mínimo 3, atual 2" },
    ];
    const before = JSON.stringify(warnings);
    expect(savedPublicationIssues(warnings)).toHaveLength(1);
    expect(savedPublicationIssues(warnings)[0]?.detail).toContain("mínimo 3");
    expect(JSON.stringify(warnings)).toBe(before);
  });
  it("vincula a confirmação também a marcas sem efeito na quantidade de problemas", async () => {
    const payload = {
      dates: Array.from({ length: 7 }, (_, i) => "2027-01-" + String(i + 3).padStart(2, "0")),
      codes: ["Folga"],
      people: [{ name: "TESTE", jobTitle: "TÉCNICO", assignments: { "2027-01-03": "Folga" } }],
    };
    const input = {
      sheetId: "sheet",
      sheetUpdatedAt: "2026-11-16",
      draftId: "draft",
      month: "2027-01",
      planned: payload,
      current: payload,
      policy: {},
      warnings: [{ level: "blocking", message: "Herdado da origem" }],
      rule: { sundayDutyCount: 3, holidayDutyCount: 3 },
    };
    const before = JSON.stringify(input);
    const a = await reviewSchedulePublication(input),
      b = await reviewSchedulePublication(structuredClone(input));
    expect(a.reviewToken).toBe(b.reviewToken);
    expect(a.issues.some((issue) => issue.source === "sheet")).toBe(true);
    const changed = structuredClone(input);
    changed.current.people[0]!.assignments["2027-01-03"] = "Férias";
    const c = await reviewSchedulePublication(changed);
    expect(c.reviewToken).not.toBe(a.reviewToken);
    expect(JSON.stringify(input)).toBe(before);
  });
});
