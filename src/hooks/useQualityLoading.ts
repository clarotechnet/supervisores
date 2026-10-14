import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CertificationKind, QualityKind, QualityRegistry, QualityState } from "@/lib/quality";
import { QUALITY_PROJECT_REF } from "@/lib/quality";
import { cacheQualityDataset } from "@/lib/quality-cache";
import type { QualityLoadProgress } from "@/lib/quality-loading";
import {
  fetchQualityDataset,
  fetchQualityDirectory,
  fetchQualityRegistry,
  type QualityDataset,
} from "@/services/quality";

export const qualityKeys = {
  user: (user?: string) => ["quality", user] as const,
  dataset: (user: string | undefined, kind: QualityKind) =>
    ["quality", user, "dataset", kind] as const,
  directory: (user?: string) => ["quality", user, "directory"] as const,
  registry: (user?: string) => ["quality", user, "registry"] as const,
};
const EMPTY_REGISTRY: QualityRegistry = {};

export function useQualityLoading(user: string | undefined, certificationKind: CertificationKind) {
  const client = useQueryClient();
  const technicalVisit = certificationKind === "technical_visit";
  const [requestedTC, setRequestedTC] = useState(false);
  const needsTC = technicalVisit || requestedTC;
  const [progress, setProgress] = useState<Partial<Record<QualityKind, QualityLoadProgress>>>({});
  const datasetOptions = (kind: QualityKind, enabled: boolean) => ({
    queryKey: qualityKeys.dataset(user, kind),
    enabled: !!user && enabled,
    // Re-entering the module checks the small manifest; unchanged blocks stay in RAM/disk.
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchQualityDataset(kind, {
        previous: client.getQueryData<QualityDataset>(qualityKeys.dataset(user, kind)),
        userId: user,
        signal,
        progress: (next) => setProgress((old) => ({ ...old, [kind]: next })),
      }),
  });
  const qq = useQuery(datasetOptions("quebra", !technicalVisit));
  const tc = useQuery(datasetOptions(certificationKind, needsTC));
  const directory = useQuery({
    queryKey: qualityKeys.directory(user),
    enabled: !!user,
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchQualityDirectory(signal),
  });
  const registry = useQuery({
    queryKey: qualityKeys.registry(user),
    enabled: !!user,
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchQualityRegistry(signal),
  });
  const state = useMemo<QualityState>(() => {
    const next: QualityState = {
      datasets: {},
      imports: {},
      registry: registry.data ?? EMPTY_REGISTRY,
    };
    for (const [kind, result] of [
      ...(!technicalVisit ? [["quebra", qq.data] as const] : []),
      [certificationKind, tc.data] as const,
    ]) {
      if (result?.manifest) next.imports[kind] = result.manifest;
      if (result?.snapshot) next.datasets[kind] = result.snapshot;
    }
    return next;
  }, [qq.data, tc.data, registry.data, certificationKind, technicalVisit]);
  // The directory affects names/cities/supervisors: never present partial, unmapped indicators.
  // Both TC panels require the directory's sectors; legacy mappings cannot separate VT.
  // QQ keeps its existing fallback: its unit-based recorte is unchanged.
  const qqMappingReady =
    directory.isSuccess || (!technicalVisit && directory.isError && registry.isSuccess);
  const qqReady = !technicalVisit && qq.isSuccess && qqMappingReady;
  const tcReady = needsTC && tc.isSuccess && directory.isSuccess;
  function cacheState(next: QualityState) {
    for (const kind of (technicalVisit
      ? ["technical_visit"]
      : ["quebra", "certification"]) as QualityKind[]) {
      const manifest = next.imports[kind] ?? null;
      const snapshot = next.datasets[kind];
      client.setQueryData<QualityDataset>(qualityKeys.dataset(user, kind), { manifest, snapshot });
      if (user && manifest && snapshot)
        cacheQualityDataset(QUALITY_PROJECT_REF, user, kind, manifest.id, snapshot);
    }
    client.setQueryData(qualityKeys.registry(user), next.registry);
  }
  function refresh() {
    void directory.refetch();
    void registry.refetch();
    if (!technicalVisit) void qq.refetch();
    if (needsTC) void tc.refetch();
  }
  return {
    state,
    directory,
    registry,
    qq,
    tc,
    progress,
    qqReady,
    tcReady,
    needsTC,
    requestTC: () => setRequestedTC(true),
    presentationReady: tcReady && (technicalVisit || qqReady),
    cacheState,
    refresh,
  };
}
