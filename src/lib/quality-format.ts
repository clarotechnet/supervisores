export const formatNumber = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n);
export const formatPercent = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${formatNumber(n * 100, 2)}%`;
export const monthLabel = (key: string) =>
  !/^\d{4}-\d{2}$/.test(key)
    ? "Sem competência"
    : new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "short",
        year: "numeric",
      });
