import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { assertQualityRecords, QUALITY_CHUNK_SIZE, QUALITY_PROJECT_REF } from "@/lib/quality";
import type {
  QualityImport,
  QualityKind,
  QualityRecord,
  QualityRegistry,
  QualitySnapshot,
  QualityState,
} from "@/lib/quality";
import type { QualityLogin } from "@/lib/quality-directory";
import { readQualityPages, type QualityLoadProgress } from "@/lib/quality-loading";
import { cacheQualityDataset, qualityCacheGeneration, readQualityCache } from "@/lib/quality-cache";
import { mergeQualityRecords } from "@/lib/quality-merge";

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

export interface QualityDataset {
  manifest: QualityImport | null;
  snapshot?: QualitySnapshot | undefined;
}
type QualityDatasetOptions = {
  previous?: QualityDataset | undefined;
  userId?: string | undefined;
  signal?: AbortSignal;
  progress?: (progress: QualityLoadProgress) => void;
};
type QualityBlocks = Pick<QualityImport, "id" | "chunk_count" | "row_count">;
type CertificationVersion = {
  manifest: QualityImport;
  baseline: QualityBlocks | null;
  patch_count: number;
};
const TC_PAGE_SIZE = 1000;
const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;
const missingRpc = (error: unknown) => ["PGRST202", "42883"].includes(errorCode(error) ?? "");

export async function fetchQualityDataset(
  kind: QualityKind,
  options: QualityDatasetOptions = {},
): Promise<QualityDataset> {
  assertProject();
  try {
    return await readPublishedQualityDataset(kind, options);
  } catch (error) {
    // Patch pages reject an outdated revision instead of combining two different imports.
    if (kind !== "certification" || errorCode(error) !== "40001" || options.signal?.aborted)
      throw error;
    return readPublishedQualityDataset(kind, options);
  }
}

async function readPublishedQualityDataset(
  kind: QualityKind,
  options: QualityDatasetOptions,
): Promise<QualityDataset> {
  const { previous, userId, signal, progress } = options;
  const generation = userId ? qualityCacheGeneration(userId) : 0;
  const abort = signal ?? new AbortController().signal;
  progress?.({ stage: "version", complete: 0, total: 0 });
  if (kind === "technical_visit") {
    const { error } = await supabase
      .from("quality_technical_visit_data")
      .select("import_id")
      .limit(0)
      .abortSignal(abort);
    if (error) throw error;
  }
  let incremental: CertificationVersion | undefined;
  if (kind === "certification") {
    const { data, error } = await supabase
      .rpc("quality_tc_incremental_manifest", {}, { get: true })
      .abortSignal(abort);
    if (error && !missingRpc(error)) throw error;
    const version = data as unknown as CertificationVersion | null;
    if (version?.manifest) incremental = version;
  }
  let manifest = incremental?.manifest ?? null;
  if (!manifest) {
    // Read the legacy base until the first incremental publication; no legacy writes as fallback.
    const { data, error } = await supabase
      .from("quality_imports")
      .select("*")
      .eq("kind", kind)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .abortSignal(abort)
      .maybeSingle();
    if (error) throw error;
    manifest = data as QualityImport | null;
  }
  abort.throwIfAborted();
  if (!manifest) {
    progress?.({ stage: "ready", complete: 0, total: 0 });
    return { manifest: null };
  }
  const total = incremental
    ? (incremental.baseline?.chunk_count ?? 0) + Math.ceil(incremental.patch_count / TC_PAGE_SIZE)
    : manifest.chunk_count;
  // A fresh authorized manifest is required even when reusing local data.
  if (previous?.manifest?.id === manifest.id && previous.snapshot) {
    progress?.({ stage: "ready", complete: total, total });
    return { manifest, snapshot: previous.snapshot };
  }
  if (userId) {
    progress?.({ stage: "cache", complete: 0, total });
    const cached = await readQualityCache(
      QUALITY_PROJECT_REF,
      userId,
      kind,
      manifest.id,
      manifest.row_count,
    );
    abort.throwIfAborted();
    if (cached) {
      try {
        assertQualityRecords(kind, cached.records);
        progress?.({ stage: "ready", complete: total, total });
        return { manifest, snapshot: cached };
      } catch {
        /* Invalid cached records are downloaded again. */
      }
    }
  }
  let complete = 0;
  const reportDownloaded = (count: number) => {
    complete += count;
    if (!abort.aborted) progress?.({ stage: "download", complete, total });
  };
  reportDownloaded(0);
  let records: QualityRecord[];
  if (incremental) {
    const patches = await readCertificationPatches(incremental, abort, () => reportDownloaded(1));
    const baseline = incremental.baseline
      ? await readQualityBlocks(kind, incremental.baseline, abort, reportDownloaded)
      : [];
    records = mergeQualityRecords("certification", baseline, patches).records;
  } else {
    records = await readQualityBlocks(kind, manifest, abort, reportDownloaded);
  }
  abort.throwIfAborted();
  if (records.length !== manifest.row_count)
    throw new Error("Quantidade de registros diferente da importação publicada.");
  assertQualityRecords(kind, records);
  const snapshot = { ...(manifest.metadata as Record<string, Json>), records };
  if (userId)
    cacheQualityDataset(
      QUALITY_PROJECT_REF,
      userId,
      kind,
      manifest.id,
      snapshot,
      generation,
      abort,
    );
  progress?.({ stage: "ready", complete, total });
  return { manifest, snapshot };
}

async function readQualityBlocks(
  kind: QualityKind,
  base: QualityBlocks,
  abort: AbortSignal,
  progress: (count: number) => void,
) {
  const pages = await readQualityPages(
    Math.ceil(base.chunk_count / 8),
    async (page) => {
      const start = page * 8;
      const { data: rows, error: readError } = await supabase
        .from(dataTable(kind))
        .select("chunk_index,records")
        .eq("import_id", base.id)
        .gte("chunk_index", start)
        .lt("chunk_index", start + 8)
        .order("chunk_index")
        .abortSignal(abort);
      if (readError) throw readError;
      progress(rows?.length ?? 0);
      return rows ?? [];
    },
    abort,
  );
  const blocks = pages.flat();
  if (
    blocks.length !== base.chunk_count ||
    blocks.some((block, index) => block.chunk_index !== index)
  ) {
    throw new Error("A base publicada está incompleta. Importe novamente o arquivo de origem.");
  }
  const records = blocks.flatMap((block) => block.records as QualitySnapshot["records"]);
  if (records.length !== base.row_count)
    throw new Error("Quantidade de registros diferente da importação publicada.");
  return records;
}

async function readCertificationPatches(
  version: CertificationVersion,
  abort: AbortSignal,
  progress: () => void,
) {
  const records: QualityRecord[] = [];
  let cursor = 0;
  while (records.length < version.patch_count) {
    abort.throwIfAborted();
    const { data, error } = await supabase
      .rpc(
        "quality_tc_incremental_page",
        { p_import_id: version.manifest.id, p_after: cursor },
        { get: true },
      )
      .abortSignal(abort);
    if (error) throw error;
    const page = data as { records: QualityRecord[]; cursor: number } | null;
    if (
      !Array.isArray(page?.records) ||
      page.records.length !== Math.min(TC_PAGE_SIZE, version.patch_count - records.length) ||
      !Number.isSafeInteger(page.cursor) ||
      page.cursor <= cursor
    ) {
      throw new Error("A leitura das alterações de Técnico Certificado está incompleta.");
    }
    records.push(...page.records);
    cursor = page.cursor;
    progress();
  }
  return records;
}

export async function fetchQualityRegistry(signal?: AbortSignal): Promise<QualityRegistry> {
  assertProject();
  const { data, error } = await supabase
    .from("quality_supervisor_registry")
    .select("registry")
    .eq("singleton", true)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (error) throw error;
  return (data?.registry ?? {}) as QualityRegistry;
}

export async function fetchQualityState(
  previous?: QualityState,
  kinds: readonly QualityKind[] = ["quebra", "certification"],
): Promise<QualityState> {
  const state: QualityState = { datasets: {}, imports: {}, registry: {} };
  await Promise.all([
    ...kinds.map(async (kind) => {
      const result = await fetchQualityDataset(kind, {
        previous: { manifest: previous?.imports[kind] ?? null, snapshot: previous?.datasets[kind] },
      });
      if (result.manifest) state.imports[kind] = result.manifest;
      if (result.snapshot) state.datasets[kind] = result.snapshot;
    }),
    fetchQualityRegistry().then((registry) => {
      state.registry = registry;
    }),
  ]);
  return state;
}

export async function saveQualityDataset(
  kind: QualityKind,
  snapshot: QualitySnapshot,
  sourceFile: string,
  importedBy: string,
  baseImportId: string | null,
  progress?: (percent: number) => void,
  changedRecords?: QualityRecord[],
): Promise<QualityImport> {
  assertProject();
  assertQualityRecords(kind, snapshot.records);
  const { records, ...metadata } = snapshot;
  if (kind === "certification") {
    if (!changedRecords)
      throw new Error("As alterações de Técnico Certificado não foram calculadas.");
    return saveCertificationChanges(
      changedRecords,
      records.length,
      metadata as Json,
      sourceFile,
      baseImportId,
      progress,
    );
  }
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
    .abortSignal(AbortSignal.timeout(60_000))
    .single();
  if (error) throw error;
  try {
    // A failed upload remains unpublished, and therefore never replaces the previous base.
    await uploadQualityBlocks(
      records,
      async (index, block) => {
        const { error: blockError } = await supabase
          .from(dataTable(kind))
          .insert({ import_id: manifest.id, chunk_index: index, records: block })
          .abortSignal(AbortSignal.timeout(60_000));
        if (blockError) throw blockError;
      },
      progress,
    );
    const { error: publishError } = await supabase
      .rpc("publish_quality_import", {
        p_import_id: manifest.id,
      })
      .abortSignal(AbortSignal.timeout(60_000));
    if (publishError) throw publishError;
    progress?.(100);
    return { ...manifest, kind, published_at: new Date().toISOString() } as QualityImport;
  } catch (uploadError) {
    // All parallel requests settled above before the pending import can be discarded.
    try {
      await supabase
        .from("quality_imports")
        .delete()
        .eq("id", manifest.id)
        .is("published_at", null)
        .abortSignal(AbortSignal.timeout(5000));
    } catch {
      /* Keep the original upload error. */
    }
    throw uploadError;
  }
}

async function saveCertificationChanges(
  records: QualityRecord[],
  total: number,
  metadata: Json,
  file: string,
  baseId: string | null,
  progress?: (percent: number) => void,
): Promise<QualityImport> {
  const { data: id, error } = await supabase
    .rpc("quality_tc_incremental_start", {
      p_base_import_id: baseId,
      p_source_file: file,
      p_row_count: total,
      p_change_count: records.length,
      p_metadata: metadata,
    })
    .abortSignal(AbortSignal.timeout(60_000));
  if (error) {
    if (missingRpc(error))
      throw new Error(
        "A importação incremental de Técnico Certificado ainda não foi instalada no banco.",
      );
    throw error;
  }
  if (!id) throw new Error("O banco não iniciou a importação incremental.");
  try {
    await uploadQualityBlocks(
      records,
      async (index, block) => {
        const { error: blockError } = await supabase
          .rpc("quality_tc_incremental_append", {
            p_upload_id: id,
            p_chunk_index: index,
            p_records: block,
          })
          .abortSignal(AbortSignal.timeout(60_000));
        if (blockError) throw blockError;
      },
      progress,
    );
    const { data, error: finishError } = await supabase
      .rpc("quality_tc_incremental_finish", { p_upload_id: id })
      .abortSignal(AbortSignal.timeout(60_000));
    if (finishError) throw finishError;
    const manifest = data as unknown as QualityImport | null;
    if (!manifest?.id || manifest.kind !== "certification")
      throw new Error("Não foi possível confirmar a publicação incremental.");
    progress?.(100);
    return manifest;
  } catch (uploadError) {
    try {
      await supabase
        .rpc("quality_tc_incremental_finish", { p_upload_id: id, p_cancel: true })
        .abortSignal(AbortSignal.timeout(5000));
    } catch {
      /* Keep the original upload error. */
    }
    throw uploadError;
  }
}

async function uploadQualityBlocks(
  records: QualityRecord[],
  send: (index: number, block: QualityRecord[]) => Promise<void>,
  progress?: (percent: number) => void,
) {
  const chunkCount = Math.ceil(records.length / QUALITY_CHUNK_SIZE);
  let complete = 0;
  for (let start = 0; start < chunkCount; start += 4) {
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(4, chunkCount - start) }, async (_, offset) => {
        const index = start + offset;
        await send(
          index,
          records.slice(index * QUALITY_CHUNK_SIZE, (index + 1) * QUALITY_CHUNK_SIZE),
        );
        progress?.(Math.round((++complete / chunkCount) * 95));
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
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

export async function fetchQualityDirectory(signal?: AbortSignal): Promise<QualityLogin[]> {
  assertProject();
  const entries: QualityLogin[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase
      .from("quality_technician_directory")
      .select("login,full_name,city,sector,supervisor,updated_at")
      .order("login")
      .range(start, start + 499)
      .abortSignal(signal ?? new AbortController().signal);
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
