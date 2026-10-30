/** Server-side locks from the saved revision, never supplied by an edit request. */
const nameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
export function inheritedDatesByName(snapshot: unknown): Record<string, string[]> {
  const rows = (snapshot as { inheritedAssignments?: unknown } | null)?.inheritedAssignments;
  if (rows == null) return {};
  if (!Array.isArray(rows) || rows.length > 500)
    throw Error("Snapshot de continuidade inválido. Confira a revisão antes de editar.");
  return Object.fromEntries(
    rows.map((p) => {
      if (
        !p ||
        typeof p.name !== "string" ||
        !p.assignments ||
        typeof p.assignments !== "object" ||
        Array.isArray(p.assignments)
      )
        throw Error("Snapshot de continuidade inválido. Confira a revisão antes de editar.");
      const days = Object.entries(p.assignments)
        .filter(([, code]) => typeof code === "string" && code.trim())
        .map(([day]) => day);
      if (days.length > 45 || days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d)))
        throw Error("Datas herdadas inválidas.");
      return [nameKey(p.name), days];
    }),
  );
}
export function isSnapshotInheritedDate(snapshot: unknown, name: string, date: string) {
  return !!inheritedDatesByName(snapshot)[nameKey(name)]?.includes(date);
}
