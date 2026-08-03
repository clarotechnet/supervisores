export function shouldSyncProfileForAuthEvent(
  event: string,
  loadedUserId: string | null,
  sessionUserId: string | undefined,
): boolean {
  if (!sessionUserId || event === "TOKEN_REFRESHED") return false;
  return event === "USER_UPDATED" || loadedUserId !== sessionUserId;
}
