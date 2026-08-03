import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response(405, { error: "Método não permitido" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !serviceRoleKey || !authorization) {
    return response(401, { error: "Requisição não autorizada" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: "Sessão inválida" });

  const { data: requester } = await adminClient
    .from("profiles")
    .select("role,status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requester?.role !== "admin" || requester.status !== "active") {
    return response(403, { error: "Apenas gestores ativos podem excluir usuários" });
  }

  const payload = (await request.json()) as { userId?: string };
  if (!payload.userId || payload.userId === authData.user.id) {
    return response(400, { error: "Usuário inválido" });
  }

  const { error } = await adminClient.auth.admin.deleteUser(payload.userId);
  if (error) return response(400, { error: error.message });

  await adminClient.from("audit_logs").insert({
    user_id: authData.user.id,
    action: "delete_user",
    entity: "auth.users",
    entity_id: payload.userId,
  });

  return response(200, { ok: true });
});
