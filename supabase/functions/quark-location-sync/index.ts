import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const QUARK_BASE_URL = "https://api.quark.tec.br/rh/ext";
const MAX_PERIOD_DAYS = 60;
const ALLOWED_UNITS = new Set([9417839, 9417838, 9417837, 9417836, 9417834, 9338112]);

type JsonRecord = Record<string, unknown>;

interface LocationPayload {
  unitId?: number;
  collaboratorId?: string;
  startDate?: string;
  endDate?: string;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(
    String(value ?? "")
      .trim()
      .replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = textValue(value)?.toLocaleLowerCase("pt-BR") ?? "";
  if (["true", "sim", "s", "1", "ativo"].includes(normalized)) return true;
  if (["false", "não", "nao", "n", "0", "inativo"].includes(normalized)) return false;
  return fallback;
}

function normalizedKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");
}

function findValue(object: unknown, aliases: string[]): unknown {
  const record = asRecord(object);
  const wanted = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizedKey(key)) && value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = findValue(value, aliases);
    if (nested !== undefined && nested !== null && nested !== "") return nested;
  }
  return undefined;
}

function validPeriod(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return false;
  }
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Number.isFinite(days) && days >= 1 && days <= MAX_PERIOD_DAYS;
}

function apiDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function extractPointRows(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((item) => Object.keys(item).length > 0);
  }

  const record = asRecord(payload);
  for (const key of [
    "pontos",
    "registros",
    "dados",
    "data",
    "content",
    "items",
    "results",
    "result",
  ]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      const rows = candidate.map(asRecord).filter((item) => Object.keys(item).length > 0);
      if (rows.length) return rows;
    }
    if (candidate && typeof candidate === "object") {
      const nested = extractPointRows(candidate);
      if (nested.length) return nested;
    }
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object") continue;
    const nested = extractPointRows(value);
    if (nested.length) return nested;
  }
  return [];
}

function parsePointDateTime(value: unknown): {
  workDate: string | null;
  time: string | null;
  timestamp: string | null;
} {
  const raw = textValue(value);
  if (!raw) return { workDate: null, time: null, timestamp: null };

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const seconds = match[6] ?? "00";
    const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(raw)
      ? raw
      : `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${seconds}-03:00`;
    return {
      workDate: `${match[1]}-${match[2]}-${match[3]}`,
      time: `${match[4]}:${match[5]}:${seconds}`,
      timestamp,
    };
  }

  match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const seconds = match[6] ?? "00";
    return {
      workDate: `${match[3]}-${match[2]}-${match[1]}`,
      time: `${match[4]}:${match[5]}:${seconds}`,
      timestamp: `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${seconds}-03:00`,
    };
  }

  return { workDate: null, time: null, timestamp: null };
}

function parseWorkDate(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function normalizeTime(value: unknown): string | null {
  const raw = textValue(value);
  const match = raw?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match
    ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`
    : null;
}

async function quarkRequest(url: URL, token: string, unitId: number): Promise<unknown> {
  let lastError = "Falha desconhecida";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Auth-Token": token,
        "Unidade-ID": String(unitId),
      },
    });
    if (response.ok) return await response.json();

    const detail = (await response.text()).slice(0, 300);
    lastError = `Quark respondeu ${response.status}${detail ? `: ${detail}` : ""}`;
    if (response.status !== 429 && response.status < 500) break;

    const retryAfter = Number(response.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(lastError);
}

function normalizePoint(
  rawPoint: JsonRecord,
  unitId: number,
  collaboratorId: string,
  index: number,
): JsonRecord | null {
  const parsedDateTime = parsePointDateTime(
    findValue(rawPoint, ["dataHora", "data_hora", "datahora"]),
  );
  const workDate =
    parsedDateTime.workDate ??
    parseWorkDate(findValue(rawPoint, ["data", "dia", "dataPonto", "data_ponto"]));
  const punchTime =
    parsedDateTime.time ?? normalizeTime(findValue(rawPoint, ["hora", "horario", "horário"]));
  if (!workDate) return null;

  const pointId =
    textValue(findValue(rawPoint, ["id", "registroPontoId", "registro_ponto_id"])) ??
    `${unitId}:${collaboratorId}:${workDate}:${punchTime ?? index}:${index}`;

  return {
    point_id: pointId,
    unit_id: unitId,
    collaborator_id: collaboratorId,
    work_date: workDate,
    punched_at: parsedDateTime.timestamp ?? (punchTime ? `${workDate}T${punchTime}-03:00` : null),
    punch_time: punchTime,
    location: textValue(
      findValue(rawPoint, ["localizacao", "localização", "endereco", "endereço"]),
    ),
    latitude: numberValue(findValue(rawPoint, ["latitude", "lat"])),
    longitude: numberValue(findValue(rawPoint, ["longitude", "lng", "lon"])),
    observation: textValue(findValue(rawPoint, ["observacao", "observação"])),
    record_type: textValue(findValue(rawPoint, ["tipoRegistroPonto", "tipo_registro_ponto"])),
    is_offline: boolValue(findValue(rawPoint, ["pontoOffline", "offline"])),
    is_out_of_tolerance: boolValue(
      findValue(rawPoint, ["foraToleranciaHorario", "fora_tolerancia_horario"]),
    ),
    is_active: boolValue(findValue(rawPoint, ["ativo"]), true),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { error: "Método não permitido" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const quarkToken = Deno.env.get("QUARK_AUTH_TOKEN");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !serviceRoleKey || !authorization) {
    return json(401, { error: "Requisição não autorizada" });
  }
  if (!quarkToken) {
    return json(503, { error: "A credencial da API Quark ainda não foi configurada." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userToken = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await adminClient.auth.getUser(userToken);
  if (authError || !authData.user) return json(401, { error: "Sessão inválida" });

  const { data: requester } = await adminClient
    .from("profiles")
    .select("role,status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requester?.role !== "admin" || requester.status !== "active") {
    return json(403, { error: "Apenas gestores ativos podem consultar localizações." });
  }

  let payload: LocationPayload;
  try {
    payload = (await request.json()) as LocationPayload;
  } catch {
    return json(400, { error: "Corpo da requisição inválido." });
  }

  const unitId = Number(payload.unitId);
  const collaboratorId = textValue(payload.collaboratorId);
  const startDate = textValue(payload.startDate) ?? "";
  const endDate = textValue(payload.endDate) ?? "";
  if (!ALLOWED_UNITS.has(unitId) || !collaboratorId || !validPeriod(startDate, endDate)) {
    return json(400, { error: "Colaborador, unidade ou período inválido. O limite é 60 dias." });
  }

  const { data: person, error: personError } = await adminClient
    .from("quark_people")
    .select("unit_id,collaborator_id")
    .eq("unit_id", unitId)
    .eq("collaborator_id", collaboratorId)
    .maybeSingle();
  if (personError) return json(500, { error: "Não foi possível validar o colaborador." });
  if (!person) return json(404, { error: "Colaborador não encontrado no cadastro Quark." });

  try {
    const url = new URL(
      `${QUARK_BASE_URL}/v1/pontos/colaborador/${encodeURIComponent(collaboratorId)}`,
    );
    url.searchParams.set("inicio", apiDate(startDate));
    url.searchParams.set("fim", apiDate(endDate));

    const response = await quarkRequest(url, quarkToken, unitId);
    const rawRows = extractPointRows(response);
    const rows = rawRows
      .map((point, index) => normalizePoint(point, unitId, collaboratorId, index))
      .filter((point): point is JsonRecord => point !== null)
      .filter((point) => {
        const date = String(point["work_date"] ?? "");
        return date >= startDate && date <= endDate;
      });

    const { error: deleteError } = await adminClient
      .from("quark_punches")
      .delete()
      .eq("unit_id", unitId)
      .eq("collaborator_id", collaboratorId)
      .gte("work_date", startDate)
      .lte("work_date", endDate);
    if (deleteError) throw deleteError;

    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      const { error } = await adminClient
        .from("quark_punches")
        .upsert(chunk, { onConflict: "point_id" });
      if (error) throw error;
    }

    return json(200, {
      ok: true,
      unitId,
      collaboratorId,
      startDate,
      endDate,
      punches: rows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao consultar as localizações do Quark.";
    return json(502, { error: message.slice(0, 1000) });
  }
});
