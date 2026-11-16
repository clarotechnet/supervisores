/** The optional label is copied from the Folga fixa column, never inferred on import. */
const normal = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ");
const days: Record<string, number> = {
  SEG: 1,
  SEGUNDA: 1,
  TER: 2,
  TERCA: 2,
  QUA: 3,
  QUARTA: 3,
  QUI: 4,
  QUINTA: 4,
  SEX: 5,
  SEXTA: 5,
  SAB: 6,
  SABADO: 6,
};
export function fixedRestDeclaration(person: { fixedRest?: string }) {
  const declared = person.fixedRest !== undefined;
  const label = person.fixedRest?.trim() || "";
  const key = normal(label).replace(/[ -]+FEIRA$/, "");
  return { declared, label, day: days[key] ?? null };
}
export function fixedRestColumn(header: unknown[]) {
  const columns = header.flatMap((value, index) =>
    typeof value === "string" && normal(value) === "FOLGA FIXA" ? [index] : [],
  );
  if (columns.length > 1)
    throw Error("Cabeçalho Folga fixa duplicado; confira a coluna de referência.");
  return columns[0] ?? -1;
}
export function readFixedRest(row: unknown[], column: number): { fixedRest?: string } {
  if (column < 0) return {};
  const value = row[column];
  if (value != null && typeof value !== "string")
    throw Error("Folga fixa deve conter o nome do dia da semana.");
  const fixedRest = typeof value === "string" ? value.trim() : "";
  if (fixedRest.length > 80 || /[<>\p{Cc}]/u.test(fixedRest) || fixedRest.startsWith("="))
    throw Error("Valor inválido na coluna Folga fixa.");
  return { fixedRest };
}
