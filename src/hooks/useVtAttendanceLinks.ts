import { useMemo, useState, useSyncExternalStore } from "react";
import { nameKey, normalizeLogin } from "@/lib/quality-directory";
import type { VtCity } from "@/lib/vt-revisitas";

const STORAGE_PREFIX = "technet:vt-revisitas:links:v1:";
const LOCAL_CHANGE = "vt-revisitas-links-changed";

export function vtAttendanceLinksKey(userId: string | undefined, city: VtCity, month: string) {
  return userId ? `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${city}:${month}` : undefined;
}

function linkTarget(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("LOGIN:")) return "";
  const login = normalizeLogin(value.slice(6));
  return login ? `LOGIN:${login}` : "";
}

export function parseVtAttendanceLinks(raw: string | null) {
  const links = new Map<string, string>();
  if (!raw) return links;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return links;
    for (const entry of data) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const alias = nameKey(entry[0]);
      const target = linkTarget(entry[1]);
      if (alias && target) links.set(alias, target);
    }
  } catch {
    // An unavailable or malformed preference must not bypass registry matching.
  }
  return links;
}

function storedLinks(key: string | undefined) {
  try {
    return key && typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_CHANGE, onChange);
  };
}

export function useVtAttendanceLinks(userId: string | undefined, city: VtCity, month: string) {
  const key = vtAttendanceLinksKey(userId, city, month);
  const raw = useSyncExternalStore(
    subscribe,
    () => storedLinks(key),
    () => null,
  );
  const [temporary, setTemporary] = useState<Record<string, ReadonlyMap<string, string>>>({});
  const unsaved = key ? temporary[key] : undefined;
  const links = useMemo(() => unsaved ?? parseVtAttendanceLinks(raw), [raw, unsaved]);

  function setLink(name: string, value: string) {
    const alias = nameKey(name);
    const target = linkTarget(value);
    if (!key || !alias || (value && !target)) return;
    const next = new Map(unsaved ?? parseVtAttendanceLinks(storedLinks(key)));
    if (target) next.set(alias, target);
    else next.delete(alias);
    try {
      if (next.size) window.localStorage.setItem(key, JSON.stringify([...next]));
      else window.localStorage.removeItem(key);
    } catch {
      setTemporary((current) => ({ ...current, [key]: next }));
      return;
    }
    if (unsaved)
      setTemporary((current) => {
        const remaining = { ...current };
        delete remaining[key];
        return remaining;
      });
    window.dispatchEvent(new Event(LOCAL_CHANGE));
  }

  return { links, setLink, hasUnsavedLinks: !!unsaved };
}
