import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

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
  url.searchParams.set("fields", "properties(title),sheets(properties(title))");
  return (await googleJson(url.toString(), token)) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
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

function parseSheet(rows: unknown[][], title: string, expectedPeriod: string): ParsedSheet | null {
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
  let auxColumn = -1;
  for (const label of ["AREA", "FUNCAO", "PLANTOES"]) {
    const index = header.indexOf(label);
    if (index >= 0) {
      auxColumn = index;
      break;
    }
  }

  const [yearText, monthText] = expectedPeriod.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const maxDay = new Date(year, month, 0).getDate();
  const dateRow = rows[headerRow - 1] ?? [];
  const seenDays = new Set<number>();
  const dateColumns: Array<{ column: number; date: string }> = [];

  for (let column = nameColumn + 1; column < (rows[headerRow]?.length ?? 0); column += 1) {
    const day = Number(rows[headerRow]?.[column]);
    if (!Number.isFinite(day) || day < 1 || day > 31 || day > maxDay || seenDays.has(day)) continue;
    let iso = parseDateValue(dateRow[column]);
    if (!iso || iso.slice(0, 7) !== expectedPeriod) {
      iso = `${expectedPeriod}-${String(day).padStart(2, "0")}`;
    }
    seenDays.add(day);
    dateColumns.push({ column, date: iso });
  }
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

function mergeSheets(parsed: ParsedSheet[]) {
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { error: "Método não permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !serviceRoleKey || !authorization) {
    return json(401, { error: "Requisição não autorizada." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json(401, { error: "Sessão inválida." });
  const { data: requester } = await admin
    .from("profiles")
    .select("role,status")
    .eq("id", authData.user.id)
    .maybeSingle();
  const canSync =
    requester?.status === "active" &&
    (requester.role === "admin" || requester.role === "supervisor");
  if (!canSync) {
    return json(403, { error: "Apenas gestores e supervisores ativos podem atualizar escalas." });
  }

  let body: { city?: string; front?: string; scheduleMonth?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: "Corpo da requisição inválido." });
  }

  const city = text(body.city).toLowerCase();
  const requestedFrontSlug = text(body.front).toLowerCase();
  const frontSlug = requestedFrontSlug === "controle" ? "controle-operacional" : requestedFrontSlug;
  const monthRaw = text(body.scheduleMonth);
  const scheduleMonth = /^20\d{2}-(0[1-9]|1[0-2])(?:-01)?$/.test(monthRaw)
    ? `${monthRaw.slice(0, 7)}-01`
    : "";
  const expectedPeriod = scheduleMonth.slice(0, 7);
  const front = FRONT_LABELS[frontSlug];

  if (!CITY_SOURCES[city] || !front || !scheduleMonth || !CITY_FRONTS[city]?.includes(frontSlug)) {
    return json(400, { error: "Cidade, frente ou mês inválido." });
  }

  try {
    const token = await googleAccessToken();
    const parsedSheets: ParsedSheet[] = [];
    const sourceLabels = new Set<string>();

    for (const source of CITY_SOURCES[city]) {
      if (!sourceAllowsFront(source, front)) continue;
      const spreadsheetId = Deno.env.get(source.env);
      if (!spreadsheetId) throw new Error(`Fonte ${source.label} não configurada no ambiente.`);

      const meta = await spreadsheetMeta(spreadsheetId, token);
      const titles = (meta.sheets ?? [])
        .map((item) => text(item.properties?.title))
        .filter(Boolean);

      for (const title of titles) {
        const normalizedTitle = normalized(title);
        if (
          normalizedTitle.includes("COPIA") ||
          normalizedTitle.includes("ALTERNATIVA") ||
          normalizedTitle.includes("ALTENATIVA") ||
          normalizedTitle.startsWith("PAGINA") ||
          normalizedTitle.startsWith("COMPILADO") ||
          normalizedTitle === "CADASTRO" ||
          normalizedTitle === "ACESSOS PAINEL"
        )
          continue;

        if (identifyFront(title) !== front) continue;
        const rows = await sheetRows(spreadsheetId, title, token);
        const period = extractPeriod(title) || periodFromCell(rows[0]?.[1]);
        if (period !== expectedPeriod) continue;

        const parsed = parseSheet(rows, title, expectedPeriod);
        if (parsed) {
          parsedSheets.push(parsed);
          sourceLabels.add(text(meta.properties?.title) || source.label);
        }
      }
    }

    if (parsedSheets.length === 0) {
      return json(404, {
        error: `Nenhuma aba de ${front} para ${expectedPeriod} foi encontrada nas planilhas configuradas.`,
      });
    }

    const merged = mergeSheets(parsedSheets);
    const sourceSheet = parsedSheets
      .map((item) => item.title)
      .join(" | ")
      .slice(0, 255);
    const sourceFile = `Google Sheets · ${[...sourceLabels].join(" + ")}`.slice(0, 255);
    const { error: upsertError } = await admin.from("schedule_uploads").upsert(
      {
        city,
        sector: frontSlug,
        schedule_month: scheduleMonth,
        source_file: sourceFile,
        source_sheet: sourceSheet,
        employee_count: merged.people.length,
        entry_count: merged.entryCount,
        payload: {
          dates: merged.dates,
          people: merged.people,
          codes: merged.codes,
        },
        imported_by: authData.user.id,
        imported_at: new Date().toISOString(),
      },
      { onConflict: "city,sector,schedule_month" },
    );
    if (upsertError) throw upsertError;

    return json(200, {
      ok: true,
      city,
      front: frontSlug,
      scheduleMonth,
      employeeCount: merged.people.length,
      entryCount: merged.entryCount,
      sourceSheets: parsedSheets.map((item) => item.title),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar as escalas.";
    return json(502, { error: message.slice(0, 1000) });
  }
});
