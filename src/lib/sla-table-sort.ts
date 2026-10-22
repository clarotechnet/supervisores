import { parseDate } from "./sla-math";

export type SlaSortDirection = "ascending" | "descending";
export type SlaSortType = "text" | "number" | "date";
export interface SlaSortColumn<T> {
  type: SlaSortType;
  value: (row: T) => unknown;
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
function sortValue(value: unknown, type: SlaSortType): string | number | null {
  if (value == null || value === "") return null;
  if (type === "date") return parseDate(value)?.getTime() ?? null;
  if (type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  return text || null;
}

// Sort a display copy, never the arrays used by aggregation, charts or grouping.
export function sortSlaRows<T>(
  rows: readonly T[],
  column: SlaSortColumn<T>,
  direction: SlaSortDirection,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: sortValue(column.value(row), column.type) }))
    .sort((a, b) => {
      // Unknown values stay last in either direction; equal values stay stable.
      if (a.value === null) return b.value === null ? a.index - b.index : 1;
      if (b.value === null) return -1;
      const order =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return (direction === "ascending" ? order : -order) || a.index - b.index;
    })
    .map(({ row }) => row);
}

export function createSlaTableSort<T>(
  document: Document,
  bodyId: string,
  columns: readonly SlaSortColumn<T>[],
  onChange: () => void,
) {
  let selected = -1;
  let direction: SlaSortDirection = "ascending";
  const nextDirection = (index: number): SlaSortDirection =>
    selected === index
      ? direction === "ascending"
        ? "descending"
        : "ascending"
      : columns[index]?.type === "text"
        ? "ascending"
        : "descending";
  const syncHeaders = () => {
    const headers = document.getElementById(bodyId)?.closest("table")?.querySelectorAll("thead th");
    headers?.forEach((header, index) => {
      const column = columns[index];
      if (!column) return;
      let button = header.querySelector<HTMLButtonElement>(".sla-sort-header");
      if (!button) {
        const label = document.createElement("span");
        label.textContent = header.textContent;
        const arrow = document.createElement("span");
        arrow.className = "sla-sort-arrow";
        arrow.setAttribute("aria-hidden", "true");
        button = document.createElement("button");
        button.type = "button";
        button.className = "sla-sort-header";
        button.dataset["slaSort"] = bodyId;
        button.dataset["column"] = String(index);
        button.append(label, arrow);
        header.replaceChildren(button);
      }
      const active = selected === index;
      header.setAttribute("aria-sort", active ? direction : "none");
      button.querySelector(".sla-sort-arrow")!.textContent = active
        ? direction === "ascending"
          ? "↑"
          : "↓"
        : "↕";
      const ascending = nextDirection(index) === "ascending";
      const order =
        column.type === "text"
          ? ascending
            ? "A a Z"
            : "Z a A"
          : column.type === "date"
            ? ascending
              ? "mais antiga para mais recente"
              : "mais recente para mais antiga"
            : ascending
              ? "menor para maior"
              : "maior para menor";
      const title = `Ordenar por ${button.firstElementChild!.textContent}: ${order}`;
      button.title = title;
      button.setAttribute("aria-label", title);
    });
  };
  // referenceScope owns and disposes this delegated listener on unmount.
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".sla-sort-header");
    if (button?.dataset["slaSort"] !== bodyId) return;
    const index = Number(button.dataset["column"]);
    if (!Number.isInteger(index) || !columns[index]) return;
    direction = nextDirection(index);
    selected = index;
    syncHeaders();
    onChange();
  });
  syncHeaders();
  return {
    syncHeaders,
    rows: (rows: readonly T[]) => {
      const column = columns[selected];
      return column ? sortSlaRows(rows, column, direction) : [...rows];
    },
  };
}
