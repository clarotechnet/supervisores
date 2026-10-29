import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (status: number, value: Record<string, unknown>) =>
  new Response(JSON.stringify(value), { status, headers: CORS });
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!url || !key || !bearer) return json(401, { error: "Sessão não informada." });
  const admin = createClient(url, key, {
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
    !["admin", "supervisor", "controller"].includes(profile.role)
  )
    return json(403, { error: "É necessário ter um usuário ativo." });
  let input: Record<string, unknown>;
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    input = body;
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
  const action = input["action"];
  if (
    typeof action !== "string" ||
    !["status", "request", "list", "review", "history"].includes(action)
  )
    return json(400, { error: "Ação desconhecida." });
  if (["list", "review", "history"].includes(String(action)) && profile.role !== "admin")
    return json(403, { error: "Apenas administrador pode gerenciar pedidos." });
  const city = input["city"];
  if (
    ["status", "request"].includes(String(action)) &&
    (typeof city !== "string" || !/^[a-z0-9-]{2,50}$/.test(city))
  )
    return json(400, { error: "Cidade inválida." });
  const note = input["note"] ?? "";
  if (typeof note !== "string" || note.length > 500)
    return json(400, { error: "A observação deve ter até 500 caracteres." });
  try {
    if (action === "request") {
      if (profile.role === "admin") return json(409, { error: "Administrador já possui acesso." });
      const { error } = await admin.rpc("schedule_control_request", {
        p_user_id: user.id,
        p_city: city,
        p_note: note,
      });
      if (error) throw error;
    }
    if (action === "request" || action === "status") {
      const { data, error } = await admin
        .from("schedule_control_access")
        .select("*")
        .eq("user_id", user.id)
        .eq("city", city)
        .maybeSingle();
      if (error) throw error;
      return json(200, {
        ok: true,
        request: data,
        canView: profile.role === "admin" || data?.status === "approved",
      });
    }
    if (action === "review") {
      const decision = input["decision"],
        updatedAt = input["updatedAt"];
      if (
        !uuid(input["requestId"]) ||
        typeof decision !== "string" ||
        !["approved", "denied", "revoked"].includes(decision) ||
        typeof updatedAt !== "string" ||
        !Number.isFinite(Date.parse(updatedAt))
      )
        return json(400, { error: "Decisão inválida." });
      const { error } = await admin.rpc("schedule_control_review", {
        p_access_id: input["requestId"],
        p_actor_id: user.id,
        p_decision: decision,
        p_expected_updated_at: updatedAt,
        p_note: note,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }
    if (action === "history") {
      if (!uuid(input["requestId"])) return json(400, { error: "Pedido inválido." });
      const { data, error } = await admin
        .from("schedule_control_access_events")
        .select("*,actor:profiles!schedule_control_access_events_actor_id_fkey(full_name)")
        .eq("access_id", input["requestId"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return json(200, { ok: true, events: data || [] });
    }
    const filter = input["filter"] ?? "pending",
      offset = input["offset"] ?? 0;
    if (
      typeof filter !== "string" ||
      !["all", "pending", "approved", "denied", "revoked"].includes(filter) ||
      typeof offset !== "number" ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1_000_000
    )
      return json(400, { error: "Filtro ou página inválida." });
    let listing = admin
      .from("schedule_control_access")
      .select(
        "*,requester:profiles!schedule_control_access_user_id_fkey(full_name,email,role,status)",
        { count: "exact" },
      );
    if (filter !== "all") listing = listing.eq("status", filter);
    const { data, error, count } = await listing
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 49);
    if (error) throw error;
    return json(200, {
      ok: true,
      requests: data || [],
      total: count ?? 0,
      hasMore: offset + (data?.length ?? 0) < (count ?? 0),
    });
  } catch (err) {
    const error = err as { message?: unknown; code?: string };
    const message =
      typeof error?.message === "string" ? error.message : "Falha ao processar acesso.";
    if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205")
      return json(503, {
        error: "O controle de acesso ainda não foi habilitado. Contate a administração do sistema.",
      });
    return json(error.code === "42501" ? 403 : 409, { error: message.slice(0, 500) });
  }
});
