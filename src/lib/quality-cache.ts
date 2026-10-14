import type { QualityKind, QualitySnapshot } from "./quality";

// No tokens or credentials. Entries are private to the project + signed-in user.
const DATABASE = "technet-quality-cache-v1";
const STORE = "datasets";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const generations = new Map<string, number>();
export const qualityCacheGeneration = (user: string) => generations.get(user) ?? 0;
interface CachedDataset {
  key: string;
  user: string;
  revision: string;
  count: number;
  savedAt: number;
  payload: Blob;
}
const cacheKey = (project: string, user: string, kind: QualityKind) => `${project}:${user}:${kind}`;

async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(Error("Cache indisponível"));
    };
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openCache();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

/** Caller must first obtain the current manifest through an authorized server request. */
export async function readQualityCache(
  project: string,
  user: string,
  kind: QualityKind,
  revision: string,
  count: number,
): Promise<QualitySnapshot | undefined> {
  try {
    if (typeof indexedDB === "undefined" || typeof DecompressionStream === "undefined") return;
    const entry = await transact<CachedDataset | undefined>("readonly", (store) =>
      store.get(cacheKey(project, user, kind)),
    );
    if (
      !entry ||
      entry.user !== user ||
      entry.revision !== revision ||
      entry.count !== count ||
      Date.now() - entry.savedAt > MAX_AGE
    )
      return;
    const json = await new Response(
      entry.payload.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    const snapshot = JSON.parse(json) as QualitySnapshot;
    if (!Array.isArray(snapshot.records) || snapshot.records.length !== count) return;
    return snapshot;
  } catch {
    // Corruption, disabled storage or quota problems never prevent a fresh server read.
    return;
  }
}

export function cacheQualityDataset(
  project: string,
  user: string,
  kind: QualityKind,
  revision: string,
  snapshot: QualitySnapshot,
  generation = qualityCacheGeneration(user),
  signal?: AbortSignal,
) {
  const valid = () => !signal?.aborted && generation === qualityCacheGeneration(user);
  const write = async () => {
    try {
      if (!valid() || typeof indexedDB === "undefined" || typeof CompressionStream === "undefined")
        return;
      const payload = await new Response(
        new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream("gzip")),
      ).blob();
      if (!valid()) return;
      // Recheck after opening IndexedDB too: a logout can happen while opening it.
      const db = await openCache();
      try {
        if (!valid()) return;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put({
            key: cacheKey(project, user, kind),
            user,
            revision,
            count: snapshot.records.length,
            savedAt: Date.now(),
            payload,
          } satisfies CachedDataset);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    } catch {
      /* Optional cache; the complete validated base is already in memory. */
    }
  };
  // Do not serialize/compress large datasets on the first-render critical path.
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(() => void write(), { timeout: 5000 });
  else setTimeout(() => void write(), 1000);
}

export async function clearQualityCache(user: string) {
  generations.set(user, qualityCacheGeneration(user) + 1);
  try {
    if (typeof indexedDB === "undefined") return;
    const db = await openCache();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const cursor = tx.objectStore(STORE).openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          if ((current.value as CachedDataset).user === user) current.delete();
          current.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* Private/browser storage may be unavailable. */
  }
}
