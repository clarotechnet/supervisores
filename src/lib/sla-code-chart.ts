// Display eligibility for the detailed offender-code chart only.
// Never use this to filter imported rows, attendance groups or SLA totals.
export function isSlaOffenderChartCode(value: unknown): boolean {
  const code = String(value ?? "").trim();
  return /^\d+$/.test(code) && Number(code) >= 100;
}
