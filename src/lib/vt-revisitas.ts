import { nameKey, normalizeLogin } from "./quality-directory";

export const VT_CITIES = { fortaleza: "Fortaleza", natal: "Natal / Parnamirim" } as const;
export type VtCity = keyof typeof VT_CITIES;
export const VT_IMPORT_LABELS = {
  orders: "Ordens de serviço",
  days: "Dias trabalhados",
  entries: "Média de entradas",
} as const;
export type VtImportKind = keyof typeof VT_IMPORT_LABELS;

export interface VtOrder {
  id: string;
  os: string;
  wo: string;
  contract: string;
  day: string;
  time: string;
  technician: string;
  municipality: string;
  neighborhood: string;
  node: string;
  service: string;
  code: number;
  description: string;
  expunge: boolean;
}
export interface VtAttendance {
  id: string;
  technician: string;
  login: string;
  value: number;
}
export interface VtRules {
  dailyCents: number;
  maxDays: number;
  maxBaseCents: number;
  discountFrom: number;
  discountCents: number;
  bonusOrders: number;
  bonusCents: number;
  entryLimit: number;
  exception: string;
  exceptionLimit: number;
}
export const VT_SHEET_RULES: VtRules = {
  dailyCents: 1200,
  maxDays: 25,
  maxBaseCents: 30000,
  discountFrom: 5,
  discountCents: 2000,
  bonusOrders: 140,
  bonusCents: 20000,
  entryLimit: 8 * 3600 + 15 * 60,
  exception: "",
  exceptionLimit: 11 * 3600 + 15 * 60,
};
export interface VtPayment {
  technician: string;
  productive: number;
  revisits: number;
  days: number | null;
  entry: number | null;
  base: number | null;
  discount: number;
  bonus: number | null;
  total: number | null;
  attendance?: {
    name: string;
    login: string;
    dayId?: string;
    entryId?: string;
  };
  attendanceIssue?: "unmatched" | "ambiguous" | "suggested" | "duplicate" | "incomplete";
}
export interface VtSnapshot {
  rules: VtRules;
  payments: VtPayment[];
}
export interface VtSource {
  file: string;
  count: number;
  at: string;
}
export interface VtPeriod {
  city: VtCity;
  period: string;
  revision: number;
  orders: VtOrder[];
  days: VtAttendance[];
  entries: VtAttendance[];
  sources: Partial<Record<VtImportKind, VtSource>>;
  closed_at: string | null;
  snapshot: VtSnapshot | null;
}

export function vtCity(value: unknown): VtCity | undefined {
  const city = nameKey(value).replace(/\s*\/\s*/g, "/");
  if (["FORTALEZA", "FORTALEZA/CE", "FORTALEZA - CE"].includes(city)) return "fortaleza";
  if (["NATAL", "PARNAMIRIM", "NATAL/PARNAMIRIM", "NATAL/RN", "PARNAMIRIM/RN"].includes(city))
    return "natal";
  return undefined;
}

export function vtDate(value: unknown): string | null {
  let date: string | null = null;
  if (value instanceof Date && !isNaN(value.valueOf())) date = value.toISOString().slice(0, 10);
  else if (typeof value === "number" && value >= 36526 && value < 73051)
    date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  else {
    const text = String(value ?? "").trim();
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]|$)/.exec(text);
    if (br) date = `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}(?:[ T]|$)/.test(text)) date = text.slice(0, 10);
  }
  if (!date || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function vtSeconds(value: unknown): number | null {
  if (value instanceof Date && !isNaN(value.valueOf()))
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  if (typeof value === "number" && value >= 0 && value < 1)
    return Math.min(86399, Math.round(value * 86400));
  const parts = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? "").trim());
  if (!parts || +parts[1]! >= 24 || +parts[2]! >= 60 || +(parts[3] ?? 0) >= 60) return null;
  return +parts[1]! * 3600 + +parts[2]! * 60 + +(parts[3] ?? 0);
}

export function vtTime(seconds: number): string {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

const header = (value: unknown) => nameKey(value).replace(/[^A-Z0-9]/g, "");
const str = (value: unknown) => String(value ?? "").trim();
const osHeaders = {
  os: ["NUMOS", "NUMEROOS", "OS"],
  wo: ["NUMEROWO", "WORKORDER", "WO"],
  contract: ["NUMCONTRATO", "NUMEROCONTRATO", "CONTRATO"],
  day: ["DATA", "DATA1", "DATAEXECUCAO"],
  time: ["INICIO", "INICIOTRABALHO"],
  technician: ["INSTALADOR", "TECNICO", "COLABORADOR"],
  municipality: ["CIDADE", "MUNICIPIO", "NMMUNICIPIO"],
  neighborhood: ["BAIRRO"],
  node: ["NODE"],
  service: ["SERVICO", "TIPOSERVICO"],
  code: ["CODBAIXA", "CODIGOBAIXA", "CD BAIXA"],
  description: ["DESCCODBAIXA", "DESCRICAOCODIGOBAIXA"],
  expunge: ["EXPURGAR", "EXPURGADAS"],
} as const;

export function parseVtOrders(matrix: unknown[][], city: VtCity, month: string) {
  const locate = (row: unknown[]) => {
    const keys = row.map(header);
    return Object.fromEntries(
      Object.entries(osHeaders).map(([key, options]) => [
        key,
        options.map((label) => keys.indexOf(header(label))).find((i) => i >= 0) ?? -1,
      ]),
    ) as Record<keyof typeof osHeaders, number>;
  };
  const at = matrix.slice(0, 20).findIndex((row) => {
    const c = locate(row);
    return (
      (c.os >= 0 || c.wo >= 0) &&
      [c.contract, c.day, c.technician, c.municipality, c.code].every((i) => i >= 0)
    );
  });
  if (at < 0)
    throw Error(
      "Cabeçalho de Ordens de Serviço ausente. Confira Data, Contrato, O.S./WO, Instalador, Cidade e Cód. Baixa.",
    );
  const cols = locate(matrix[at]!);
  const rows = new Map<string, VtOrder>();
  let duplicates = 0;
  matrix.slice(at + 1).forEach((row, i) => {
    if (!row.some((value) => value != null && str(value))) return;
    const get = (key: keyof typeof cols) => row[cols[key]];
    const os = str(get("os")),
      wo = str(get("wo")),
      contract = str(get("contract"));
    const day = vtDate(get("day")),
      technician = str(get("technician"));
    const municipality = nameKey(get("municipality"));
    const codeMatch = /^(\d{1,3})(?:\D|$)/.exec(str(get("code")));
    const rowNumber = at + i + 2;
    if (vtCity(municipality) !== city)
      throw Error(`Linha ${rowNumber}: a cidade não pertence à região selecionada.`);
    if (!day?.startsWith(`${month}-`))
      throw Error(`Linha ${rowNumber}: data inválida ou fora da competência ${month}.`);
    if ((!os && !wo) || !contract || !technician || !codeMatch)
      throw Error(
        `Linha ${rowNumber}: informe O.S./WO, contrato, instalador e código de baixa válido.`,
      );
    const time = vtSeconds(get("time"));
    const id = os ? `OS:${os}` : `WO:${wo}`;
    const order: VtOrder = {
      id,
      os,
      wo,
      contract,
      day,
      time: time === null ? "" : vtTime(time),
      technician,
      municipality,
      neighborhood: nameKey(get("neighborhood")),
      node: nameKey(get("node")),
      service: str(get("service")),
      code: Number(codeMatch[1]),
      description: str(get("description")),
      expunge: ["SIM", "1", "TRUE"].includes(nameKey(get("expunge"))),
    };
    const previous = rows.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(order))
      throw Error(`Linha ${rowNumber}: a mesma O.S./WO tem informações diferentes no arquivo.`);
    if (previous) duplicates++;
    rows.set(id, order);
  });
  if (!rows.size) throw Error("A planilha não contém ordens para importar.");
  return { rows: [...rows.values()], duplicates };
}

export function parseVtAttendance(
  matrix: unknown[][],
  kind: "days" | "entries",
  city: VtCity,
  month: string,
) {
  const valueHeaders =
    kind === "days"
      ? ["DIASTRABALHADOS", "DIASDETRABALHO", "DIASTRAB", "DIAS"]
      : [
          "MEDIAENTRADAS",
          "MEDIADEENTRADAS",
          "MEDIADEENTRADA",
          "MEDIAENTRADA",
          "MEDIAHORA",
          "HORARIOMEDIO",
          "HORARIOMEDIODEENTRADA",
          "ENTRADAMEDIA",
        ];
  const find = (row: unknown[], choices: string[]) =>
    row.findIndex((x) => choices.includes(header(x)));
  const nameHeaders = ["TECNICO", "NOME", "NOMECOMPLETO", "COLABORADOR", "INSTALADOR"];
  const loginHeaders = ["LOGIN", "LOGINTECNICO", "MATRICULA"];
  const at = matrix
    .slice(0, 20)
    .findIndex(
      (row) =>
        (find(row, nameHeaders) >= 0 || find(row, loginHeaders) >= 0) &&
        find(row, valueHeaders) >= 0,
    );
  if (at < 0) throw Error(`Informe um cabeçalho com Técnico ou Login e ${VT_IMPORT_LABELS[kind]}.`);
  const h = matrix[at]!;
  const c = {
    technician: find(h, nameHeaders),
    login: find(h, loginHeaders),
    value: find(h, valueHeaders),
    city: find(h, ["CIDADE", "MUNICIPIO"]),
    month: find(h, ["COMPETENCIA", "MES", "PERIODO"]),
  };
  const rows = new Map<string, VtAttendance>();
  matrix.slice(at + 1).forEach((row, i) => {
    const technician = str(row[c.technician]),
      login = normalizeLogin(row[c.login]);
    if (
      (!technician && !login && !str(row[c.value])) ||
      /^(TOTAL( GERAL)?|MEDIA GERAL)$/.test(nameKey(technician))
    )
      return;
    const line = at + i + 2;
    if (str(row[c.city]) && vtCity(row[c.city]) !== city)
      throw Error(`Linha ${line}: cidade diferente da região selecionada.`);
    const reported = str(row[c.month]);
    if (reported && reported !== month && vtDate(row[c.month])?.slice(0, 7) !== month)
      throw Error(`Linha ${line}: a competência do arquivo não é ${month}.`);
    const value =
      kind === "entries"
        ? vtSeconds(row[c.value])
        : str(row[c.value])
          ? Number(str(row[c.value]).replace(",", "."))
          : null;
    if (
      (!technician && !login) ||
      value == null ||
      !Number.isFinite(value) ||
      value < 0 ||
      (kind === "days" && value > 31)
    )
      throw Error(`Linha ${line}: técnico ou ${VT_IMPORT_LABELS[kind].toLowerCase()} inválidos.`);
    const id = login ? `LOGIN:${login}` : `NOME:${nameKey(technician)}`;
    const previous = rows.get(id);
    if (
      previous &&
      (previous.value !== value || nameKey(previous.technician) !== nameKey(technician))
    )
      throw Error(
        `Linha ${line}: o técnico está repetido com valores diferentes. Use um resumo acumulado por técnico.`,
      );
    rows.set(id, { id, technician: technician || login, login, value });
  });
  if (!rows.size) throw Error("Nenhum técnico encontrado para importar.");
  return { rows: [...rows.values()], duplicates: 0 };
}

export interface VtClassified extends VtOrder {
  productive: boolean;
  improductive: boolean;
  revisited: boolean;
  expunged: boolean;
  returnOs: string;
}

export function vtArea(order: VtOrder): string {
  if (!order.neighborhood) return "";
  // Preserve homonymous neighborhoods in the two municipalities of the Natal region.
  return vtCity(order.municipality) === "natal"
    ? `${order.neighborhood} · ${order.municipality}`
    : order.neighborhood;
}

/** Preserves the Sheets thresholds, but matches subsequent visits by contract and timestamp. */
export function classifyVtOrders(orders: readonly VtOrder[]): VtClassified[] {
  const buckets = new Map<string, VtOrder[]>();
  for (const order of orders) {
    const key = order.contract;
    const list = buckets.get(key) ?? [];
    list.push(order);
    buckets.set(key, list);
  }
  const records: VtClassified[] = [];
  for (const list of buckets.values()) {
    list.sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
    );
    const expunged = list.map(
      (r, i) =>
        r.expunge ||
        (Boolean(list[i + 1]) &&
          ([570, 204, 203, 112].includes(r.code) || list[i + 1]!.code === 1)),
    );
    const improductive = list.map((r, i) => !expunged[i] && r.code <= 400);
    list.forEach((order, i) => {
      const next = list[i + 1];
      const gap = next ? (Date.parse(next.day) - Date.parse(order.day)) / 86400000 : Infinity;
      const revisit = Boolean(
        next &&
        gap > 0 &&
        gap <= 9 &&
        next.day.slice(0, 7) === order.day.slice(0, 7) &&
        nameKey(order.description) !== "CANCELAMENTO" &&
        !improductive[i + 1] &&
        !improductive[i + 2],
      );
      const productive = !improductive[i];
      const revisited = revisit && productive && !expunged[i] && order.code >= 400;
      records.push({
        ...order,
        productive,
        improductive: !productive,
        revisited,
        expunged: !!expunged[i],
        returnOs: revisited ? next!.os || next!.wo : "",
      });
    });
  }
  return records.sort(
    (a, b) =>
      b.day.localeCompare(a.day) || b.time.localeCompare(a.time) || b.id.localeCompare(a.id),
  );
}

export function vtSummaries(rows: readonly VtClassified[], key: (row: VtClassified) => string) {
  const map = new Map<
    string,
    {
      name: string;
      orders: number;
      productive: number;
      revisits: number;
      improductive: number;
      expunged: number;
    }
  >();
  for (const row of rows) {
    const name = key(row),
      normalized = nameKey(name);
    const a = map.get(normalized) ?? {
      name,
      orders: 0,
      productive: 0,
      revisits: 0,
      improductive: 0,
      expunged: 0,
    };
    a.orders++;
    a.productive += Number(row.productive);
    a.revisits += Number(row.revisited);
    a.improductive += Number(row.improductive);
    a.expunged += Number(row.expunged);
    map.set(normalized, a);
  }
  return [...map.values()];
}

interface AttendanceProfile {
  id: string;
  name: string;
  login: string;
  names: Set<string>;
  days: VtAttendance[];
  entries: VtAttendance[];
}

export function vtAttendanceRoster(
  days: readonly VtAttendance[],
  entries: readonly VtAttendance[],
) {
  const profiles = new Map<string, AttendanceProfile>();
  const loginsByName = new Map<string, Set<string>>();
  const sources = { days, entries } as const;
  for (const row of [...days, ...entries]) {
    const login = normalizeLogin(row.login);
    const name = nameKey(row.technician);
    if (!login || !name || name === login) continue;
    const logins = loginsByName.get(name) ?? new Set<string>();
    logins.add(login);
    loginsByName.set(name, logins);
  }
  for (const source of ["days", "entries"] as const) {
    for (const row of sources[source]) {
      const name = nameKey(row.technician);
      const logins = loginsByName.get(name);
      const login = normalizeLogin(row.login) || (logins?.size === 1 ? [...logins][0]! : "");
      const id = login ? `LOGIN:${login}` : `NOME:${name}`;
      const profile = profiles.get(id) ?? {
        id,
        name: row.technician,
        login,
        names: new Set<string>(),
        days: [],
        entries: [],
      };
      if (name && name !== login) {
        profile.names.add(name);
        if (nameKey(profile.name) === login) profile.name = row.technician;
      }
      profile[source].push(row);
      profiles.set(id, profile);
    }
  }
  return [...profiles.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id),
  );
}

const nameParticles = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);
const nameTokens = (name: string) => name.split(" ").filter((part) => !nameParticles.has(part));

function spellingVariant(left: string, right: string) {
  if (left === right || Math.min(left.length, right.length) < 4) return false;
  if (left + "S" === right || right + "S" === left) return true;
  return (
    left.length === right.length &&
    [...left].filter((char, index) => char !== right[index]).length === 1 &&
    left.replace(/Z/g, "S") === right.replace(/Z/g, "S")
  );
}

function matchesName(alias: string[], full: string[], variantAt = -1) {
  let token = 0;
  for (const part of full) {
    const expected = alias[token]!;
    if (token === variantAt ? spellingVariant(expected, part) : expected === part) token++;
    if (token === alias.length) return true;
  }
  return false;
}

type AttendanceMatch = { profile?: AttendanceProfile; issue?: VtPayment["attendanceIssue"] };

function matchAttendance(
  technician: string,
  roster: AttendanceProfile[],
  chosenId?: string,
): AttendanceMatch {
  if (chosenId) {
    const profile = roster.find((item) => item.id === chosenId);
    return profile ? { profile } : { issue: "unmatched" };
  }
  const key = nameKey(technician);
  const byLogin = roster.find((item) => item.login && item.login === normalizeLogin(technician));
  if (byLogin) return { profile: byLogin };
  const exact = roster.filter((item) => item.names.has(key));
  if (exact.length === 1) return { profile: exact[0]! };
  if (exact.length > 1) return { issue: "ambiguous" };
  const alias = nameTokens(key);
  if (alias.length < 2 || alias.some((token) => token.length < 2)) return { issue: "unmatched" };
  const candidates = roster.flatMap<AttendanceMatch>((profile) => {
    const names = [...profile.names].map(nameTokens);
    if (names.some((tokens) => matchesName(alias, tokens))) return [{ profile }];
    if (names.some((tokens) => alias.some((_, index) => matchesName(alias, tokens, index))))
      return [{ profile, issue: "suggested" }];
    return [];
  });
  if (candidates.length === 1) return candidates[0]!;
  return { issue: candidates.length ? "ambiguous" : "unmatched" };
}

function attendanceRow(rows: VtAttendance[]) {
  return rows.length && rows.every((row) => row.value === rows[0]!.value) ? rows[0]! : undefined;
}

export function vtPayments(
  rows: VtClassified[],
  days: VtAttendance[],
  entries: VtAttendance[],
  rules: VtRules,
  confirmedLinks?: ReadonlyMap<string, string>,
): VtPayment[] {
  const roster = vtAttendanceRoster(days, entries);
  const matched = vtSummaries(rows, (row) => row.technician)
    .filter((a) => a.productive > 0)
    .map((summary) => ({
      summary,
      ...matchAttendance(summary.name, roster, confirmedLinks?.get(nameKey(summary.name))),
    }));
  const claims = new Map<string, number>();
  for (const { profile, issue } of matched) {
    if (profile && !issue) claims.set(profile.id, (claims.get(profile.id) ?? 0) + 1);
  }
  return matched
    .map(({ summary: a, profile, issue }) => {
      const attendanceIssue = profile && (claims.get(profile.id) ?? 0) > 1 ? "duplicate" : issue;
      const dayRow = attendanceRow(profile?.days ?? []);
      const entryRow = attendanceRow(profile?.entries ?? []);
      const daysWorked = attendanceIssue === "duplicate" ? null : (dayRow?.value ?? null);
      const entry = attendanceIssue === "duplicate" ? null : (entryRow?.value ?? null);
      const base =
        daysWorked === null || attendanceIssue
          ? null
          : Math.min(
              rules.maxBaseCents,
              Math.round(Math.min(rules.maxDays, daysWorked) * rules.dailyCents),
            );
      const discount = a.revisits >= rules.discountFrom ? a.revisits * rules.discountCents : 0;
      const entryLimit =
        rules.exception && nameKey(rules.exception) === nameKey(a.name)
          ? rules.exceptionLimit
          : rules.entryLimit;
      const bonus =
        entry === null || attendanceIssue
          ? null
          : a.productive >= rules.bonusOrders && entry <= entryLimit
            ? rules.bonusCents
            : 0;
      const pending =
        attendanceIssue ?? (daysWorked === null || entry === null ? "incomplete" : undefined);
      return {
        technician: a.name,
        productive: a.productive,
        revisits: a.revisits,
        days: daysWorked,
        entry,
        base,
        discount,
        bonus,
        total: base === null || bonus === null ? null : Math.max(0, base - discount) + bonus,
        ...(profile && {
          attendance: {
            name: profile.name,
            login: profile.login,
            ...(dayRow && { dayId: dayRow.id }),
            ...(entryRow && { entryId: entryRow.id }),
          },
        }),
        ...(pending && { attendanceIssue: pending }),
      };
    })
    .sort((a, b) => a.technician.localeCompare(b.technician, "pt-BR"));
}
