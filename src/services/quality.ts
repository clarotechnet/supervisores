import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { assertQualityRecords, QUALITY_CHUNK_SIZE, QUALITY_PROJECT_REF } from "@/lib/quality";
import type {
  QualityImport,
  QualityKind,
  QualityRegistry,
  QualitySnapshot,
  QualityState,
} from "@/lib/quality";
import type { QualityLogin } from "@/lib/quality-directory";

function assertProject() {
  const clientUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
  if (new URL(clientUrl).hostname !== `${QUALITY_PROJECT_REF}.supabase.co`) {
    throw new Error(
      "O módulo QQ está configurado para outro banco. Confira a URL do projeto supervisortechnet.",
    );
  }
}
const dataTable = (kind: QualityKind) =>
  kind === "quebra"
    ? "quality_quebra_data"
    : kind === "technical_visit"
      ? "quality_technical_visit_data"
      : "quality_certification_data";

export async function fetchQualityState(
  previous?: QualityState,
  kinds: readonly QualityKind[] = ["quebra", "certification"],
): Promise<QualityState> {
  assertProject();
  if (kinds.includes("technical_visit")) {
    const { error } = await supabase
      .from("quality_technical_visit_data")
      .select("import_id")
      .limit(0);
    if (error) throw error;
  }
  const state: QualityState = { datasets: {}, imports: {}, registry: {} };
  await Promise.all(
    kinds.map(async (kind) => {
      const { data, error } = await supabase
        .from("quality_imports")
        .select("*")
        .eq("kind", kind)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      const manifest = data as QualityImport;
      // Uploads check the latest revision, but do not re-download unchanged large datasets.
      if (previous?.imports[kind]?.id === manifest.id && previous.datasets[kind]) {
        state.imports[kind] = manifest;
        state.datasets[kind] = previous.datasets[kind];
        return;
      }
      const blocks: { chunk_index: number; records: Json }[] = [];
      // Bound each response to avoid PostgREST's row limit and very large JSON responses.
      for (let start = 0; start < manifest.chunk_count; start += 8) {
        const { data: rows, error: readError } = await supabase
          .from(dataTable(kind))
          .select("chunk_index,records")
          .eq("import_id", manifest.id)
          .gte("chunk_index", start)
          .lt("chunk_index", start + 8)
          .order("chunk_index");
        if (readError) throw readError;
        blocks.push(...(rows ?? []));
      }
      if (
        blocks.length !== manifest.chunk_count ||
        blocks.some((block, index) => block.chunk_index !== index)
      ) {
        throw new Error("A base publicada está incompleta. Importe novamente o arquivo de origem.");
      }
      const records = blocks.flatMap((block) => block.records as QualitySnapshot["records"]);
      if (records.length !== manifest.row_count)
        throw new Error("Quantidade de registros diferente da importação publicada.");
      assertQualityRecords(kind, records);
      state.datasets[kind] = { ...(manifest.metadata as Record<string, Json>), records };
      state.imports[kind] = manifest;
    }),
  );
  const { data, error } = await supabase
    .from("quality_supervisor_registry")
    .select("registry")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  state.registry = (data?.registry ?? {}) as QualityRegistry;
  return state;
}

export async function saveQualityDataset(
  kind: QualityKind,
  snapshot: QualitySnapshot,
  sourceFile: string,
  importedBy: string,
  baseImportId: string | null,
  progress?: (percent: number) => void,
): Promise<QualityImport> {
  assertProject();
  assertQualityRecords(kind, snapshot.records);
  const { records, ...metadata } = snapshot;
  const chunkCount = Math.ceil(records.length / QUALITY_CHUNK_SIZE);
  const { data: manifest, error } = await supabase
    .from("quality_imports")
    .insert({
      kind,
      source_file: sourceFile,
      imported_by: importedBy,
      row_count: records.length,
      chunk_count: chunkCount,
      metadata: metadata as Json,
      base_import_id: baseImportId,
    })
    .select("*")
    .single();
  if (error) throw error;
  let complete = 0;
  try {
    // A failed upload remains unpublished, and therefore never replaces the previous base.
    for (let start = 0; start < chunkCount; start += 4) {
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(4, chunkCount - start) }, async (_, offset) => {
          const index = start + offset;
          const { error: blockError } = await supabase.from(dataTable(kind)).insert({
            import_id: manifest.id,
            chunk_index: index,
            records: records.slice(
              index * QUALITY_CHUNK_SIZE,
              (index + 1) * QUALITY_CHUNK_SIZE,
            ) as Json,
          });
          if (blockError) throw blockError;
          progress?.(Math.round((++complete / chunkCount) * 95));
        }),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
    const { error: publishError } = await supabase.rpc("publish_quality_import", {
      p_import_id: manifest.id,
    });
    if (publishError) throw publishError;
    progress?.(100);
    return { ...manifest, kind, published_at: new Date().toISOString() } as QualityImport;
  } catch (uploadError) {
    // All parallel requests settled above before the pending import can be discarded.
    await supabase.from("quality_imports").delete().eq("id", manifest.id).is("published_at", null);
    throw uploadError;
  }
}

export async function saveQualityRegistry(
  registry: QualityRegistry,
  userId: string,
): Promise<void> {
  assertProject();
  const { error } = await supabase.from("quality_supervisor_registry").upsert({
    singleton: true,
    registry: registry as Json,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchQualityDirectory(): Promise<QualityLogin[]> {
  assertProject();
  const entries: QualityLogin[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase
      .from("quality_technician_directory")
      .select("login,full_name,city,sector,supervisor,updated_at")
      .order("login")
      .range(start, start + 499);
    if (error) throw error;
    entries.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return entries;
}
export async function saveQualityDirectory(entries: QualityLogin[]): Promise<void> {
  assertProject();
  const clean = entries.map(({ login, full_name, city, sector, supervisor }) => ({
    login,
    full_name,
    city,
    sector,
    supervisor,
  }));
  const { error } = await supabase.rpc("save_quality_directory", { p_entries: clean });
  if (error) throw error;
}
export async function deleteQualityLogin(login: string): Promise<void> {
  assertProject();
  const { data, error } = await supabase
    .from("quality_technician_directory")
    .delete()
    .eq("login", login)
    .select("login");
  if (error) throw error;
  if (!data?.length) throw Error("Cadastro não encontrado ou sem permissão para excluir.");
}
