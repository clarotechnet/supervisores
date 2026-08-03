const API_SUFFIX = /\/(?:rest|auth)\/v1\/?$/i;

/**
 * O createClient recebe a URL base do projeto. Esta normaliza URLs copiadas
 * por engano das telas de Data API ou Auth do painel do Supabase.
 */
export function normalizeSupabaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.replace(API_SUFFIX, "");
}
