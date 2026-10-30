import {
  chooseGenerationOption,
  validateGenerationChoice,
  InvalidGenerationInput,
} from "../_shared/schedule-ai-generation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  requireScheduleManagement,
  ScheduleScopeForbidden,
} from "../_shared/schedule-scope-access.ts";
import { operationalFromDraft, type Payload } from "../_shared/schedule-operational.ts";
import { analyzeSchedule, type ScheduleAnalysis } from "../_shared/schedule-ai-analysis.ts";
import { inheritedDatesByName } from "../_shared/schedule-inherited.ts";
import {
  validatePreviewAnalysisInput,
  InvalidPreviewInput,
} from "../_shared/schedule-ai-preview.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (code: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status: code, headers: CORS });
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type Explanation = {
  issueId: string;
  explanation: string;
  candidateKeys: string[];
  caution: string;
};
async function explanationByAI(analysis: ScheduleAnalysis) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key)
    return {
      mode: "rules" as const,
      summary: "Análise pelas regras; IA não configurada.",
      explanations: [] as Explanation[],
      note: "Configure GROQ_API_KEY nos Secrets da Edge Function para ativar o modelo da Groq.",
    };
  const model = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b";
  const compact = analysis.issues.slice(0, 15).map((issue) => ({
    id: issue.id,
    date: issue.date,
    kind: issue.kind,
    severity: issue.severity,
    affectedCount: issue.affected.length,
    restOptions: (issue.restOptions || []).map((x) => ({ date: x.date, score: x.score })),
    candidates: issue.candidates.map((c) => ({
      id: c.key,
      restDays: c.restDays,
      workDays: c.workDays,
      score: c.score,
      needsCompensation: !!c.compensation,
      compensationDate: c.compensation?.date || null,
    })),
  }));
  if (!compact.length)
    return {
      mode: "rules" as const,
      summary: "Sem pendências básicas para a IA priorizar.",
      explanations: [] as Explanation[],
      note: "",
    };
  // No employee names, login IDs, role names, original rows, or health details go to the provider.
  const instructions = [
    "Você é analista de escalas operacionais. Responda em português do Brasil.",
    "Receberá apenas eventos e candidatos pseudonimizados, pré-validados pelo sistema.",
    "NÃO invente candidatos, escalas, normas trabalhistas ou competências.",
    "Candidatos e datas de segunda folga são possibilidades para aprovação humana, nunca autorizam troca automática.",
    "Pendência semanal traz restOptions (datas viáveis); explique essas datas mesmo se candidates estiver vazio.",
    "Quando needsCompensation for verdadeiro, a sugestão exige plantão e folga em compensationDate juntos. Explique as duas alterações; não trate a compensação como opcional.",
    "Explique o risco e a ordem de revisão de cada pendência, no máximo 15.",
    "Nunca presuma que uma sugestão cumpre todas as regras de jornada, CCT ou RH.",
    "Retorne apenas o JSON do schema. Se não houver candidatos, deixe candidateKeys vazio.",
  ].join(" ");
  const body = {
    model,
    store: false,
    max_completion_tokens: 2000,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: instructions },
      {
        role: "user",
        content: JSON.stringify({
          weeks: analysis.inspectedWeeks,
          issues: compact,
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "schedule_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "suggestions"],
          properties: {
            summary: { type: "string" },
            suggestions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["issueId", "explanation", "candidateKeys", "caution"],
                properties: {
                  issueId: { type: "string" },
                  explanation: { type: "string" },
                  candidateKeys: { type: "array", items: { type: "string" } },
                  caution: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 18000);
  try {
    const result = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: abort.signal,
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      // Never relay a provider response body: it may contain account details.
      if (result.status === 429) {
        throw Error("Limite gratuito de requisições/tokens da Groq atingido (HTTP 429).");
      }
      if (result.status === 401 || result.status === 403) {
        throw Error("Chave GROQ_API_KEY inválida ou sem permissão (HTTP " + result.status + ").");
      }
      if (result.status === 400 || result.status === 404) {
        throw Error(
          "Modelo Groq indisponível ou parâmetros não aceitos (HTTP " + result.status + ").",
        );
      }
      throw Error("Serviço Groq indisponível (HTTP " + result.status + ").");
    }
    const data = (await result.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    if (!raw) throw Error("A Groq retornou uma resposta sem conteúdo.");
    const parsed = JSON.parse(raw) as { summary?: unknown; suggestions?: unknown };
    const allowed = new Map(compact.map((x) => [x.id, x.candidates.map((c) => c.id)]));
    const proposals = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const seen = new Set<string>();
    const explanations: Explanation[] = proposals.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const issueId = typeof row.issueId === "string" ? row.issueId : "";
      if (!allowed.has(issueId) || seen.has(issueId)) return [];
      seen.add(issueId);
      const candidateKeys = Array.isArray(row.candidateKeys)
        ? row.candidateKeys
            .filter((x): x is string => typeof x === "string" && allowed.get(issueId)!.includes(x))
            .slice(0, 5)
        : [];
      return [
        {
          issueId,
          candidateKeys,
          explanation: String(row.explanation || "").slice(0, 650),
          caution: String(row.caution || "").slice(0, 350),
        },
      ];
    });
    return {
      mode: "ai" as const,
      summary: String(parsed.summary || "Análise concluída.").slice(0, 800),
      explanations,
      note:
        "Análise feita pela Groq (" +
        model +
        "). Foram enviados somente identificadores anônimos e indicadores resumidos.",
    };
  } catch (err) {
    return {
      mode: "rules" as const,
      summary: "Análise pelas regras disponível.",
      explanations: [] as Explanation[],
      note:
        "IA indisponível nesta análise: " +
        (err instanceof Error ? err.message : "Erro de comunicação").slice(0, 220),
    };
  } finally {
    clearTimeout(timeout);
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supabaseUrl || !secret || !token) return json(401, { error: "Credenciais indisponíveis." });
  const admin = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return json(401, { error: "Sessão inválida." });
  const { data: profile } = await admin
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.status !== "active" || !["admin", "supervisor"].includes(profile.role))
    return json(403, { error: "Apenas gestores e supervisores ativos." });
  let args: { sheetId?: string; draftId?: string; preview?: unknown; generation?: unknown };
  try {
    args = await req.json();
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
  if (
    !args ||
    typeof args !== "object" ||
    [
      args.sheetId !== undefined,
      args.draftId !== undefined,
      args.preview !== undefined,
      args.generation !== undefined,
    ].filter(Boolean).length !== 1 ||
    (args.preview === undefined &&
      args.generation === undefined &&
      !uuid(args.sheetId) &&
      !uuid(args.draftId))
  )
    return json(400, { error: "Selecione uma única escala ou prévia para revisar." });
  try {
    if (args.generation !== undefined) {
      const input = validateGenerationChoice(args.generation);
      requireScheduleManagement(profile.role, input.sector);
      const result = await chooseGenerationOption(input, {
        key: Deno.env.get("GROQ_API_KEY"),
        model: Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b",
      });
      return json(200, result);
    }
    let planned: Payload,
      current: Payload,
      rule: NonNullable<Parameters<typeof analyzeSchedule>[2]> = {};
    let scope: { city: string; sector: string; schedule_month: string } | null = null;
    if (args.preview !== undefined) {
      const input = validatePreviewAnalysisInput(args.preview);
      requireScheduleManagement(profile.role, input.sector);
      planned = input.planned;
      current = input.current;
      rule = input.rule;
      scope = { city: input.city, sector: input.sector, schedule_month: input.month + "-01" };
    } else if (uuid(args.sheetId)) {
      const { data: sheet, error: lookupError } = await admin
        .from("schedule_operational_sheets")
        .select("id,draft_id,city,sector,schedule_month,planned_payload,current_payload")
        .eq("id", args.sheetId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!sheet) return json(404, { error: "Escala editável não encontrada." });
      scope = { city: sheet.city, sector: sheet.sector, schedule_month: sheet.schedule_month };
      requireScheduleManagement(profile.role, scope.sector);
      planned = sheet.planned_payload as Payload;
      current = sheet.current_payload as Payload;
      const { data: draft, error: draftError } = await admin
        .from("schedule_generation_drafts")
        .select("policy_snapshot")
        .eq("id", sheet.draft_id)
        .maybeSingle();
      const snap = (draft?.policy_snapshot || {}) as { rule?: Record<string, unknown> };
      if (draftError || !draft)
        throw Error("Não foi possível conferir a continuidade da revisão vinculada.");
      rule = { ...snap.rule, lockedDatesByName: inheritedDatesByName(snap) } as typeof rule;
    } else {
      const { data: draft, error: lookupError } = await admin
        .from("schedule_generation_drafts")
        .select("city,sector,schedule_month,payload,policy_snapshot")
        .eq("id", args.draftId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!draft) return json(404, { error: "Rascunho não encontrado." });
      scope = { city: draft.city, sector: draft.sector, schedule_month: draft.schedule_month };
      requireScheduleManagement(profile.role, scope.sector);
      const snap = (draft.policy_snapshot || {}) as {
        rule?: Record<string, unknown>;
        calendarWeeks?: string[][];
        outsideAssignments?: Record<string, string>[];
      };
      planned = operationalFromDraft(
        draft.payload as Payload,
        snap.calendarWeeks || [],
        snap.outsideAssignments || [],
      );
      current = planned;
      rule = { ...snap.rule, lockedDatesByName: inheritedDatesByName(snap) } as typeof rule;
    }
    const decInitial = scope;
    if (
      decInitial?.city === "natal" &&
      decInitial.sector === "controle-operacional" &&
      decInitial.schedule_month?.startsWith("2026-12")
    ) {
      rule.transitionStart = "2026-12-06";
    }
    rule.analysisMonth = scope?.schedule_month.slice(0, 7);
    const analysis = analyzeSchedule(planned, current, rule);
    const ai = await explanationByAI(analysis);
    return json(200, {
      ok: true,
      analysis,
      ...ai,
      source: args.preview !== undefined ? "preview" : args.sheetId ? "operational" : "draft",
      writeActions: 0,
    });
  } catch (err) {
    if (err instanceof InvalidGenerationInput) return json(400, { error: err.message });
    if (err instanceof InvalidPreviewInput) return json(400, { error: err.message });
    if (err instanceof ScheduleScopeForbidden) return json(403, { error: err.message });
    return json(502, {
      error: err instanceof Error ? err.message.slice(0, 500) : "Erro ao analisar escala.",
    });
  }
});
