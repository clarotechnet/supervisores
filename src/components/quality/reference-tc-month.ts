// Months are DATA_NOTA competencies, not calendar-month slices of FIM_TRABALHO.
// An explicit selection must never fall back to a different month when empty.
export function referenceTCMonth(
  available: readonly string[],
  selected: readonly string[],
): string {
  return [...(selected.length ? selected : available)].sort().at(-1) ?? "";
}
