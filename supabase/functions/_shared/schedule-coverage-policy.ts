/** Operational policy confirmed by management, scoped to one city/front from Dec/2026. */
export const NATAL_ADESAO_COVERAGE = {
  sundayDutyCount: 3,
  holidayDutyCount: 3,
  lastSundayDutyCount: 10,
  exactCoverage: true,
} as const;

export function scheduleCoveragePolicy<
  T extends {
    sundayDutyCount?: number | null;
    holidayDutyCount?: number | null;
    dateDutyOverrides?: Readonly<Record<string, number>>;
  },
>(rule: T, city: string, sector: string, month: string): T {
  if (city !== "natal" || sector !== "adesao-servico" || month.slice(0, 7) < "2026-12") return rule;
  const [year, number] = month.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year!, number!, 0, 12));
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  return {
    ...rule,
    ...NATAL_ADESAO_COVERAGE,
    dateDutyOverrides: { ...rule.dateDutyOverrides, [last.toISOString().slice(0, 10)]: 10 },
  };
}
