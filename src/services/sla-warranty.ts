import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { QUALITY_PROJECT_REF, QUALITY_CHUNK_SIZE } from "@/lib/quality";
import { readQualityPages } from "@/lib/quality-loading";
import {
  assertSlaSnapshot,
  SLA_SOURCES,
  type SlaDataset,
  type SlaManifest,
  type SlaSnapshot,
  type SlaSource,
  type SlaRecord,
} from "@/lib/sla-warranty";

const requestSignal = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
function assertProject() {
  if (
    new URL((supabase as unknown as { supabaseUrl: string }).supabaseUrl).hostname !==
    `${QUALITY_PROJECT_REF}.supabase.co`
  )
    throw Error("SLA configurado para outro banco. Use o projeto supervisortechnet.");
}
export async function fetchSlaDataset(
  previous?: SlaDataset,
  signal?: AbortSignal,
): Promise<SlaDataset> {
  assertProject();
  const { data, error } = await supabase
    .from("sla_warranty_imports")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .abortSignal(requestSignal(signal))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { manifest: null };
  const manifest = data as SlaManifest;
  if (previous?.manifest?.id === manifest.id && previous.snapshot)
    return { manifest, snapshot: previous.snapshot };
  const metadata = manifest.metadata as unknown as {
    counts: Record<SlaSource, number>;
    bases: Record<SlaSource, { source: string; sourceType: string; stats: Record<string, Json> }>;
  };
  if (!metadata?.counts || !metadata?.bases) throw Error("Manifesto SLA inválido.");
  const snapshot = {} as SlaSnapshot;
  let totalRows = 0,
    totalChunks = 0;
  for (const source of SLA_SOURCES) {
    const expected = metadata.counts[source] ?? 0;
    if (!expected) continue;
    const expectedChunks = Math.ceil(expected / QUALITY_CHUNK_SIZE);
    const pages = await readQualityPages(
      Math.ceil(expectedChunks / 8),
      async (page) => {
        const start = page * 8;
        const result = await supabase
          .from("sla_warranty_data")
          .select("chunk_index,records")
          .eq("import_id", manifest.id)
          .eq("source", source)
          .gte("chunk_index", start)
          .lt("chunk_index", start + 8)
          .order("chunk_index")
          .abortSignal(requestSignal(signal));
        if (result.error) throw result.error;
        return result.data ?? [];
      },
      signal,
    );
    const blocks = pages.flat();
    const records = blocks.flatMap((block) => block.records as unknown as SlaRecord[]);
    if (
      blocks.length !== expectedChunks ||
      blocks.some((block, index) => block.chunk_index !== index) ||
      records.length !== expected
    )
      throw Error("A base SLA publicada está incompleta. Nenhum resultado parcial será exibido.");
    snapshot[source] = { ...metadata.bases[source], records };
    totalRows += records.length;
    totalChunks += blocks.length;
  }
  if (totalRows !== manifest.row_count || totalChunks !== manifest.chunk_count)
    throw Error("A base SLA diverge do manifesto publicado.");
  assertSlaSnapshot(snapshot);
  return { manifest, snapshot };
}
export async function saveSlaDataset(
  snapshot: SlaSnapshot,
  sourceFile: string,
  user: string,
  baseId: string | null,
  progress: (value: number) => void,
): Promise<SlaDataset> {
  assertProject();
  assertSlaSnapshot(snapshot);
  const counts = Object.fromEntries(
    SLA_SOURCES.map((source) => [source, snapshot[source]?.records.length ?? 0]),
  );
  const bases = Object.fromEntries(
    SLA_SOURCES.filter((source) => snapshot[source]).map((source) => {
      const { records: _, ...base } = snapshot[source]!;
      return [source, base];
    }),
  );
  const chunks = SLA_SOURCES.flatMap((source) =>
    Array.from({ length: Math.ceil((counts[source] ?? 0) / QUALITY_CHUNK_SIZE) }, (_, index) => ({
      source,
      index,
      records: snapshot[source]!.records.slice(
        index * QUALITY_CHUNK_SIZE,
        (index + 1) * QUALITY_CHUNK_SIZE,
      ),
    })),
  );
  const { data, error } = await supabase
    .from("sla_warranty_imports")
    .insert({
      source_file: sourceFile,
      imported_by: user,
      row_count: Object.values(counts).reduce((sum, count) => sum + count, 0),
      chunk_count: chunks.length,
      metadata: { counts, bases } as Json,
      base_import_id: baseId,
    })
    .select("*")
    .abortSignal(requestSignal())
    .single();
  if (error) throw error;
  let complete = 0;
  try {
    for (let start = 0; start < chunks.length; start += 4) {
      const settled = await Promise.allSettled(
        chunks.slice(start, start + 4).map(async (chunk) => {
          const result = await supabase
            .from("sla_warranty_data")
            .insert({
              import_id: data.id,
              source: chunk.source,
              chunk_index: chunk.index,
              records: chunk.records as unknown as Json,
            })
            .abortSignal(requestSignal());
          if (result.error) throw result.error;
          progress(Math.round((++complete / chunks.length) * 95));
        }),
      );
      const failed = settled.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
    const published = await supabase
      .rpc("publish_sla_warranty_import", { p_import_id: data.id })
      .abortSignal(requestSignal());
    if (published.error) throw published.error;
    progress(100);
    return { manifest: { ...data, published_at: new Date().toISOString() }, snapshot };
  } catch (error) {
    try {
      await supabase
        .from("sla_warranty_imports")
        .delete()
        .eq("id", data.id)
        .is("published_at", null)
        .abortSignal(AbortSignal.timeout(5000));
    } catch {
      /* Never delete a published version or mask the original failure. */
    }
    throw error;
  }
}
