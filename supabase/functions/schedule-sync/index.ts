import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  requireScheduleManagement,
  ScheduleScopeForbidden,
} from "../_shared/schedule-scope-access.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

import {
  CITY_SOURCES,
  CITY_FRONTS,
  FRONT_LABELS,
  text,
  googleAccessToken,
  loadScheduleSources,
  mergeSheets,
} from "../_shared/schedule-google-source.ts";
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
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

  if (!body || typeof body !== "object") return json(400, { error: "Corpo inválido." });
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
    requireScheduleManagement(requester!.role, frontSlug);
    const token = await googleAccessToken();
    const sources = await loadScheduleSources(city, frontSlug, expectedPeriod, token);
    const parsedSheets = sources.map((source) => source.parsed);
    const sourceLabels = new Set(sources.map((source) => source.sourceLabel));

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
    if (error instanceof ScheduleScopeForbidden) return json(403, { error: error.message });
    const message = error instanceof Error ? error.message : "Falha ao sincronizar as escalas.";
    return json(502, { error: message.slice(0, 1000) });
  }
});
