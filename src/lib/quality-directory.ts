import type { CertificationKind, QualityState } from "./quality";
import { norm, cityFromUnit, type QQRecord, type TCRecord } from "./quality-math";

export interface QualityLogin {
  login: string;
  full_name: string;
  city: string;
  sector: string;
  supervisor: string;
  updated_at?: string;
}
export const emptyQualityLogin = (): QualityLogin => ({
  login: "",
  full_name: "",
  city: "",
  sector: "",
  supervisor: "",
});
export function normalizeLogin(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
export function nameKey(value: unknown): string {
  return norm(value).replace(/\s+/g, " ");
}
export function validQualityName(value: unknown, login: string): string {
  const name = String(value ?? "").trim(),
    key = nameKey(name);
  return name &&
    normalizeLogin(name) !== normalizeLogin(login) &&
    ![
      "NOME NAO LOCALIZADO",
      "SEM NOME",
      "NAO INFORMADO",
      "(SEM LOGIN)",
      "N/A",
      "-",
      "-1",
      "-3",
    ].includes(key)
    ? name
    : "";
}
function cellText(value: unknown): string {
  if (value && typeof value === "object") {
    if ("result" in value) return cellText(value.result);
    if ("richText" in value && Array.isArray(value.richText))
      return value.richText.map(cellText).join("");
    if ("text" in value) return cellText(value.text);
  }
  return String(value ?? "").trim();
}
export function parseDirectoryMatrix(rows: unknown[][]): QualityLogin[] {
  const headerIndex = rows
    .slice(0, 25)
    .findIndex((row) =>
      row.some((c) => /^(NOME|COLABORADOR|TECNICO|NOME COMPLETO)$/.test(nameKey(cellText(c)))),
    );
  if (headerIndex < 0)
    throw Error("A planilha precisa de Nome, Técnico ou Colaborador no cabeçalho.");
  const headers = (rows[headerIndex] ?? []).map((c) => nameKey(cellText(c)));
  const index = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const cols = {
    login: index(/^(LOGIN|LOGIN_TEC|LOGIN_TECNICO)$/),
    full_name: index(/^(NOME|COLABORADOR|TECNICO|NOME COMPLETO)$/),
    city: index(/^(CIDADE|MUNICIPIO)$/),
    sector: index(/^SETOR$/),
    supervisor: index(/^SUPERVISOR$/),
  };
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const entry = emptyQualityLogin();
    for (const key of Object.keys(cols) as Array<keyof typeof cols>)
      entry[key] = cols[key] >= 0 ? cellText(row[cols[key]]) : "";
    entry.login = normalizeLogin(entry.login);
    return entry.full_name || entry.login ? [entry] : [];
  });
}
export async function readDirectoryWorkbook(file: File): Promise<QualityLogin[]> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 32 * 1024 * 1024)
    throw Error("Selecione um XLSX de até 32 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const entries: QualityLogin[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: unknown[][] = [];
    for (let i = 1; i <= sheet.actualRowCount; i++) {
      const row: unknown[] = [];
      for (let c = 1; c <= Math.min(sheet.actualColumnCount, 30); c++)
        row.push(sheet.getRow(i).getCell(c).value);
      rows.push(row);
    }
    try {
      entries.push(...parseDirectoryMatrix(rows));
    } catch {
      /* Skip unrelated sheets. */
    }
  }
  if (!entries.length) throw Error("Nenhuma aba com cadastro de técnicos foi encontrada.");
  if (entries.length > 10000) throw Error("O cadastro excede 10 mil linhas.");
  return entries;
}

export function associateDirectory(inputs: QualityLogin[], current: QualityLogin[]) {
  const byName = new Map<string, QualityLogin[]>();
  for (const row of inputs) {
    const key = nameKey(row.full_name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  const existing = new Map(current.map((r) => [normalizeLogin(r.login), r]));
  const output = new Map<string, QualityLogin>(),
    warnings: string[] = [];
  const usedNames = new Set<string>();
  const namedAssignments = new Set(inputs.filter((r) => !r.login).map((r) => nameKey(r.full_name)));
  const targets = [
    ...current.filter((r) => namedAssignments.has(nameKey(r.full_name))),
    ...inputs.filter((r) => r.login),
  ];
  for (const row of targets) {
    const login = normalizeLogin(row.login);
    if (!/^[^\s]{1,100}$/.test(login)) throw Error(`Login inválido: ${login}`);
    const previous = output.get(login);
    if (previous && nameKey(previous.full_name) !== nameKey(row.full_name))
      throw Error(`O login ${login} tem nomes diferentes. Corrija a planilha antes de importar.`);
    const entry = { ...(existing.get(login) ?? emptyQualityLogin()), login };
    for (const field of ["full_name", "city", "sector", "supervisor"] as const)
      if (row[field]) entry[field] = row[field];
    const key = nameKey(row.full_name),
      matches = (byName.get(key) ?? []).filter((r) => !r.login || r.login === login);
    let conflict = false;
    for (const field of ["city", "sector", "supervisor"] as const) {
      const values = [...new Set(matches.map((r) => r[field]).filter(Boolean))];
      if (values.length > 1) {
        conflict = true;
        warnings.push(`${login}: ${field} tem valores conflitantes; revise manualmente.`);
      } else if (values[0] && (!inputs.includes(row) || !row[field])) entry[field] = values[0];
    }
    if (!conflict) usedNames.add(key);
    output.set(login, entry);
  }
  const unmatchedNames = [...byName.entries()]
    .filter(([key, rows]) => !usedNames.has(key) && rows.every((r) => !r.login))
    .map(([, rows]) => ({ ...rows[0]! }));
  return { entries: [...output.values()], unmatchedNames, warnings };
}

export function legacyDirectory(state: QualityState): QualityLogin[] {
  const result = new Map<string, QualityLogin>();
  const add = (login: string, name: string, supervisor = "") => {
    if (!login || login === "(sem login)") return;
    const key = normalizeLogin(login),
      old = result.get(key);
    result.set(key, {
      ...(old ?? emptyQualityLogin()),
      login: key,
      full_name: validQualityName(name, key) || validQualityName(old?.full_name, key) || key,
      supervisor: supervisor || old?.supervisor || "",
    });
  };
  const names = state.datasets.quebra?.["names"] as Record<string, string> | undefined;
  for (const [login, name] of Object.entries(names ?? {})) add(login, name);
  const techMap = {
    ...((state.datasets.technical_visit?.["techMap"] as Record<string, { name?: string }>) ?? {}),
    ...((state.datasets.technical_visit?.["customMap"] as Record<string, { name?: string }>) ?? {}),
    ...((state.datasets.certification?.["techMap"] as Record<string, { name?: string }>) ?? {}),
    ...((state.datasets.certification?.["customMap"] as Record<string, { name?: string }>) ?? {}),
  };
  for (const [login, entry] of Object.entries(techMap)) add(login, entry.name ?? "");
  for (const [login, entry] of Object.entries(state.registry))
    add(login, entry.name, entry.supervisor);
  for (const field of ["nameUpdates", "corrections"]) {
    const updates = {
      ...((state.datasets.technical_visit?.[field] as Record<string, string>) ?? {}),
      ...((state.datasets.certification?.[field] as Record<string, string>) ?? {}),
    };
    for (const [login, name] of Object.entries(updates ?? {})) add(login, name);
  }
  return [...result.values()];
}

export function directoryIndex(directory: QualityLogin[]): Map<string, QualityLogin> {
  return new Map(directory.map((row) => [normalizeLogin(row.login), row]));
}
export function hydrateQuality(
  state: QualityState,
  directory: QualityLogin[],
  certificationKind: CertificationKind = "certification",
) {
  const index = directoryIndex(directory);
  const qq = (state.datasets.quebra?.records ?? []) as QQRecord[];
  const tc = ((state.datasets[certificationKind]?.records ?? []) as TCRecord[]).map((row) => {
    const person = index.get(normalizeLogin(row.login));
    const name =
      validQualityName(person?.full_name, row.login) ||
      validQualityName(row.name, row.login) ||
      row.login ||
      "(sem login)";
    return person ? { ...row, name, mapped: true, mapSource: "cadastro" } : { ...row, name };
  });
  const missing = new Map<string, QualityLogin>();
  for (const row of [
    ...qq.map((r) => ({
      login: r.lt,
      name: index.get(normalizeLogin(r.lt))?.full_name ?? "",
      city: r.ci || cityFromUnit(r.un),
    })),
    ...tc.map((r) => ({ login: r.login, name: r.name, city: r.city })),
  ]) {
    const login = normalizeLogin(row.login);
    if (!login || login === "(SEM LOGIN)" || index.has(login)) continue;
    if (!missing.has(login))
      missing.set(login, {
        ...emptyQualityLogin(),
        login,
        full_name: validQualityName(row.name, login),
        city: row.city,
      });
  }
  return { qq, tc, index, missing: [...missing.values()] };
}
