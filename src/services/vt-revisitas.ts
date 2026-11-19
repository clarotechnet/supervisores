import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VtCity, VtImportKind, VtPeriod } from "@/lib/vt-revisitas";

// Scope the local schema extension to this module until the next generated type refresh.
type VtDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      vt_revisita_periodos: {
        Row: Record<keyof VtPeriod, Json>;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      vt_revisita_write: {
        Args: {
          p_city: string;
          p_period: string;
          p_revision: number;
          p_kind: string;
          p_payload: Json;
        };
        Returns: number;
      };
    };
  };
};
const client = supabase as unknown as SupabaseClient<VtDatabase>;

export const vtPeriodKey = (userId: string | undefined, city: VtCity, month: string) =>
  ["vt-revisitas", userId, city, month] as const;
export const vtHistoryKey = (userId: string | undefined, city: VtCity) =>
  ["vt-revisitas-history", userId, city] as const;

export async function readVtPeriod(city: VtCity, month: string, signal?: AbortSignal) {
  let query = client
    .from("vt_revisita_periodos")
    .select("*")
    .eq("city", city)
    .eq("period", `${month}-01`);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as unknown as VtPeriod | null;
}

export async function readVtHistory(city: VtCity, signal?: AbortSignal) {
  let query = client
    .from("vt_revisita_periodos")
    .select("period,closed_at")
    .eq("city", city)
    .order("period", { ascending: false })
    .limit(36);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data as Array<{ period: string; closed_at: string | null }>;
}

export async function writeVtPeriod(
  period: Pick<VtPeriod, "city" | "period" | "revision">,
  kind: VtImportKind | "close",
  payload: unknown,
) {
  const { data, error } = await client.rpc("vt_revisita_write", {
    p_city: period.city,
    p_period: period.period,
    p_revision: period.revision,
    p_kind: kind,
    p_payload: payload as Json,
  });
  if (error) throw error;
  return data;
}

export function vtErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Não foi possível concluir a operação.";
  const { code, message } = error as { code?: string; message?: string };
  if (["42P01", "PGRST202", "PGRST205"].includes(code ?? ""))
    return "A base de Revisitas ainda não está instalada neste ambiente. Aplique a migração específica no Supabase antes de importar.";
  return message || "Não foi possível concluir a operação.";
}
