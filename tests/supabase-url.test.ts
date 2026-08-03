import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "../src/lib/supabase-url";

describe("normalizeSupabaseUrl", () => {
  it("mantém a URL base do projeto", () => {
    expect(normalizeSupabaseUrl("https://projeto.supabase.co")).toBe("https://projeto.supabase.co");
  });

  it("remove o caminho da Data API", () => {
    expect(normalizeSupabaseUrl("https://projeto.supabase.co/rest/v1/")).toBe(
      "https://projeto.supabase.co",
    );
  });

  it("remove o caminho da API de autenticação", () => {
    expect(normalizeSupabaseUrl("https://projeto.supabase.co/auth/v1")).toBe(
      "https://projeto.supabase.co",
    );
  });
});
