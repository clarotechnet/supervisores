import { describe, expect, it } from "vitest";
import { shouldSyncProfileForAuthEvent } from "../src/lib/auth-events";

describe("shouldSyncProfileForAuthEvent", () => {
  it("não recarrega o perfil ao renovar o token", () => {
    expect(shouldSyncProfileForAuthEvent("TOKEN_REFRESHED", "user-1", "user-1")).toBe(false);
  });

  it("não recarrega um usuário já conhecido ao reconfirmar a sessão", () => {
    expect(shouldSyncProfileForAuthEvent("SIGNED_IN", "user-1", "user-1")).toBe(false);
  });

  it("carrega o perfil de uma nova sessão", () => {
    expect(shouldSyncProfileForAuthEvent("INITIAL_SESSION", null, "user-1")).toBe(true);
  });

  it("força a leitura quando o usuário foi atualizado", () => {
    expect(shouldSyncProfileForAuthEvent("USER_UPDATED", "user-1", "user-1")).toBe(true);
  });
});
