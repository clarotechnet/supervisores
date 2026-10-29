import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  requireScheduleManagement,
  ScheduleScopeForbidden,
} from "../_shared/schedule-scope-access.ts";
import {
  loadScheduleSources,
  googleAccessToken,
  googleJson,
  sheetRows,
  findScheduleCell,
  sourceSpreadsheet,
  mergeSheets,
  parseOfficialMonthTab,
} from "../_shared/schedule-google-source.ts";
import {
  parseControlMonthTab,
  usesControlMaster,
  CONTROL_EXPECTED_MASTER_ID,
  controlMonthTabName,
} from "../_shared/schedule-operational-master.ts";
import type { Payload } from "../_shared/schedule-operational.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Content-Type": "application/json",
};
const json = (status: number, value: Record<string, unknown>) =>
  new Response(JSON.stringify(value), { status, headers: CORS });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json(405, { error: "Método não permitido." });
  const authorization = request.headers.get("Authorization"),
    url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !key) return json(401, { error: "Sessão necessária." });
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ""),
  );
  if (authError || !auth.user) return json(401, { error: "Sessão inválida." });
  const { data: profile } = await admin
    .from("profiles")
    .select("role,status")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active" || !["admin", "supervisor"].includes(profile.role))
    return json(403, { error: "Apenas gestores ativos podem editar escalas." });
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "Corpo inválido." });
  }
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    typeof input.scheduleId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(input.scheduleId) ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    typeof input.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    typeof input.code !== "string" ||
    typeof input.expectedCode !== "string" ||
    input.code.trim().length > 80 ||
    /[<>\r\n]/.test(input.code)
  )
    return json(400, { error: "Pessoa, data ou código inválido." });
  let auditId: string | undefined,
    writeAttempted = false,
    sheetWritten = false;
  try {
    const { data: schedule, error: lookupError } = await admin
      .from("schedule_uploads")
      .select("*")
      .eq("id", input.scheduleId)
      .maybeSingle();
    if (lookupError || !schedule) return json(404, { error: "Escala não encontrada." });
    requireScheduleManagement(profile.role, schedule.sector);
    if (!schedule.source_file.startsWith("Google Sheets"))
      return json(409, {
        error:
          "Esta escala não está vinculada ao Sheets oficial. Atualize via API antes de editar.",
      });
    if (input.date.slice(0, 7) !== schedule.schedule_month.slice(0, 7))
      return json(400, { error: "Data fora da competência selecionada." });
    const cached = schedule.payload as Payload;
    const person = cached.people.find((p) => p.name === input.name);
    if (!person || !cached.dates.includes(input.date))
      return json(409, { error: "Pessoa/data ausente da escala. Atualize via API." });
    const token = await googleAccessToken(),
      official = schedule.source_file === "Google Sheets - Escala operacional oficial";
    let linked: Record<string, unknown> | null = null;
    let sources = await loadScheduleSources(
      schedule.city,
      schedule.sector,
      schedule.schedule_month,
      token,
    );
    if (official) {
      const { data: draft, error: draftError } = await admin
        .from("schedule_generation_drafts")
        .select("id")
        .eq("city", schedule.city)
        .eq("sector", schedule.sector)
        .eq("schedule_month", schedule.schedule_month)
        .eq("status", "approved")
        .is("archived_at", null)
        .contains("policy_snapshot", { published: true, officialScheduleId: schedule.id })
        .maybeSingle();
      if (draftError || !draft) throw Error("Versão oficial vinculada não encontrada.");
      const { data: sheet, error: sheetError } = await admin
        .from("schedule_operational_sheets")
        .select("*")
        .eq("draft_id", draft.id)
        .eq("city", schedule.city)
        .eq("sector", schedule.sector)
        .eq("schedule_month", schedule.schedule_month)
        .eq("sheet_tab", schedule.source_sheet)
        .maybeSingle();
      if (sheetError || !sheet) throw Error("Aba oficial vinculada não encontrada.");
      if (sheet.deleted_at || sheet.deletion_requested_at)
        return json(409, {
          error: "Esta escala está excluída ou em exclusão. Conclua a exclusão antes de editar.",
        });
      linked = sheet;
      const expected = usesControlMaster(schedule.city, schedule.sector)
        ? CONTROL_EXPECTED_MASTER_ID
        : sourceSpreadsheet(schedule.city, schedule.sector);
      if (sheet.spreadsheet_id !== expected || sheet.sheet_tab === "ATUALIZADA")
        throw Error("O vínculo não aponta para o Sheets oficial.");
      const rows = await sheetRows(sheet.spreadsheet_id, sheet.sheet_tab, token);
      sources = [
        {
          spreadsheetId: sheet.spreadsheet_id,
          title: sheet.sheet_tab,
          sourceLabel: "Oficial",
          gridId: -1,
          rows,
          parsed: { title: sheet.sheet_tab, ...cached },
        },
      ];
    } else if (
      sources
        .map((s) => s.title)
        .join(" | ")
        .slice(0, 255) !== schedule.source_sheet
    )
      throw Error("As abas da origem mudaram. Atualize via API antes de editar.");
    const candidates = sources.flatMap((source) => {
      if (!official && !source.parsed.people.some((p) => p.name === person.name)) return [];
      return [
        {
          source,
          cell: findScheduleCell(
            source.rows,
            schedule.schedule_month.slice(0, 7),
            person.name,
            person.login || "",
            input.date as string,
          ),
        },
      ];
    });
    if (candidates.length !== 1)
      throw Error("Não foi encontrada uma única célula oficial para esta pessoa/data.");
    const { source, cell } = candidates[0]!,
      nextCode = input.code.trim();
    if (cell.code !== input.expectedCode.trim())
      return json(409, {
        error: "Esta célula já mudou no Sheets. Atualize via API e revise o valor antes de salvar.",
      });
    const range = "'" + source.title.replace(/'/g, "''") + "'!" + cell.a1;
    const cellUrl =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      source.spreadsheetId +
      "/values/" +
      encodeURIComponent(range);
    const formula = (await googleJson(cellUrl + "?valueRenderOption=FORMULA", token)) as {
      values?: unknown[][];
    };
    if (typeof formula.values?.[0]?.[0] === "string" && formula.values[0][0].startsWith("="))
      throw Error("Esta célula contém fórmula e não pode ser substituída pelo editor.");
    if (String(formula.values?.[0]?.[0] ?? "").trim() !== cell.code)
      return json(409, {
        error: "Esta célula mudou durante a revisão. Atualize via API antes de salvar.",
      });
    if (cell.code === nextCode)
      return json(200, { ok: true, unchanged: true, sheetWritten: false });
    const { data: audit, error: auditError } = await admin
      .from("schedule_sheet_edits")
      .insert({
        schedule_upload_id: schedule.id,
        actor_id: auth.user.id,
        city: schedule.city,
        sector: schedule.sector,
        schedule_month: schedule.schedule_month,
        spreadsheet_id: source.spreadsheetId,
        sheet_tab: source.title,
        cell_a1: cell.a1,
        employee_name: person.name,
        duty_date: input.date,
        previous_code: cell.code,
        current_code: nextCode,
      })
      .select("id")
      .single();
    if (auditError || !audit)
      throw Error(
        "Não foi possível registrar a edição. Confira a migration de edição oficial; nenhuma célula foi gravada.",
      );
    auditId = audit.id;
    writeAttempted = true;
    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        source.spreadsheetId +
        "/values:batchUpdate",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "RAW", data: [{ range, values: [[nextCode]] }] }),
      },
    );
    if (!response.ok)
      throw Error(
        "Google recusou a gravação (" + response.status + "). Atualize via API para conferir.",
      );
    sheetWritten = true;
    const verified = (await googleJson(
      cellUrl + "?valueRenderOption=UNFORMATTED_VALUE",
      token,
    )) as { values?: unknown[][] };
    if (String(verified.values?.[0]?.[0] ?? "").trim() !== nextCode)
      throw Error("O Sheets mudou durante a edição. Atualize via API para conferir.");
    const { error: writtenError } = await admin
      .from("schedule_sheet_edits")
      .update({ status: "sheet_written" })
      .eq("id", auditId);
    if (writtenError)
      throw Error("Gravação feita no Sheets; o estado da auditoria precisa ser reconciliado.");
    if (linked) {
      const rows = await sheetRows(source.spreadsheetId, source.title, token);
      const planned = linked.planned_payload as Payload,
        previous = linked.current_payload as Payload;
      const result = usesControlMaster(schedule.city, schedule.sector)
        ? parseControlMonthTab(rows, planned, previous, schedule.schedule_month)
        : parseOfficialMonthTab(rows, planned, previous, schedule.schedule_month);
      const { error: syncError } = await admin.rpc("schedule_operational_apply_sync", {
        p_sheet_id: linked.id,
        p_expected_updated_at: linked.updated_at,
        p_actor_id: auth.user.id,
        p_payload: result.payload,
        p_changes: result.changes,
      });
      if (syncError)
        throw Error("Sheets gravado, mas a sincronização falhou: " + syncError.message);
    } else {
      const refreshed = await loadScheduleSources(
        schedule.city,
        schedule.sector,
        schedule.schedule_month,
        token,
      );
      if (
        refreshed
          .map((s) => s.title)
          .join(" | ")
          .slice(0, 255) !== schedule.source_sheet
      )
        throw Error("Origem mudou durante a edição. Atualize via API.");
      const merged = mergeSheets(refreshed.map((s) => s.parsed));
      const { error: syncError } = await admin
        .from("schedule_uploads")
        .update({
          payload: { dates: merged.dates, people: merged.people, codes: merged.codes },
          employee_count: merged.people.length,
          entry_count: merged.entryCount,
          imported_by: auth.user.id,
          imported_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);
      if (syncError)
        throw Error("Sheets gravado, mas o painel não foi sincronizado: " + syncError.message);
    }
    const { error: completeError } = await admin
      .from("schedule_sheet_edits")
      .update({ status: "applied", completed_at: new Date().toISOString() })
      .eq("id", auditId);
    if (completeError)
      throw Error("Sheets e painel atualizados; finalização da auditoria pendente.");
    return json(200, { ok: true, sheetWritten: true, audited: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao editar escala.";
    if (auditId)
      await admin
        .from("schedule_sheet_edits")
        .update({
          status: sheetWritten ? "sheet_written" : writeAttempted ? "unconfirmed" : "failed",
          error_message: message.slice(0, 1000),
        })
        .eq("id", auditId);
    return json(error instanceof ScheduleScopeForbidden ? 403 : sheetWritten ? 502 : 409, {
      error: message,
      sheetWritten,
      writeAttempted,
    });
  }
});
