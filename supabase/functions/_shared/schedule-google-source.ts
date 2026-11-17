import { parseUpdatedSheet, type Payload } from "./schedule-operational.ts";
import {
  fixedRestColumn,
  readFixedRest,
  fixedRestDeclaration,
} from "./schedule-fixed-rest-value.ts";
type JsonRecord = Record<string, unknown>;

type SourceConfig = {
  env: string;
  label: string;
  includeFronts?: string[];
  excludeFronts?: string[];
};

type ParsedSheet = {
  title: string;
  people: Array<{
    name: string;
    login?: string;
    fixedRest?: string;
    jobTitle: string;
    assignments: Record<string, string>;
  }>;
  dates: string[];
  codes: string[];
};

const FRONT_LABELS: Record<string, string> = {
  "adesao-servico": "Adesão-Serviço",
  mdu: "MDU",
  vt: "VT",
  construcao: "Construção",
  mossoro: "Mossoró",
  desconexao: "Desconexão",
  "controle-operacional": "Controle",
  controle: "Controle",
  instalacao: "Instalação",
  manutencao: "Manutenção",
  supervisao: "Supervisão",
};

const CITY_FRONTS: Record<string, string[]> = {
  natal: ["adesao-servico", "mdu", "vt", "construcao", "desconexao", "controle-operacional"],
  mossoro: ["mossoro"],
  fortaleza: ["instalacao", "manutencao", "desconexao", "supervisao"],
  recife: ["instalacao", "desconexao"],
};

const CITY_SOURCES: Record<string, SourceConfig[]> = {
  natal: [
    {
      env: "GOOGLE_SHEETS_RN_MAIN_ID",
      label: "Escalas RN",
      excludeFronts: ["Controle"],
    },
    {
      env: "GOOGLE_SHEETS_RN_CONTROL_ID",
      label: "Controle RN",
      includeFronts: ["Controle"],
    },
  ],
  mossoro: [
    {
      env: "GOOGLE_SHEETS_RN_MAIN_ID",
      label: "Escalas RN",
      includeFronts: ["Mossoró"],
    },
  ],
  fortaleza: [{ env: "GOOGLE_SHEETS_CE_ID", label: "Escalas CE" }],
  recife: [{ env: "GOOGLE_SHEETS_PE_ID", label: "Escalas PE" }],
};

function text(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function identifyFront(sheetName: string): string {
  const name = normalized(sheetName);
  if (name.includes("ADESAO")) return "Adesão-Serviço";
  if (name.includes("CONSTRUCAO")) return "Construção";
  if (name.includes("MOSSORO")) return "Mossoró";
  if (name.includes("DESCONEXAO")) return "Desconexão";
  if (name.includes("CONTROLE")) return "Controle";
  if (name.includes("INSTALACAO")) return "Instalação";
  if (name.includes("MANUTENCAO")) return "Manutenção";
  if (name.includes("SUPERVIS")) return "Supervisão";
  if (/(^|[^A-Z])MDU([^A-Z]|$)/.test(name)) return "MDU";
  if (/(^|[^A-Z])VT([^A-Z]|$)/.test(name)) return "VT";
  return "";
}
function extractPeriod(sheetName: string): string {
  const name = normalized(sheetName).replace(/[_|]/g, " ");
  const direct = name.match(/\b(20\d{2})[- /.](0[1-9]|1[0-2])\b/);
  if (direct) return `${direct[1]}-${direct[2]}`;

  const months: Record<string, number> = {
    JANEIRO: 1,
    JAN: 1,
    FEVEREIRO: 2,
    FEV: 2,
    MARCO: 3,
    MAR: 3,
    ABRIL: 4,
    ABR: 4,
    MAIO: 5,
    MAI: 5,
    JUNHO: 6,
    JUN: 6,
    JULHO: 7,
    JUL: 7,
    AGOSTO: 8,
    AGO: 8,
    SETEMBRO: 9,
    SET: 9,
    OUTUBRO: 10,
    OUT: 10,
    NOVEMBRO: 11,
    NOV: 11,
    DEZEMBRO: 12,
    DEZ: 12,
  };
  const words = name.split(/[^A-Z0-9]+/).filter(Boolean);
  const monthWord = words.find((word) => months[word]);
  const yearWord = words.find((word) => /^(20\d{2}|\d{2})$/.test(word));
  if (!monthWord || !yearWord) return "";
  let year = Number(yearWord);
  if (year < 100) year += 2000;
  return `${year}-${String(months[monthWord]).padStart(2, "0")}`;
}

function serialToIso(value: number): string | null {
  if (!Number.isFinite(value) || value < 20000 || value > 100000) return null;
  const millis = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000;
  const date = new Date(millis);
  return date.toISOString().slice(0, 10);
}

function parseDateValue(value: unknown): string | null {
  if (typeof value === "number") return serialToIso(value);
  const raw = text(value);
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  }
  match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
}

function periodFromCell(value: unknown): string {
  const iso = parseDateValue(value);
  return iso ? iso.slice(0, 7) : "";
}

function sourceAllowsFront(source: SourceConfig, front: string): boolean {
  if (source.includeFronts && !source.includeFronts.includes(front)) return false;
  if (source.excludeFronts && source.excludeFronts.includes(front)) return false;
  return true;
}

async function googleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais do Google Sheets não foram configuradas.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Não foi possível renovar o acesso ao Google Sheets.",
    );
  }
  return payload.access_token;
}

async function googleJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Google Sheets respondeu ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return await response.json();
}

async function spreadsheetMeta(spreadsheetId: string, token: string) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  url.searchParams.set("fields", "properties(title),sheets(properties(sheetId,title,index))");
  return (await googleJson(url.toString(), token)) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string; sheetId?: number; index?: number } }>;
  };
}

async function sheetRows(spreadsheetId: string, sheetTitle: string, token: string) {
  const range = encodeURIComponent(`'${sheetTitle.replaceAll("'", "''")}'`);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
  );
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const payload = (await googleJson(url.toString(), token)) as { values?: unknown[][] };
  return payload.values ?? [];
}

function sourceDateColumns(
  rows: unknown[][],
  headerRow: number,
  firstDateColumn: number,
  expectedPeriod: string,
) {
  const [yearText, monthText] = expectedPeriod.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const dateRow = rows[headerRow - 1] ?? [];
  const seenDates = new Set<string>();
  const dateColumns: Array<{ column: number; date: string }> = [];
  const headings = rows[headerRow] ?? [];
  const first = headings.findIndex(
    (value, column) => column >= firstDateColumn && /^\d{1,2}(?:[/.-]\d{1,2})?$/.test(text(value)),
  );
  if (first < 0) return [];
  // Weekly PE tabs start on 29/11 and numeric 1/2 repeat after 31/12.
  // Resolve full dates in sequence, rather than treating both occurrences as December.
  const beginsInPreviousMonth =
    Number(headings[first]) > 7 &&
    headings.slice(first, first + 7).some((value) => text(value) === "1" || text(value) === "01");
  let calendar = new Date(Date.UTC(year, month - 1 - Number(beginsInPreviousMonth), 1, 12));
  const lower = Date.UTC(year, month - 1, 1, 12) - 7 * 86400000;
  const upper = Date.UTC(year, month, 0, 12) + 7 * 86400000;
  let priorDay = 0;
  for (let column = first; column < headings.length; column += 1) {
    const label = text(headings[column]);
    const compact = label.match(/^(\d{1,2})[/.-](\d{1,2})$/);
    if (!compact && !/^\d{1,2}$/.test(label)) break;
    const day = Number(compact?.[1] ?? label);
    if (day < 1 || day > 31) throw Error("Dia inválido no cabeçalho da escala.");
    let iso = parseDateValue(dateRow[column]);
    if (!iso) {
      if (compact) {
        const numberedMonth = Number(compact[2]);
        if (numberedMonth < 1 || numberedMonth > 12)
          throw Error("Mês inválido no cabeçalho da escala.");
        const adjustedYear =
          year + (month - numberedMonth >= 6 ? 1 : numberedMonth - month >= 6 ? -1 : 0);
        calendar = new Date(Date.UTC(adjustedYear, numberedMonth - 1, 1, 12));
      } else if (priorDay >= 28 && day < priorDay) {
        calendar = new Date(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 1, 12));
      }
      const candidate = new Date(
        Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth(), day, 12),
      );
      if (candidate.getUTCDate() !== day) throw Error("Data inválida na escala.");
      iso = candidate.toISOString().slice(0, 10);
    } else calendar = new Date(iso + "T12:00:00Z");
    const timestamp = Date.parse(iso + "T12:00:00Z");
    if (timestamp < lower || timestamp > upper || seenDates.has(iso))
      throw Error("Datas fora da competência ou duplicadas na escala.");
    seenDates.add(iso);
    priorDay = day;
    dateColumns.push({ column, date: iso });
  }
  return dateColumns;
}

export function parseSheet(
  rows: unknown[][],
  title: string,
  expectedPeriod: string,
): ParsedSheet | null {
  if (rows.length < 3) return null;

  let headerRow = -1;
  let nameColumn = -1;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 5); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const index = row.findIndex((cell) => normalized(cell) === "NOME");
    if (index >= 0) {
      headerRow = rowIndex;
      nameColumn = index;
      break;
    }
  }
  if (headerRow < 1 || nameColumn < 0) return null;

  const header = (rows[headerRow] ?? []).map(normalized);
  const loginColumn = header.indexOf("LOGIN");
  const fixedColumn = fixedRestColumn(rows[headerRow] || []);
  let auxColumn = -1;
  for (const label of ["AREA", "FUNCAO", "PLANTOES"]) {
    const index = header.indexOf(label);
    if (index >= 0) {
      auxColumn = index;
      break;
    }
  }

  const dateColumns = sourceDateColumns(
    rows,
    headerRow,
    Math.max(nameColumn, loginColumn, auxColumn) + 1,
    expectedPeriod,
  );
  if (dateColumns.length === 0) return null;

  const firstDateColumn = Math.min(...dateColumns.map((item) => item.column));
  const lastDateColumn = Math.max(...dateColumns.map((item) => item.column));
  let endRow = rows.length;
  let started = false;

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const first = normalized(row[0]);
    const name = normalized(row[nameColumn]);
    const dateSlice = row.slice(firstDateColumn, lastDateColumn + 1);
    const empty = !first && !name && dateSlice.every((value) => text(value) === "");
    if (name === "VALIDACAO" || first === "TURNO" || first === "TOTAL" || (started && empty)) {
      endRow = rowIndex;
      break;
    }
    if (name) started = true;
  }

  const people: ParsedSheet["people"] = [];
  const codes = new Set<string>();
  for (let rowIndex = headerRow + 1; rowIndex < endRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const name = text(row[nameColumn]);
    if (!name || normalized(name) === "VALIDACAO") continue;

    const assignments: Record<string, string> = {};
    for (const item of dateColumns) {
      const code = text(row[item.column]);
      if (!code) continue;
      assignments[item.date] = code;
      codes.add(code);
    }
    if (Object.keys(assignments).length === 0) continue;

    people.push({
      name,
      login: loginColumn >= 0 ? text(row[loginColumn]) || undefined : undefined,
      ...readFixedRest(row, fixedColumn),
      jobTitle: auxColumn >= 0 ? text(row[auxColumn]) : "",
      assignments,
    });
  }
  if (people.length === 0) return null;

  return {
    title,
    people,
    dates: dateColumns.map((item) => item.date),
    codes: [...codes],
  };
}

export function mergeSheets(parsed: ParsedSheet[]) {
  const dates = new Set<string>();
  const codes = new Set<string>();
  const people = new Map<string, ParsedSheet["people"][number]>();

  for (const sheet of parsed) {
    sheet.dates.forEach((date) => dates.add(date));
    sheet.codes.forEach((code) => codes.add(code));
    for (const person of sheet.people) {
      const key = person.login
        ? `LOGIN:${normalized(person.login)}`
        : `NOME:${normalized(person.name)}`;
      const current = people.get(key);
      if (!current) {
        people.set(key, { ...person, assignments: { ...person.assignments } });
        continue;
      }
      current.assignments = { ...current.assignments, ...person.assignments };
      if (person.fixedRest !== undefined) {
        if (
          current.fixedRest !== undefined &&
          fixedRestDeclaration(current).day !== fixedRestDeclaration(person).day
        )
          throw Error(
            "Folga fixa divergente entre abas para " + person.name + ". Confira a origem.",
          );
        current.fixedRest = person.fixedRest;
      }
      if (!current.jobTitle && person.jobTitle) current.jobTitle = person.jobTitle;
    }
  }

  const mergedPeople = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const mergedDates = [...dates].sort();
  const mergedCodes = [...codes].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const entryCount = mergedPeople.reduce(
    (total, person) => total + Object.keys(person.assignments).length,
    0,
  );
  return { people: mergedPeople, dates: mergedDates, codes: mergedCodes, entryCount };
}

export {
  CITY_SOURCES,
  CITY_FRONTS,
  FRONT_LABELS,
  googleAccessToken,
  googleJson,
  spreadsheetMeta,
  sheetRows,
  identifyFront,
  extractPeriod,
  periodFromCell,
  sourceAllowsFront,
  text,
  normalized,
  parseDateValue,
};
export function validSourceTitle(title: string) {
  const name = normalized(title);
  return (
    !["COPIA", "ALTERNATIVA", "ALTENATIVA"].some((word) => name.includes(word)) &&
    !["PAGINA", "COMPILADO"].some((word) => name.startsWith(word)) &&
    !["CADASTRO", "ACESSOS PAINEL"].includes(name)
  );
}
export async function loadScheduleSources(
  city: string,
  sector: string,
  month: string,
  token: string,
) {
  const result: Array<{
    spreadsheetId: string;
    title: string;
    sourceLabel: string;
    gridId: number;
    rows: unknown[][];
    parsed: ParsedSheet;
  }> = [];
  const front = FRONT_LABELS[sector];
  for (const source of CITY_SOURCES[city] || []) {
    if (!sourceAllowsFront(source, front)) continue;
    const spreadsheetId = Deno.env.get(source.env);
    if (!spreadsheetId) throw Error("Fonte " + source.label + " não configurada.");
    const meta = await spreadsheetMeta(spreadsheetId, token);
    for (const sheet of meta.sheets || []) {
      const title = text(sheet.properties?.title);
      if (!validSourceTitle(title) || identifyFront(title) !== front) continue;
      const rows = await sheetRows(spreadsheetId, title, token);
      if ((periodFromCell(rows[0]?.[1]) || extractPeriod(title)) !== month.slice(0, 7)) continue;
      const parsed = parseSheet(rows, title, month.slice(0, 7));
      if (parsed)
        result.push({
          spreadsheetId,
          title,
          sourceLabel: text(meta.properties?.title) || source.label,
          gridId: sheet.properties?.sheetId ?? -1,
          rows,
          parsed,
        });
    }
  }
  return result;
}
export function columnA1(index: number) {
  let value = index + 1,
    result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
export function findScheduleCell(
  rows: unknown[][],
  period: string,
  personName: string,
  login: string,
  date: string,
) {
  const headerRow = rows
    .slice(0, 5)
    .findIndex((row) => row.some((cell) => normalized(cell) === "NOME"));
  if (headerRow < 1) throw Error("Cabeçalho da escala não identificado.");
  const header = rows[headerRow]!,
    nameColumn = header.findIndex((cell) => normalized(cell) === "NOME"),
    loginColumn = header.findIndex((cell) => normalized(cell) === "LOGIN"),
    functionColumn = header.findIndex((cell) => normalized(cell) === "FUNCAO"),
    firstDateColumn = Math.max(nameColumn, loginColumn, functionColumn) + 1;
  // B1 pode ser a data do mês acima de Função. Só os dias após as
  // colunas de identificação podem ser alvos da edição.
  const columns = sourceDateColumns(rows, headerRow, firstDateColumn, period)
    .filter((item) => item.date === date)
    .map((item) => item.column);
  if (columns.length !== 1) throw Error("Data ausente ou ambígua na aba oficial.");
  const candidates: number[] = [];
  for (let row = headerRow + 1; row < rows.length; row++) {
    const name = normalized(rows[row]?.[nameColumn]);
    if (name === "VALIDACAO" || ["TURNO", "TOTAL"].includes(normalized(rows[row]?.[0]))) break;
    if (
      name === normalized(personName) &&
      (!login || loginColumn < 0 || normalized(rows[row]?.[loginColumn]) === normalized(login))
    )
      candidates.push(row);
  }
  if (candidates.length !== 1) throw Error("Colaborador ausente ou ambíguo na aba oficial.");
  const row = candidates[0]!,
    column = columns[0]!;
  return { row, column, a1: columnA1(column) + (row + 1), code: text(rows[row]?.[column]) };
}

export function officialMonthValues(payload: Payload, month: string): string[][] {
  const fixed = payload.people.some((p) => p.fixedRest !== undefined);
  return [
    ["Mês-ano:", month.slice(0, 7) + "-01", "", ...payload.dates, ...(fixed ? [""] : [])],
    [
      "Login",
      "Nome",
      "Função",
      ...payload.dates.map((day) => String(Number(day.slice(-2)))),
      ...(fixed ? ["Folga fixa"] : []),
    ],
    ...payload.people.map((p) => [
      p.login || "",
      p.name,
      p.jobTitle,
      ...payload.dates.map((day) => p.assignments[day] || ""),
      ...(fixed ? [p.fixedRest || ""] : []),
    ]),
  ];
}
export function parseOfficialMonthTab(
  rows: unknown[][],
  planned: Payload,
  previous: Payload,
  month: string,
) {
  const parsed = parseSheet(rows, "Oficial", month.slice(0, 7));
  if (
    !parsed ||
    parsed.people.length !== planned.people.length ||
    JSON.stringify(parsed.dates) !== JSON.stringify(planned.dates)
  )
    throw Error("Pessoas ou datas da aba oficial alteradas. Revise a estrutura.");
  const byName = new Map(parsed.people.map((p) => [normalized(p.name), p]));
  const converted = planned.people.map((p) => {
    const actual = byName.get(normalized(p.name));
    if (!actual) throw Error("Colaborador ausente da aba oficial: " + p.name);
    return [
      actual.name,
      actual.login || "",
      actual.jobTitle,
      ...planned.dates.map((day) => actual.assignments[day] || ""),
    ];
  });
  const result = parseUpdatedSheet(
    [["COLABORADOR", "LOGIN", "FUNÇÃO", ...planned.dates], ...converted],
    planned,
    previous,
  );
  result.payload.people = result.payload.people.map((person) => ({
    ...person,
    ...(byName.get(normalized(person.name))?.fixedRest !== undefined
      ? { fixedRest: byName.get(normalized(person.name))!.fixedRest }
      : {}),
  }));
  return result;
}
export function sourceSpreadsheet(city: string, sector: string) {
  if (!CITY_FRONTS[city]?.includes(sector)) return undefined;
  const source = (CITY_SOURCES[city] || []).find((item) =>
    sourceAllowsFront(item, FRONT_LABELS[sector]),
  );
  return source ? Deno.env.get(source.env) : undefined;
}
export function officialMonthTitle(sector: string, month: string) {
  return FRONT_LABELS[sector] + " " + month.slice(0, 7) + " - 5X2";
}
