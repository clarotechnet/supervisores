import { analyzeSchedule, type AnalysisRule } from "../_shared/schedule-ai-analysis.ts";
import {
  deleteOperationalMonth,
  inspectOperationalMonth,
  ScheduleDeletionError,
} from "../_shared/schedule-month-delete.ts";
import {
  sourceSpreadsheet,
  officialMonthTitle,
  officialMonthValues,
  parseOfficialMonthTab,
  loadScheduleSources,
  googleAccessToken,
} from "../_shared/schedule-google-source.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  requireScheduleManagement,
  ScheduleScopeForbidden,
} from "../_shared/schedule-scope-access.ts";
import {
  operationalFromDraft,
  operationalValues,
  operationalFormattedValues,
  parseUpdatedSheet,
  type Payload,
} from "../_shared/schedule-operational.ts";
import { operationalSheetFormatting } from "../_shared/schedule-operational-format.ts";
import {
  CONTROL_EXPECTED_MASTER_ID,
  controlTemplateTab,
  usesControlMaster,
  controlMonthTabName,
  controlMonthValues,
  parseControlMonthTab,
  readControlMonthSource,
  controlMonthFormatting,
} from "../_shared/schedule-operational-master.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (status: number, value: Record<string, unknown>) =>
  new Response(JSON.stringify(value), { status, headers: CORS });
const validUuid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

async function googleToken() {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID");
  const client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refresh_token = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!client_id || !client_secret || !refresh_token)
    throw Error("Credenciais do Google indisponíveis na Edge Function.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token)
    throw Error(body.error_description || "Não foi possível renovar a autenticação Google.");
  return body.access_token;
}
async function googleJson(url: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw Error("Google Sheets (" + response.status + "): " + details);
  }
  return await response.json();
}
const tabUrl = (spreadsheetId: string, tab: string) =>
  "https://sheets.googleapis.com/v4/spreadsheets/" +
  encodeURIComponent(spreadsheetId) +
  "/values/" +
  encodeURIComponent("'" + tab.replace(/'/g, "''") + "'");
const arrays = (value: unknown): unknown[][] =>
  Array.isArray(value) ? (value as unknown[][]) : [];
const title = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, " ").slice(0, 60);
function snapshot(draft: { payload: unknown; policy_snapshot: unknown }): Payload {
  const p = draft.payload as Payload;
  const raw = (draft.policy_snapshot || {}) as Record<string, unknown>;
  const outside = raw["outsideAssignments"];
  return operationalFromDraft(
    p,
    arrays(raw["calendarWeeks"]) as string[][],
    Array.isArray(outside) ? (outside as Record<string, string>[]) : [],
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supabaseUrl || !serviceKey || !bearer) return json(401, { error: "Sessão não informada." });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(bearer);
  if (authError || !user) return json(401, { error: "Sessão inválida." });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profileError ||
    profile?.status !== "active" ||
    !["admin", "supervisor"].includes(profile.role)
  )
    return json(403, {
      error: "Somente administradores ou supervisores ativos podem gerenciar planilhas.",
    });

  let params: {
    action?: string;
    draftId?: string;
    sheetId?: string;
    scheduleId?: string;
    confirmation?: string;
    confirmedGridId?: number;
    expectedUpdatedAt?: string;
  };
  try {
    params = await req.json();
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
  if (!params || typeof params !== "object") return json(400, { error: "Requisição inválida." });
  const action = params.action;
  if (!["create", "sync", "publish", "delete", "inspect_delete", "read"].includes(action || ""))
    return json(400, { error: "Ação desconhecida." });
  if (
    (action === "publish" || action === "delete" || action === "inspect_delete") &&
    profile.role !== "admin"
  )
    return json(403, {
      error: "Apenas administrador pode aprovar/publicar ou excluir uma escala oficial.",
    });
  if (action === "create" && !validUuid(params.draftId))
    return json(400, { error: "Rascunho inválido." });
  if (
    (action === "sync" ||
      action === "publish" ||
      action === "delete" ||
      action === "inspect_delete" ||
      action === "read") &&
    !validUuid(params.sheetId)
  )
    return json(400, { error: "Planilha operacional inválida." });
  if (action === "publish" && params.draftId !== undefined && !validUuid(params.draftId))
    return json(400, { error: "Versão selecionada inválida." });

  if (
    action === "delete" &&
    (!validUuid(params.scheduleId) ||
      typeof params.confirmation !== "string" ||
      params.confirmation.length > 60)
  )
    return json(400, { error: "Escala ou confirmação de exclusão inválida." });

  try {
    if (action === "create") {
      const { data: draft, error: draftError } = await admin
        .from("schedule_generation_drafts")
        .select(
          "id,city,sector,schedule_month,payload,policy_snapshot,created_by,status,archived_at",
        )
        .eq("id", params.draftId)
        .maybeSingle();
      if (draftError || !draft) return json(404, { error: "Rascunho não encontrado." });
      requireScheduleManagement(profile.role, draft.sector);
      if (draft.archived_at || !["draft", "approved"].includes(draft.status))
        return json(409, { error: "Rascunho rejeitado não pode virar escala operacional." });
      const { data: existing, error: existingError } = await admin
        .from("schedule_operational_sheets")
        .select("id,spreadsheet_url,sheet_tab,deleted_at,deletion_requested_at")
        .eq("draft_id", draft.id)
        .maybeSingle();
      if (existingError)
        return json(503, {
          error: "Estrutura de escalas indisponível. Confira as migrations antes de criar uma aba.",
        });
      if (existing?.deleted_at || existing?.deletion_requested_at)
        return json(409, {
          error: "Esta versão está excluída ou em exclusão. Gere e salve outra versão.",
        });
      if (existing) {
        if (existing.sheet_tab === "ATUALIZADA")
          return json(409, {
            error:
              "Esta versão usa um arquivo separado antigo. Use a aba do Sheets oficial; o registro antigo será mantido apenas como histórico.",
          });
        return json(200, {
          ok: true,
          existing: true,
          sheetId: existing.id,
          url: existing.spreadsheet_url,
        });
      }
      const baseline = usesControlMaster(draft.city, draft.sector)
        ? snapshot(draft)
        : (draft.payload as Payload);
      const token = await googleToken();
      if (usesControlMaster(draft.city, draft.sector)) {
        const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_RN_CONTROL_ID");
        if (!spreadsheetId || spreadsheetId !== CONTROL_EXPECTED_MASTER_ID)
          return json(409, {
            error:
              "GOOGLE_SHEETS_RN_CONTROL_ID deve apontar para a planilha original Escalas TechNET - RN Controle. Confira o Secret antes de prosseguir.",
          });
        // Verifica a migration ANTES de duplicar uma aba; nunca deixe
        // um artefato Google órfão porque o esquema SQL está desatualizado.
        const { error: schemaError } = await admin
          .from("schedule_operational_sheets")
          .select("sheet_tab")
          .limit(1);
        if (schemaError)
          return json(409, {
            error:
              "Execute a migration 20261028160000_schedule_operational_shared_workbook_tabs.sql antes de criar a aba mensal.",
          });
        const tab = controlMonthTabName(draft.schedule_month);
        const meta = (await googleJson(
          "https://sheets.googleapis.com/v4/spreadsheets/" +
            spreadsheetId +
            "?fields=spreadsheetId,sheets(properties(sheetId,title,index))",
          token,
        )) as { sheets?: Array<{ properties: { sheetId: number; title: string; index: number } }> };
        const previousTitle = controlTemplateTab(draft.schedule_month);
        const source = meta.sheets?.find((row) => row.properties.title === previousTitle);
        if (!source)
          return json(409, {
            error:
              "Não foi encontrada a aba anterior da competência. Crie primeiro a aba do mês anterior no arquivo Controle.",
          });
        if (meta.sheets?.some((row) => row.properties.title === tab))
          return json(409, {
            error:
              "A aba " +
              tab +
              " já existe no arquivo Controle. Edite e sincronize a aba atual, sem substituí-la.",
          });
        const created = (await googleJson(
          "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + ":batchUpdate",
          token,
          "POST",
          {
            requests: [
              {
                duplicateSheet: {
                  sourceSheetId: source.properties.sheetId,
                  insertSheetIndex: source.properties.index + 1,
                  newSheetName: tab,
                },
              },
            ],
          },
        )) as { replies?: Array<{ duplicateSheet?: { properties?: { sheetId?: number } } }> };
        const sheetGridId = created.replies?.[0]?.duplicateSheet?.properties?.sheetId;
        if (typeof sheetGridId !== "number")
          throw Error(
            "A aba pode ter sido duplicada no Google, mas não foi possível confirmar o ID. Verifique-a antes de tentar novamente.",
          );
        const range = "'" + tab.replace(/'/g, "''") + "'!A1";
        // Limpa SOMENTE os valores da cópia, nunca da aba original.
        await googleJson(
          "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values:batchClear",
          token,
          "POST",
          { ranges: ["'" + tab + "'!A1:AO1001"] },
        );
        await googleJson(
          "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values:batchUpdate",
          token,
          "POST",
          {
            valueInputOption: "RAW",
            data: [{ range, values: controlMonthValues(baseline, draft.schedule_month) }],
          },
        );
        let formatWarning: string | null = null;
        try {
          await googleJson(
            "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + ":batchUpdate",
            token,
            "POST",
            {
              requests: controlMonthFormatting(
                sheetGridId,
                baseline.people.length,
                baseline.dates.length,
                (() => {
                  const policy = (draft.policy_snapshot || {}) as {
                    rule?: { excludedFromDuty?: string[] };
                  };
                  const excluded = new Set(
                    (policy.rule?.excludedFromDuty || []).map((name) =>
                      name
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toUpperCase()
                        .trim(),
                    ),
                  );
                  return baseline.people.flatMap((person, i) =>
                    excluded.has(
                      person.name
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toUpperCase()
                        .trim(),
                    )
                      ? [i]
                      : [],
                  );
                })(),
              ),
            },
          );
        } catch (error) {
          formatWarning =
            "A aba foi criada; algumas cores/validações não foram aplicadas: " +
            (error instanceof Error ? error.message : "erro de formatação");
        }
        const url =
          "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/edit#gid=" + sheetGridId;
        const { data: saved, error: saveError } = await admin
          .from("schedule_operational_sheets")
          .insert({
            draft_id: draft.id,
            city: draft.city,
            sector: draft.sector,
            schedule_month: draft.schedule_month,
            spreadsheet_id: spreadsheetId,
            sheet_tab: tab,
            spreadsheet_url: url,
            planned_payload: baseline,
            current_payload: baseline,
            created_by: user.id,
            synced_by: user.id,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (saveError || !saved)
          return json(502, {
            error:
              "A aba foi criada no arquivo existente, mas o vínculo no Supabase falhou. Não clique novamente; informe este erro para recuperar a aba: " +
              (saveError?.message || "sem ID"),
            url,
          });
        return json(200, {
          ok: true,
          existing: false,
          sheetId: saved.id,
          url,
          tab,
          ...(formatWarning ? { warning: formatWarning } : {}),
        });
      }

      const spreadsheetId = sourceSpreadsheet(draft.city, draft.sector);
      if (!spreadsheetId)
        return json(409, { error: "Sheets oficial não configurado para esta cidade/frente." });
      const current = await loadScheduleSources(
        draft.city,
        draft.sector,
        draft.schedule_month,
        token,
      );
      if (current.length)
        return json(409, {
          error:
            "Já existe aba oficial para este mês. Edite a escala existente; não será criada outra cópia.",
        });
      const tab = officialMonthTitle(draft.sector, draft.schedule_month);
      const meta = (await googleJson(
        "https://sheets.googleapis.com/v4/spreadsheets/" +
          spreadsheetId +
          "?fields=sheets(properties(title))",
        token,
      )) as { sheets?: Array<{ properties: { title: string } }> };
      if (meta.sheets?.some((s) => s.properties.title === tab))
        return json(409, {
          error: "A aba mensal já existe. Verifique seu vínculo antes de tentar novamente.",
        });
      const created = (await googleJson(
        "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + ":batchUpdate",
        token,
        "POST",
        {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tab,
                  gridProperties: {
                    rowCount: Math.max(120, baseline.people.length + 2),
                    columnCount: Math.max(40, baseline.dates.length + 3),
                    frozenRowCount: 2,
                    frozenColumnCount: 3,
                  },
                },
              },
            },
          ],
        },
      )) as { replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }> };
      const gridId = created.replies?.[0]?.addSheet?.properties?.sheetId;
      if (typeof gridId !== "number")
        throw Error("Não foi possível confirmar a nova aba. Verifique o Sheets antes de repetir.");
      await googleJson(
        "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values:batchUpdate",
        token,
        "POST",
        {
          valueInputOption: "RAW",
          data: [
            {
              range: "'" + tab.replace(/'/g, "''") + "'!A1",
              values: officialMonthValues(baseline, draft.schedule_month),
            },
          ],
        },
      );
      const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/edit#gid=" + gridId;
      const { data: saved, error: saveError } = await admin
        .from("schedule_operational_sheets")
        .insert({
          draft_id: draft.id,
          city: draft.city,
          sector: draft.sector,
          schedule_month: draft.schedule_month,
          spreadsheet_id: spreadsheetId,
          sheet_tab: tab,
          spreadsheet_url: url,
          planned_payload: baseline,
          current_payload: baseline,
          created_by: user.id,
          synced_by: user.id,
          last_synced_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (saveError || !saved)
        return json(502, {
          error:
            "A aba foi criada no Sheets oficial, mas o vínculo falhou. Recupere esta aba sem criar outra: " +
            (saveError?.message || "sem ID"),
          url,
        });
      return json(200, { ok: true, existing: false, sheetId: saved.id, url, tab });
    }
    const { data: sheet, error: lookupError } = await admin
      .from("schedule_operational_sheets")
      .select("*")
      .eq("id", params.sheetId)
      .maybeSingle();
    if (lookupError || !sheet) return json(404, { error: "Planilha operacional não encontrada." });
    requireScheduleManagement(profile.role, sheet.sector);

    const controlMaster = usesControlMaster(sheet.city, sheet.sector);
    if (action === "delete" || action === "inspect_delete") {
      const token = await googleToken();
      const deletionInput = {
        sheet,
        actorId: user.id,
        scheduleId: params.scheduleId,
        confirmation: params.confirmation,
        expectedSpreadsheet: controlMaster
          ? CONTROL_EXPECTED_MASTER_ID
          : sourceSpreadsheet(sheet.city, sheet.sector),
        expectedTab: controlMaster
          ? controlMonthTabName(sheet.schedule_month)
          : officialMonthTitle(sheet.sector, sheet.schedule_month),
        rpc: async (name: string, args: Record<string, unknown>) => await admin.rpc(name, args),
        google: (url: string, method?: string, body?: unknown) =>
          googleJson(url, token, method, body),
        confirmedGridId: params.confirmedGridId,
        expectedUpdatedAt: params.expectedUpdatedAt,
        validateSnapshot: (values: unknown[][]) => {
          (controlMaster ? readControlMonthSource : parseOfficialMonthTab)(
            values,
            sheet.planned_payload as Payload,
            sheet.current_payload as Payload,
            sheet.schedule_month,
          );
        },
      };
      if (action === "inspect_delete")
        return json(200, { ok: true, ...(await inspectOperationalMonth(deletionInput)) });
      const deleted = await deleteOperationalMonth(deletionInput);
      return json(200, { ok: true, ...deleted, sheetId: sheet.id });
    }
    if (sheet.deleted_at || sheet.deletion_requested_at)
      return json(409, {
        error:
          "Esta aba foi excluída ou sua exclusão está em andamento. Gere outra versão após concluir a exclusão.",
      });

    if (
      action === "publish" &&
      (controlMaster
        ? sheet.spreadsheet_id !== CONTROL_EXPECTED_MASTER_ID ||
          sheet.sheet_tab !== controlMonthTabName(sheet.schedule_month)
        : sheet.spreadsheet_id !== sourceSpreadsheet(sheet.city, sheet.sector) ||
          sheet.sheet_tab !== officialMonthTitle(sheet.sector, sheet.schedule_month))
    )
      return json(409, {
        error: "Vincule a versão à aba mensal do Sheets oficial antes de aprovar.",
      });
    let publicationDraft: { id: string; payload: unknown; policy_snapshot: unknown } | null = null;
    let publicationBaseline = sheet.planned_payload as Payload;
    if (action === "publish" && params.draftId) {
      const { data: selected, error: selectedError } = await admin
        .from("schedule_generation_drafts")
        .select("id,city,sector,schedule_month,status,archived_at,warnings,payload,policy_snapshot")
        .eq("id", params.draftId)
        .maybeSingle();
      if (selectedError || !selected)
        return json(404, { error: "Versão selecionada não encontrada." });
      if (
        selected.city !== sheet.city ||
        selected.sector !== sheet.sector ||
        selected.schedule_month !== sheet.schedule_month
      )
        return json(409, {
          error: "A versão e a aba não pertencem à mesma cidade, frente e competência.",
        });
      if (selected.archived_at || !["draft", "approved"].includes(selected.status))
        return json(409, { error: "A versão selecionada está arquivada ou rejeitada." });
      if (
        Array.isArray(selected.warnings) &&
        selected.warnings.some((notice: { level?: string }) => notice?.level === "blocking")
      )
        return json(409, {
          error: "A versão salva possui pendências. Revise e salve uma nova versão.",
        });
      publicationDraft = selected;
      publicationBaseline = controlMaster ? snapshot(selected) : (selected.payload as Payload);
    }
    const token = await googleToken();
    const sharedTab = sheet.sheet_tab && sheet.sheet_tab !== "ATUALIZADA";
    const response = (await googleJson(
      tabUrl(sheet.spreadsheet_id, sharedTab ? sheet.sheet_tab : "ATUALIZADA") +
        "?valueRenderOption=UNFORMATTED_VALUE",
      token,
    )) as { values?: unknown[][] };
    let result;
    try {
      result =
        sharedTab && !controlMaster
          ? parseOfficialMonthTab(
              arrays(response.values),
              publicationBaseline,
              sheet.current_payload as Payload,
              sheet.schedule_month,
            )
          : sharedTab
            ? (action === "read" ? readControlMonthSource : parseControlMonthTab)(
                arrays(response.values),
                publicationBaseline,
                sheet.current_payload as Payload,
                sheet.schedule_month,
              )
            : parseUpdatedSheet(
                arrays(response.values),
                sheet.planned_payload as Payload,
                sheet.current_payload as Payload,
              );
    } catch (error) {
      return json(409, {
        code: "SHEET_STRUCTURE_CHANGED",
        error: error instanceof Error ? error.message : "Confira o cabeçalho e a estrutura da aba.",
      });
    }
    if (action === "read")
      return json(200, {
        ok: true,
        sheetId: sheet.id,
        payload: result.payload,
        sourceUpdatedAt: sheet.updated_at,
        readAt: new Date().toISOString(),
        writeActions: 0,
      });
    if (publicationDraft) {
      const policy = (publicationDraft.policy_snapshot || {}) as { rule?: AnalysisRule };
      const month = sheet.schedule_month.slice(0, 7);
      const analysis = analyzeSchedule(publicationBaseline, result.payload, {
        ...policy.rule,
        analysisMonth: month,
      });
      const blockers = analysis.issues.filter((issue) =>
        issue.kind === "weekly"
          ? result.payload.dates.some(
              (day) =>
                day.startsWith(month + "-") &&
                day >= issue.date &&
                day <=
                  new Date(Date.parse(issue.date + "T12:00:00Z") + 6 * 86400000)
                    .toISOString()
                    .slice(0, 10),
            )
          : issue.severity === "high" &&
            /^(coverage|role):/.test(issue.id) &&
            (new Date(issue.date + "T12:00:00Z").getUTCDay() === 0 ||
              issue.kind === "role" ||
              issue.title !== "Ausência em dia de trabalho"),
      );
      if (blockers.length)
        return json(409, {
          code: "SHEET_PUBLICATION_BLOCKED",
          error:
            "O Sheets atual ainda tem pendências; nenhuma publicação ou troca de vínculo foi feita. " +
            blockers
              .slice(0, 5)
              .map((issue) => issue.date + ": " + issue.detail)
              .join(" "),
        });
    }
    const functionChangeCount =
      "functionChanges" in result && Array.isArray(result.functionChanges)
        ? result.functionChanges.length
        : 0;
    const addedPeopleCount =
      "addedPeople" in result && Array.isArray(result.addedPeople) ? result.addedPeople.length : 0;
    const changeCount = result.changes.length + functionChangeCount + addedPeopleCount;
    if (addedPeopleCount) {
      const ready = await admin.rpc("schedule_operational_roster_sync_ready");
      if (ready.error || ready.data !== true)
        return json(409, {
          code: "ROSTER_SYNC_MIGRATION_REQUIRED",
          error:
            "Há novos colaboradores no Sheets. Aplique a migration 20261030191159_schedule_control_roster_sync.sql antes de importar as inclusões com auditoria. Nenhum dado foi alterado.",
        });
    }
    if (functionChangeCount) {
      const ready = await admin.rpc("schedule_operational_metadata_audit_ready");
      if (ready.error || ready.data !== true)
        return json(409, {
          error:
            "Há correções de função no Sheets. Aplique a migration de exclusão/histórico antes de sincronizar para preservar a auditoria.",
        });
    }
    if (action === "publish") {
      // Explicit admin action: one RPC applies the Google snapshot, audits
      // its changes and approves/publishes atomically with optimistic locking.
      const { data: officialId, error: publishError } = await admin.rpc(
        publicationDraft ? "schedule_operational_publish_revision" : "schedule_operational_publish",
        {
          ...(publicationDraft
            ? {
                p_draft_id: publicationDraft.id,
                p_planned_payload: publicationBaseline,
              }
            : {}),
          p_sheet_id: sheet.id,
          p_actor_id: user.id,
          p_expected_updated_at: sheet.updated_at,
          p_payload: result.payload,
          p_changes: result.changes,
        },
      );
      if (publishError)
        return json(publishError.code === "42501" ? 403 : 409, {
          error:
            publishError.code === "PGRST202"
              ? "Aplique a migration 20261030153159_schedule_publish_saved_revision.sql antes de publicar esta versão."
              : publishError.message,
        });
      if (!officialId) throw Error("O banco não confirmou a publicação da escala.");
      return json(200, {
        ok: true,
        sheetId: sheet.id,
        officialId,
        changes: changeCount,
        cellChanges: result.changes.length,
        functionChanges: functionChangeCount,
        addedPeople: addedPeopleCount,
        syncedAt: new Date().toISOString(),
        published: true,
      });
    }
    // Even without changed cells, validate the official link and record the check.
    const { error: applyError } = await admin.rpc("schedule_operational_apply_sync", {
      p_sheet_id: sheet.id,
      p_expected_updated_at: sheet.updated_at,
      p_actor_id: user.id,
      p_payload: result.payload,
      p_changes: result.changes,
    });
    if (applyError)
      return json(applyError.code === "42501" ? 403 : 409, { error: applyError.message });
    return json(200, {
      ok: true,
      changes: changeCount,
      cellChanges: result.changes.length,
      functionChanges: functionChangeCount,
      addedPeople: addedPeopleCount,
      sheetId: sheet.id,
      syncedAt: new Date().toISOString(),
      auditLogged: changeCount > 0,
    });
  } catch (error) {
    if (error instanceof ScheduleScopeForbidden) return json(403, { error: error.message });
    if (error instanceof ScheduleDeletionError)
      return json(error.status, { error: error.message, code: error.code });
    const message = error instanceof Error ? error.message : "Falha ao processar planilha.";
    return json(502, { error: message.slice(0, 1200) });
  }
});
