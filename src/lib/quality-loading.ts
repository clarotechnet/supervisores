/** Bounded reads retain page order even when responses arrive out of order. */
export async function readQualityPages<T>(
  count: number,
  read: (page: number) => Promise<T>,
  signal?: AbortSignal,
  concurrency = 4,
): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(count, concurrency) }, async () => {
      while (!failed) {
        signal?.throwIfAborted();
        const page = next++;
        if (page >= count) return;
        try {
          results[page] = await read(page);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  signal?.throwIfAborted();
  return results;
}

export interface QualityLoadProgress {
  stage: "version" | "cache" | "download" | "ready";
  complete: number;
  total: number;
}
