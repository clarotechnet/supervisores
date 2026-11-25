import { nameKey, normalizeLogin, type QualityLogin } from "./quality-directory";
import { isTechnicalVisitSector } from "./technical-visit-scope";

export const VT_CITIES = { fortaleza: "Fortaleza", natal: "Natal / Parnamirim" } as const;
export type VtCity = keyof typeof VT_CITIES;
export const VT_IMPORT_LABELS = {
  orders: "Ordens de serviço",
  days: "Dias trabalhados",
  entries: "Média de entradas",
} as const;
export type VtImportKind = keyof typeof VT_IMPORT_LABELS;

interface VtSheetClassification {
  improductive: boolean;
  revisited: boolean;
  expunged: boolean;
}

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
  sheetClassification?: VtSheetClassification;
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
  login?: string;
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
  status: ["STATUS"],
  closedAt: ["DATADABAIXA", "DATABAIXA"],
  systemClosedAt: ["DATABAIXASISTEMA"],
  description: ["DESCCODBAIXA", "DESCRICAOCODIGOBAIXA"],
  expunge: ["EXPURGAR", "EXPURGADAS"],
  sheetMonth: ["MES"],
  sheetTeam: ["EQUIPE"],
  sheetRevisit: ["PROD"],
  sheetImproductive: ["IMPROD"],
  sheetExpunged: ["EXPURGADAS"],
} as const;

/** One report row is an attendance, not the lifetime of its O.S. number. */
export function vtOrderKey({ os, wo, day }: Pick<VtOrder, "os" | "wo" | "day">) {
  const escape = (value: string) => value.replace(/%/g, "%25").replace(/\|/g, "%7C");
  return `OS:${escape(os)}|WO:${escape(wo)}|D:${day}`;
}

export function prepareVtOrderImport(existing: readonly VtOrder[], incoming: readonly VtOrder[]) {
  const saved = new Map(existing.map((order) => [vtOrderKey(order), order]));
  let newRows = 0;
  let retainedClassifications = 0;
  const rows = incoming.map((order) => {
    const previous = saved.get(vtOrderKey(order));
    if (!previous) newRows++;
    if (
      order.sheetClassification ||
      !previous?.sheetClassification ||
      previous.code !== order.code ||
      previous.contract !== order.contract ||
      nameKey(previous.service) !== nameKey(order.service)
    )
      return order;
    // A raw daily upload has no Sheets verdict. Don't undo a reviewed attendance.
    retainedClassifications++;
    return { ...order, sheetClassification: previous.sheetClassification };
  });
  return { rows, newRows, retainedClassifications };
}

export function vtOrdersLayout(matrix: unknown[][]) {
  for (const [at, row] of matrix.slice(0, 20).entries()) {
    const keys = row.map(header);
    const cols = Object.fromEntries(
      Object.entries(osHeaders).map(([key, options]) => [
        key,
        options.map((label) => keys.indexOf(header(label))).find((i) => i >= 0) ?? -1,
      ]),
    ) as Record<keyof typeof osHeaders, number>;
    if (
      (cols.os >= 0 || cols.wo >= 0) &&
      [cols.contract, cols.day, cols.technician, cols.municipality, cols.code].every((i) => i >= 0)
    ) {
      const fromSheet = [
        cols.sheetMonth,
        cols.sheetTeam,
        cols.sheetRevisit,
        cols.sheetImproductive,
        cols.sheetExpunged,
      ].every((i) => i >= 0);
      return { at, cols, fromSheet };
    }
  }
  return undefined;
}

function vtSheetFlag(cell: unknown, label: string, line: number) {
  const value = str(cell);
  if (value === "0" || value === "1") return value === "1";
  throw Error(
    `Linha ${line}: a coluna ${label} precisa conter o resultado calculado (0 ou 1) do Sheets.`,
  );
}

export function parseVtOrders(matrix: unknown[][], city: VtCity, month: string) {
  const layout = vtOrdersLayout(matrix);
  if (!layout)
    throw Error(
      "Cabeçalho de Ordens de Serviço ausente. Confira Data, Contrato, O.S./WO, Instalador, Cidade e Cód. Baixa.",
    );
  const { at, cols, fromSheet } = layout;
  const rows = new Map<string, { order: VtOrder; line: number }>();
  const pendingLines: number[] = [];
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
    const rawCode = str(get("code"));
    const codeMatch = /^(\d{1,3})(?:\D|$)/.exec(rawCode);
    const rowNumber = at + i + 2;
    // The original Sheets tab can contain several months and cities.
    if (
      fromSheet &&
      ((day && !day.startsWith(`${month}-`)) || (municipality && vtCity(municipality) !== city))
    )
      return;
    if (vtCity(municipality) !== city)
      throw Error(`Linha ${rowNumber}: a cidade não pertence à região selecionada.`);
    if (!day?.startsWith(`${month}-`))
      throw Error(`Linha ${rowNumber}: data inválida ou fora da competência ${month}.`);
    const missingFields = [
      !os && !wo && "O.S. ou WO",
      !contract && "contrato",
      !technician && "instalador",
    ].filter(Boolean);
    if (missingFields.length)
      throw Error(`Linha ${rowNumber}: falta informar ${missingFields.join(", ")}.`);
    if (!codeMatch) {
      const pending =
        !rawCode &&
        str(get("status")) === "1" &&
        (cols.closedAt >= 0 || cols.systemClosedAt >= 0) &&
        !str(get("closedAt")) &&
        !str(get("systemClosedAt"));
      if (pending) {
        pendingLines.push(rowNumber);
        return;
      }
      throw Error(`Linha ${rowNumber}: código de baixa ${rawCode ? "inválido" : "ausente"}.`);
    }
    const time = vtSeconds(get("time"));
    const id = vtOrderKey({ os, wo, day });
    if ([...id].length > 180)
      throw Error(`Linha ${rowNumber}: os identificadores da O.S./WO estão acima do limite.`);
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
    if (fromSheet) {
      order.sheetClassification = {
        revisited: vtSheetFlag(get("sheetRevisit"), "Prod", rowNumber),
        improductive: vtSheetFlag(get("sheetImproductive"), "Improd", rowNumber),
        expunged: vtSheetFlag(get("sheetExpunged"), "Expurgadas", rowNumber),
      };
    }
    const previous = rows.get(id);
    if (previous) {
      if (JSON.stringify(previous.order) !== JSON.stringify(order))
        throw Error(
          `Linhas ${previous.line} e ${rowNumber}: a mesma O.S./WO no mesmo dia tem informações diferentes. Confira qual registro deve ser importado.`,
        );
      duplicates++;
      return;
    }
    rows.set(id, { order, line: rowNumber });
  });
  if (!rows.size && pendingLines.length)
    throw Error(
      `Nenhuma ordem com baixa para importar. ${pendingLines.length} linha(s) ainda estão sem baixa na origem.`,
    );
  if (!rows.size)
    throw Error(
      fromSheet
        ? "A aba do Sheets não contém ordens da cidade e competência selecionadas."
        : "A planilha não contém ordens para importar.",
    );
  if (rows.size > 15000)
    throw Error("A cidade e competência ultrapassam 15.000 ordens no arquivo.");
  return {
    rows: [...rows.values()].map(({ order }) => order),
    duplicates,
    pendingLines,
    fromSheet,
  };
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
  technicianLogin?: string;
  productive: boolean;
  improductive: boolean;
  cancelled: boolean;
  revisited: boolean;
  expunged: boolean;
  returnOs: string;
}

export const VT_ORDER_CATEGORIES = {
  all: "Todas",
  productive: "Produtivas",
  revisit: "Revisitas produtivas",
  improductive: "Improdutivas",
  cancelled: "Canceladas",
  expunge: "Expurgadas",
} as const;
export type VtOrderCategory = keyof typeof VT_ORDER_CATEGORIES;

const orderCategoryFlag = {
  productive: "productive",
  revisit: "revisited",
  improductive: "improductive",
  cancelled: "cancelled",
  expunge: "expunged",
} as const;

export function vtOrderMatchesCategory(order: VtClassified, category: VtOrderCategory) {
  return category === "all" || order[orderCategoryFlag[category]];
}

export function vtArea(order: VtOrder): string {
  if (!order.neighborhood) return "";
  // Preserve homonymous neighborhoods in the two municipalities of the Natal region.
  return vtCity(order.municipality) === "natal"
    ? `${order.neighborhood} · ${order.municipality}`
    : order.neighborhood;
}

const expungeWithFollowup = new Set([570, 203, 204, 112]);
const noiseRemoval = (order: VtOrder) => nameKey(order.service) === "LIMPEZA DE RUIDO INDOOR";
const isPreventiveIndoor = (order: VtOrder) =>
  nameKey(order.service) === "MANUTENCAO PREVENTIVA INDOOR I";

function inVtRevisitWindow(day: string, followupDay?: string) {
  if (!followupDay || followupDay.slice(0, 7) !== day.slice(0, 7)) return false;
  const gap = (Date.parse(followupDay) - Date.parse(day)) / 86400000;
  return gap > 0 && gap <= 9;
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
    const outcomes = list.map((order, i) => {
      const next = list[i + 1];
      const cancelled = order.code === 0 || order.code === 1;
      const sheet = order.sheetClassification;
      // A revisita cancelada (1) continua expurgando a O.S. anterior, não a si mesma.
      const expunged =
        !cancelled &&
        (sheet?.expunged ??
          (order.expunge ||
            (!!next &&
              (expungeWithFollowup.has(order.code) ||
                noiseRemoval(order) ||
                noiseRemoval(next) ||
                next.code === 1))));
      const improductive = !cancelled && (sheet?.improductive ?? (!expunged && order.code <= 400));
      return { cancelled, expunged, improductive, productive: !cancelled && !improductive };
    });
    // Preserve the full sequence for productivity and expurgo; skip preventive visits only for revisits.
    const preventive = list.map(isPreventiveIndoor);
    const nextForRevisit = new Array<number>(list.length + 1).fill(list.length);
    for (let i = list.length - 1; i >= 0; i--) {
      nextForRevisit[i] = preventive[i + 1] ? nextForRevisit[i + 1]! : i + 1;
    }
    list.forEach((order, i) => {
      const outcome = outcomes[i]!;
      const nextIndex = nextForRevisit[i]!;
      const next = list[nextIndex];
      const inWindow = inVtRevisitWindow(order.day, next?.day);
      const automatic = Boolean(
        order.code >= 400 &&
        inWindow &&
        nameKey(order.description) !== "CANCELAMENTO" &&
        outcomes[nextIndex]?.productive &&
        (outcomes[nextForRevisit[nextIndex]!]?.productive ?? true),
      );
      const sheetRevisit = order.sheetClassification?.revisited;
      const onlyPreventiveReturn =
        sheetRevisit === true &&
        !preventive[i] &&
        !inWindow &&
        list
          .slice(i + 1, nextIndex)
          .some((following) => inVtRevisitWindow(order.day, following.day));
      const revisited =
        outcome.productive &&
        !outcome.expunged &&
        !preventive[i] &&
        !onlyPreventiveReturn &&
        (sheetRevisit ?? automatic);
      records.push({
        ...order,
        ...outcome,
        revisited,
        returnOs: revisited && inWindow && next ? next.os || next.wo : "",
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
      cancelled: number;
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
      cancelled: 0,
      expunged: 0,
    };
    a.orders++;
    a.productive += Number(row.productive);
    a.revisits += Number(row.revisited);
    a.improductive += Number(row.improductive);
    a.cancelled += Number(row.cancelled);
    a.expunged += Number(row.expunged);
    map.set(normalized, a);
  }
  return [...map.values()];
}

export function vtTechnicianSummaries(rows: readonly VtClassified[]) {
  const key = (row: VtClassified) => row.technicianLogin || nameKey(row.technician);
  const names = new Map(rows.map((row) => [key(row), row.technician]));
  return vtSummaries(rows, key).map((item) => ({
    ...item,
    id: item.name,
    name: names.get(item.name) ?? item.name,
  }));
}

interface NamedProfile {
  id: string;
  name: string;
  login: string;
  names: Set<string>;
}

interface AttendanceProfile extends NamedProfile {
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

type NameMatch<T extends NamedProfile> = { profile?: T; issue?: VtPayment["attendanceIssue"] };

function matchProfile<T extends NamedProfile>(
  technician: string,
  roster: readonly T[],
  chosenId?: string,
): NameMatch<T> {
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
  const candidates = roster.flatMap<NameMatch<T>>((profile) => {
    const names = [...profile.names].map(nameTokens);
    if (names.some((tokens) => matchesName(alias, tokens))) return [{ profile }];
    if (names.some((tokens) => alias.some((_, index) => matchesName(alias, tokens, index))))
      return [{ profile, issue: "suggested" }];
    return [];
  });
  if (candidates.length === 1) return candidates[0]!;
  return { issue: candidates.length ? "ambiguous" : "unmatched" };
}

/** Classify the full contract history first; only the registered VT originals enter this scope. */
export function vtTeamScope(
  classified: readonly VtClassified[],
  directory: readonly QualityLogin[],
  city: VtCity,
  confirmedLinks?: ReadonlyMap<string, string>,
) {
  const people = directory.map((entry) => {
    const login = normalizeLogin(entry.login);
    return {
      id: `LOGIN:${login}`,
      login,
      name: entry.full_name,
      names: new Set([nameKey(entry.full_name)]),
      city: vtCity(entry.city),
      vt: isTechnicalVisitSector(entry.sector),
    };
  });
  const directoryByLogin = new Map(people.map((person) => [person.login, person]));
  // Include other sectors in name matching: an Adhesão homonym must not resolve to a VT login.
  const regional = people.filter((person) => person.city === city);
  const members = regional
    .filter((person) => person.login && person.vt)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.login.localeCompare(b.login));
  const membersByLogin = new Map(members.map((person) => [person.login, person]));
  const regionalNames = new Set(regional.map((person) => nameKey(person.name)));
  const otherNames = new Set(
    people.filter((person) => person.city !== city).map((p) => nameKey(p.name)),
  );
  const matches = new Map<string, NameMatch<(typeof people)[number]>>();

  function resolve(name: string, explicitLogin?: string): NameMatch<(typeof people)[number]> {
    const login = normalizeLogin(explicitLogin);
    const knownLogin = login || directoryByLogin.get(normalizeLogin(name))?.login;
    if (knownLogin) {
      const profile = membersByLogin.get(knownLogin);
      return profile ? { profile } : {};
    }
    const key = nameKey(name);
    if (otherNames.has(key) && !regionalNames.has(key)) return {};
    let match = matches.get(key);
    if (!match) {
      match = matchProfile(name, regional);
      matches.set(key, match);
    }
    return match.profile && membersByLogin.has(match.profile.login) ? match : {};
  }

  const pending = new Map<string, Map<string, string>>();
  const confirmed = new Map<string, Map<string, string>>();
  const rows: VtClassified[] = [];
  for (const row of classified) {
    const { profile, issue } = resolve(row.technician);
    if (!profile) continue;
    if (issue === "suggested") {
      const alias = nameKey(row.technician);
      const approved = confirmedLinks?.get(alias) === profile.id;
      if (approved || row.productive) {
        const collection = approved ? confirmed : pending;
        const aliases = collection.get(profile.login) ?? new Map<string, string>();
        aliases.set(alias, row.technician);
        collection.set(profile.login, aliases);
      }
      if (!approved) continue;
    }
    rows.push({ ...row, technician: profile.name, technicianLogin: profile.login });
  }

  function attendance(source: readonly VtAttendance[]) {
    return source.flatMap((row) => {
      const { profile, issue } = resolve(row.technician, row.login);
      return profile && (!issue || confirmedLinks?.get(nameKey(row.technician)) === profile.id)
        ? [{ ...row, login: profile.login }]
        : [];
    });
  }
  return { rows, members, pending, confirmed, attendance };
}

function attendanceRow(rows: VtAttendance[]) {
  return rows.length && rows.every((row) => row.value === rows[0]!.value) ? rows[0]! : undefined;
}

function calculateVtPayment(
  a: Pick<VtPayment, "productive" | "revisits"> & { name: string },
  rules: VtRules,
  profile?: AttendanceProfile,
  attendanceIssue?: VtPayment["attendanceIssue"],
): VtPayment {
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
    rules.exception && [nameKey(a.name), profile?.login].includes(nameKey(rules.exception))
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
}

export function vtTeamPayments(
  team: ReturnType<typeof vtTeamScope>,
  days: readonly VtAttendance[],
  entries: readonly VtAttendance[],
  rules: VtRules,
) {
  const roster = new Map(
    vtAttendanceRoster(team.attendance(days), team.attendance(entries)).map((row) => [
      row.login,
      row,
    ]),
  );
  const totals = new Map(vtTechnicianSummaries(team.rows).map((row) => [row.id, row]));
  return team.members.flatMap<VtPayment>((member) => {
    const { login, name } = member;
    const summary = totals.get(login) ?? { productive: 0, revisits: 0 };
    const needsConfirmation = team.pending.has(login);
    if (!summary.productive && !needsConfirmation) return [];
    const attendance = roster.get(login);
    return [
      {
        ...calculateVtPayment(
          { ...summary, name },
          rules,
          { ...member, days: attendance?.days ?? [], entries: attendance?.entries ?? [] },
          needsConfirmation ? "suggested" : undefined,
        ),
        login,
      },
    ];
  });
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
      ...matchProfile(summary.name, roster, confirmedLinks?.get(nameKey(summary.name))),
    }));
  const claims = new Map<string, number>();
  for (const { profile, issue } of matched) {
    if (profile && !issue) claims.set(profile.id, (claims.get(profile.id) ?? 0) + 1);
  }
  return matched
    .map(({ summary: a, profile, issue }) => {
      const attendanceIssue = profile && (claims.get(profile.id) ?? 0) > 1 ? "duplicate" : issue;
      return calculateVtPayment(a, rules, profile, attendanceIssue);
    })
    .sort((a, b) => a.technician.localeCompare(b.technician, "pt-BR"));
}
