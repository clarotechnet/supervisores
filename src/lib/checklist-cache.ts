import type { TaskRecord } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const checklistCache = new Map<string, { records: TaskRecord[]; storedAt: number }>();

function cacheKey(userId: string, sectorId: string, dateKey: string) {
  return `${userId}:${sectorId}:${dateKey}`;
}

export function getCachedChecklistRecords(params: {
  userId: string;
  sectorId: string;
  dateKey: string;
}): TaskRecord[] | null {
  const key = cacheKey(params.userId, params.sectorId, params.dateKey);
  const cached = checklistCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.storedAt > CACHE_TTL_MS) {
    checklistCache.delete(key);
    return null;
  }
  return cached.records.map((record) => ({ ...record }));
}

export function cacheChecklistRecords(
  params: { userId: string; sectorId: string; dateKey: string },
  records: TaskRecord[],
) {
  checklistCache.set(cacheKey(params.userId, params.sectorId, params.dateKey), {
    records: records.map((record) => ({ ...record })),
    storedAt: Date.now(),
  });
}
