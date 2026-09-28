import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const QUARK_BASE_URL = "https://api.quark.tec.br/rh/ext";
const PAGE_SIZE = 50;
const MAX_PAGES = 300;
const COLLABORATOR_PAGE_SIZE = 100;
const MAX_COLLABORATOR_PAGES = 100;
const MAX_PERIOD_DAYS = 60;

const UNITS = [
  { id: 9417839, name: "VNA TELECOM LTDA - NATAL", city: "Natal" },
  { id: 9417838, name: "VNA TELECOM LTDA - Mossoro", city: "Mossoró" },
  { id: 9417837, name: "RDT TELECOM LTDA - RECIFE", city: "Recife" },
  { id: 9417836, name: "RDT TELECOM LTDA - FORTALEZA", city: "Fortaleza" },
  { id: 9417834, name: "DMV DINIZ - RECIFE", city: "Recife" },
  { id: 9338112, name: "DMV DINIZ-NATAL", city: "Natal" },
] as const;

type JsonRecord = Record<string, unknown>;

interface SyncPayload {
  startDate?: string;
  endDate?: string;
}

interface QuarkUnit {
  id: number;
  name: string;
  city: string;
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

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = textValue(value)?.toLocaleLowerCase("pt-BR");
  if (["true", "sim", "s", "1", "ativo"].includes(normalized ?? "")) return true;
  if (["false", "não", "nao", "n", "0", "inativo"].includes(normalized ?? "")) return false;
  return fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function durationMinutes(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = String(value).trim();
  if (!raw) return 0;
  const sign = raw.startsWith("-") ? -1 : 1;
  const clean = raw.replace(/^[+-]/, "");
  const match = clean.match(/^(?:(\d+)\.)?(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (match) {
    const days = Number(match[1] ?? 0);
    const hours = Number(match[2] ?? 0);
    const minutes = Number(match[3] ?? 0);
    return sign * (days * 1440 + hours * 60 + minutes);
  }
  const numeric = Number(clean.replace(",", "."));
  return Number.isFinite(numeric) ? sign * Math.round(numeric) : 0;
}

function isoDate(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function apiDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

function extractCollaborators(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload))
    return payload.map(asRecord).filter((item) => Object.keys(item).length);
  const record = asRecord(payload);
  for (const key of [
    "colaboradores",
    "registros",
    "items",
    "content",
    "dados",
    "data",
    "results",
    "result",
    "records",
    "lista",
  ]) {
    const candidate = record[key];
    if (Array.isArray(candidate))
      return candidate.map(asRecord).filter((item) => Object.keys(item).length);
    if (candidate && typeof candidate === "object") {
      const nested = extractCollaborators(candidate);
      if (nested.length) return nested;
    }
  }
  return [];
}

function extractTotalPages(payload: unknown): number | null {
  const record = asRecord(payload);
  for (const [key, value] of Object.entries(record)) {
    if (["totalpaginas", "totalpages", "quantidadepaginas", "pages"].includes(key.toLowerCase())) {
      const number = numberValue(value);
      if (number !== null && number >= 1) return Math.trunc(number);
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = extractTotalPages(value);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function collaboratorFingerprint(item: JsonRecord): string {
  const collaborator = asRecord(item["colaborador"]);
  return String(collaborator["id"] ?? item["id"] ?? JSON.stringify(item).slice(0, 500));
}

function collaboratorListFingerprint(item: JsonRecord): string {
  const collaborator = asRecord(item["colaborador"]);
  return String(
    collaborator["id"] ??
      item["id"] ??
      item["colaboradorId"] ??
      item["colaborador_id"] ??
      JSON.stringify(item).slice(0, 500),
  );
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
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(lastError);
}

async function fetchAllCollaborators(unit: QuarkUnit, token: string): Promise<JsonRecord[]> {
  const all: JsonRecord[] = [];
  const fingerprints = new Set<string>();
  const firstUrl = new URL(`${QUARK_BASE_URL}/v1/colaboradores/`);
  const firstResponse = await quarkRequest(firstUrl, token, unit.id);
  const firstRows = extractCollaborators(firstResponse);

  for (const row of firstRows) {
    const fingerprint = collaboratorListFingerprint(row);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    all.push(row);
  }

  if (firstRows.length < COLLABORATOR_PAGE_SIZE) return all;

  // O endpoint /v1/colaboradores/ usa page + page_size iniciando em 1.
  // A primeira chamada sem parâmetros corresponde à página 1.
  for (let page = 2; page <= MAX_COLLABORATOR_PAGES; page += 1) {
    const url = new URL(`${QUARK_BASE_URL}/v1/colaboradores/`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(COLLABORATOR_PAGE_SIZE));
    const response = await quarkRequest(url, token, unit.id);
    const rows = extractCollaborators(response);
    if (!rows.length) break;

    let added = 0;
    for (const row of rows) {
      const fingerprint = collaboratorListFingerprint(row);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      all.push(row);
      added += 1;
    }

    if (!added || rows.length < COLLABORATOR_PAGE_SIZE) break;
    if (page === MAX_COLLABORATOR_PAGES) {
      throw new Error("A paginação de colaboradores atingiu o limite de segurança.");
    }
  }

  return all;
}

function normalizeCollaboratorPeople(unit: QuarkUnit, rows: JsonRecord[]): JsonRecord[] {
  const now = new Date().toISOString();
  const people: JsonRecord[] = [];

  for (const raw of rows) {
    const nested = asRecord(raw["colaborador"]);
    const person = Object.keys(nested).length ? nested : raw;
    const collaboratorId = textValue(
      person["id"] ?? person["colaboradorId"] ?? person["colaborador_id"],
    );
    const fullName = textValue(
      person["nome"] ?? person["nomeCompleto"] ?? person["fullName"] ?? person["full_name"],
    );
    if (!collaboratorId || !fullName) continue;

    people.push({
      unit_id: unit.id,
      collaborator_id: collaboratorId,
      unit_name: unit.name,
      unit_city: unit.city,
      full_name: fullName,
      registration: textValue(person["matricula"] ?? person["registration"]),
      job_title: textValue(
        person["cargoDenominacao"] ?? person["cargo"] ?? person["jobTitle"] ?? person["job_title"],
      ),
      job_link_title: textValue(
        person["cargoVinculoDenominacao"] ?? person["vinculo"] ?? person["jobLinkTitle"],
      ),
      api_sector: textValue(
        person["setorDenominacao"] ?? person["setor"] ?? person["sector"] ?? person["api_sector"],
      ),
      admission_date: isoDate(
        person["dataAdmissaoFormatada"] ?? person["dataAdmissao"] ?? person["admissionDate"],
      ),
      is_active: boolValue(person["ativo"] ?? person["active"], true),
      is_esocial: boolValue(person["eletronicoSocial"] ?? person["esocial"]),
      last_seen_at: now,
    });
  }

  return people;
}

async function fetchMirror(unit: QuarkUnit, startDate: string, endDate: string, token: string) {
  const all: JsonRecord[] = [];
  const fingerprints = new Set<string>();
  let totalPages: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${QUARK_BASE_URL}/v1/frequencias/espelho-ponto`);
    url.searchParams.set("dataInicio", apiDate(startDate));
    url.searchParams.set("dataFim", apiDate(endDate));
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));
    const response = await quarkRequest(url, token, unit.id);
    const rows = extractCollaborators(response);
    if (page === 0) totalPages = extractTotalPages(response);
    if (!rows.length) break;

    let added = 0;
    for (const row of rows) {
      const fingerprint = collaboratorFingerprint(row);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      all.push(row);
      added += 1;
    }
    if (!added || rows.length < PAGE_SIZE || (totalPages !== null && page + 1 >= totalPages)) break;
    if (page === MAX_PAGES - 1)
      throw new Error("A paginação do Quark atingiu o limite de segurança.");
  }
  return all;
}

function parsePunchTimestamp(value: unknown, workDate: string, time: string | null): string | null {
  const raw = textValue(value);
  if (raw && /^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  if (raw) {
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match)
      return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6] ?? "00"}-03:00`;
  }
  return time ? `${workDate}T${time.length === 5 ? `${time}:00` : time}-03:00` : null;
}

function normalizeUnitRows(unit: QuarkUnit, rows: JsonRecord[]) {
  const people: JsonRecord[] = [];
  const days: JsonRecord[] = [];
  const punches: JsonRecord[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const person = asRecord(row["colaborador"]);
    const collaboratorId = textValue(person["id"] ?? row["colaboradorId"] ?? row["id"]);
    const fullName = textValue(person["nome"] ?? row["nome"]);
    if (!collaboratorId || !fullName) continue;
    const totals = asRecord(row["totais"]);

    people.push({
      unit_id: unit.id,
      collaborator_id: collaboratorId,
      unit_name: unit.name,
      unit_city: unit.city,
      full_name: fullName,
      registration: textValue(person["matricula"]),
      job_title: textValue(person["cargoDenominacao"]),
      job_link_title: textValue(person["cargoVinculoDenominacao"]),
      api_sector: textValue(person["setorDenominacao"]),
      admission_date: isoDate(person["dataAdmissaoFormatada"]),
      is_active: boolValue(person["ativo"], true),
      is_esocial: boolValue(person["eletronicoSocial"]),
      last_seen_at: now,
    });

    const rawDays = Array.isArray(row["dias"]) ? row["dias"] : [];
    for (const rawDay of rawDays) {
      const day = asRecord(rawDay);
      const workDate = isoDate(day["dia"] ?? day["data"]);
      if (!workDate) continue;
      const journey = asRecord(day["jornada"]);
      const treatments = Array.isArray(day["tratamentos"]) ? day["tratamentos"].map(asRecord) : [];
      const discountType = textValue(day["tipoDesconto"]) ?? "";
      const absence = durationMinutes(day["horasAusencia"]);
      const treatmentText = treatments
        .map((item) => Object.values(item).join(" "))
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      const excused = /abon|justific/.test(`${discountType} ${treatmentText}`) ? absence : 0;
      const unexcused = absence > 0 && excused === 0 ? absence : 0;

      days.push({
        unit_id: unit.id,
        collaborator_id: collaboratorId,
        work_date: workDate,
        weekday: textValue(day["diaSemana"]),
        journey: textValue(journey["formatada"] ?? day["jornada"]),
        is_day_off: boolValue(journey["folga"]),
        scheduled_minutes: durationMinutes(day["horasJornada"]),
        worked_minutes: durationMinutes(day["horasTrabalhadas"]),
        normal_extra_minutes: durationMinutes(day["horasExtrasNormais"]),
        night_extra_minutes: durationMinutes(day["horasExtrasNoturnas"]),
        extra_100_minutes: durationMinutes(day["horasExtras100"]),
        absence_minutes: absence,
        excused_absence_minutes: excused,
        unexcused_absence_minutes: unexcused,
        late_minutes: /atras/.test(treatmentText) ? durationMinutes(day["horasAusencia"]) : 0,
        // Movimento do banco no dia. O painel soma estes valores dentro
        // do período selecionado para obter o saldo do colaborador no recorte.
        bank_balance_minutes: durationMinutes(day["saldoBancoHoras"]),
        bank_operation: textValue(day["operacaoBancoHoras"]),
        observation: textValue(day["observacoes"]),
        bank_status: textValue(row["statusBancoHoras"] ?? totals["statusBancoHoras"]),
        bank_processed_until: isoDate(
          row["dataFinalSaldoAcumulado"] ?? row["dataFimProcessamento"],
        ),
      });

      const rawPunches = Array.isArray(day["pontos"]) ? day["pontos"] : [];
      rawPunches.forEach((rawPunch, index) => {
        const punch = asRecord(rawPunch);
        const time = textValue(punch["hora"]);
        const pointId =
          textValue(punch["id"]) ??
          `${unit.id}:${collaboratorId}:${workDate}:${time ?? index}:${index}`;
        punches.push({
          point_id: pointId,
          unit_id: unit.id,
          collaborator_id: collaboratorId,
          work_date: workDate,
          punched_at: parsePunchTimestamp(punch["dataHora"], workDate, time),
          punch_time: time,
          location: textValue(punch["localizacao"]),
          latitude: numberValue(punch["latitude"]),
          longitude: numberValue(punch["longitude"]),
          observation: textValue(punch["observacao"] ?? punch["motivoAlteracaoPonto"]),
          record_type: textValue(punch["tipoRegistroPonto"] ?? punch["tipoTratamento"]),
          is_offline: boolValue(punch["pontoOffline"]),
          is_out_of_tolerance: boolValue(punch["foraToleranciaHorario"]),
          is_active: boolValue(punch["ativo"], true),
        });
      });
    }
  }

  return { people, days, punches };
}

async function upsertChunks(
  client: ReturnType<typeof createClient>,
  table: string,
  rows: JsonRecord[],
  onConflict: string,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
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
  if (!quarkToken)
    return json(503, { error: "A credencial da API Quark ainda não foi configurada." });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Sessão inválida" });
  const { data: requester } = await adminClient
    .from("profiles")
    .select("role,status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requester?.role !== "admin" || requester.status !== "active") {
    return json(403, { error: "Apenas gestores ativos podem atualizar o Quark." });
  }

  let payload: SyncPayload;
  try {
    payload = (await request.json()) as SyncPayload;
  } catch {
    return json(400, { error: "Corpo da requisição inválido." });
  }
  const startDate = payload.startDate ?? "";
  const endDate = payload.endDate ?? "";
  if (!validPeriod(startDate, endDate)) {
    return json(400, { error: "Informe um período válido de até 60 dias." });
  }

  const { data: run, error: runError } = await adminClient
    .from("quark_sync_runs")
    .insert({ requested_by: authData.user.id, period_start: startDate, period_end: endDate })
    .select("id")
    .single();
  if (runError || !run) return json(500, { error: "Não foi possível iniciar a atualização." });

  const counters = { units: 0, people: 0, days: 0, punches: 0 };
  try {
    for (const unit of UNITS) {
      // Cadastro completo da unidade: não depende de o colaborador possuir
      // batidas no período selecionado.
      const collaboratorRows = await fetchAllCollaborators(unit, quarkToken);
      const collaboratorPeople = normalizeCollaboratorPeople(unit, collaboratorRows);
      await upsertChunks(
        adminClient,
        "quark_people",
        collaboratorPeople,
        "unit_id,collaborator_id",
      );

      // Espelho: alimenta horas, ocorrências e batidas do período e também
      // enriquece o cadastro com cargo/setor quando disponível.
      const rows = await fetchMirror(unit, startDate, endDate, quarkToken);
      const normalized = normalizeUnitRows(unit, rows);
      await upsertChunks(adminClient, "quark_people", normalized.people, "unit_id,collaborator_id");
      await upsertChunks(
        adminClient,
        "quark_daily_records",
        normalized.days,
        "unit_id,collaborator_id,work_date",
      );
      await upsertChunks(adminClient, "quark_punches", normalized.punches, "point_id");
      counters.units += 1;
      counters.people += collaboratorPeople.length;
      counters.days += normalized.days.length;
      counters.punches += normalized.punches.length;
    }

    const { error } = await adminClient
      .from("quark_sync_runs")
      .update({
        status: "success",
        units_processed: counters.units,
        people_processed: counters.people,
        days_processed: counters.days,
        punches_processed: counters.punches,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (error) throw error;
    return json(200, { ok: true, runId: run.id, ...counters });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao atualizar os dados do Quark.";
    await adminClient
      .from("quark_sync_runs")
      .update({
        status: "error",
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return json(502, { error: message, runId: run.id });
  }
});
