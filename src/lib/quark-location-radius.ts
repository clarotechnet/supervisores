/** The editable radius is in km; all location calculations continue to use meters. */
export function parseQuarkRadiusKm(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  const meters = Number(text.replace(",", ".")) * 1000;
  return Number.isFinite(meters) && meters > 0 ? meters : null;
}

export function formatQuarkRadiusKm(meters: number): string {
  return String(meters / 1000).replace(".", ",");
}
