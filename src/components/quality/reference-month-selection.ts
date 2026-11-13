/** Empty engine selections mean all months. The UI always keeps at least one month. */
export function referenceMonthSelection(
  available: readonly string[],
  selected: readonly string[],
  value: string,
  checked: boolean,
): string[] {
  const months = [...new Set(available)].filter(Boolean).sort();
  if (value === "*") return checked ? months : months.slice(-1);
  const active = selected.length ? months.filter((month) => selected.includes(month)) : months;
  if (!months.includes(value)) return active;
  const next = checked
    ? months.filter((month) => active.includes(month) || month === value)
    : active.filter((month) => month !== value);
  return next.length ? next : active;
}
