import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { qualityKeys, useQualityLoading } from "@/hooks/useQualityLoading";
import {
  extractQualityHtml,
  qualityErrorMessage,
  type QualityKind,
  type QualitySnapshot,
  type CertificationKind,
  type QualityRegistry,
} from "@/lib/quality";
import {
  hydrateQuality,
  directoryIndex,
  legacyDirectory,
  normalizeLogin,
  type QualityLogin,
} from "@/lib/quality-directory";
import { importQQ, importTC, normalizeQQSnapshot, parseTC } from "@/lib/quality-import";
import {
  mergeQualityRecords,
  qualitySnapshotChanged,
  type QualityMergeReport,
} from "@/lib/quality-merge";
import {
  fetchQualityState,
  saveQualityDataset,
  fetchQualityDirectory,
  saveQualityDirectory,
  deleteQualityLogin,
} from "@/services/quality";
import { QualityDirectory } from "./QualityDirectory";
import { technicalVisitState } from "@/lib/technical-visit-scope";
import { ReferenceQualitySurface } from "./ReferenceQualitySurface";
import "./quality.css";
const EMPTY_MAP = {};
export function QualityDashboard({
  variant = "quality",
}: {
  variant?: "quality" | "technical_visit";
}) {
  const technicalVisit = variant === "technical_visit";
  const moduleError = (error: unknown) =>
    technicalVisit &&
    ["42P01", "PGRST205", "PGRST202"].includes((error as { code?: string })?.code ?? "")
      ? "Instale a migration 20261013160016_add_technical_visit_certification.sql no projeto supervisortechnet para ativar a base exclusiva de Visita técnica."
      : qualityErrorMessage(error);
  const certificationKind: CertificationKind = technicalVisit ? "technical_visit" : "certification";
  const visibleKinds: readonly QualityKind[] = technicalVisit
    ? ["technical_visit"]
    : ["quebra", "certification"];
  const { profile, isAdmin } = useAuth(),
    client = useQueryClient();
  const loading = useQualityLoading(profile?.id, certificationKind);
  const state = loading.state;
  const saved = useRef(state);
  saved.current = state;
  const [saving, setSaving] = useState(""),
    [progress, setProgress] = useState(0);
  const [lastImports, setLastImports] = useState<
    Array<{ kind: QualityKind; file: string; report: QualityMergeReport; saved: boolean }>
  >([]);
  const busy = useRef(false),
    input = useRef<HTMLInputElement>(null),
    importKind = useRef<QualityKind | "html">(technicalVisit ? "technical_visit" : "quebra");
  const directory = useMemo(
    () => loading.directory.data ?? legacyDirectory(state),
    [state, loading.directory.data],
  );
  // Keep the mapping identity stable when only the other dataset finishes loading.
  const index = useMemo(() => directoryIndex(directory), [directory]);
  const displayState = useMemo(
    () => (technicalVisit ? technicalVisitState(state, index) : state),
    [state, index, technicalVisit],
  );
  const hydrated = useMemo(
    () => hydrateQuality(displayState, directory, certificationKind),
    [displayState, directory, certificationKind],
  );
  async function commit(kind: QualityKind, snapshot: QualitySnapshot, name: string) {
    if (!profile || !isAdmin) throw Error("Somente gestores podem importar dados.");
    if (!qualitySnapshotChanged(kind, saved.current.datasets[kind], snapshot)) return false;
    const manifest = await saveQualityDataset(
      kind,
      snapshot,
      name,
      profile.id,
      saved.current.imports[kind]?.id ?? null,
      setProgress,
    );
    const next = {
      ...saved.current,
      datasets: { ...saved.current.datasets, [kind]: snapshot },
      imports: { ...saved.current.imports, [kind]: manifest },
    };
    saved.current = next;
    loading.cacheState(next);
    return true;
  }
  function choose(kind: QualityKind | "html") {
    if (technicalVisit && kind !== "technical_visit") return;
    importKind.current = kind;
    if (!input.current) return;
    input.current.accept = kind === "html" ? ".html" : kind === "quebra" ? ".xlsx" : ".csv,.zip";
    input.current.click();
  }
  async function importFile(file: File) {
    if (busy.current || !isAdmin) return;
    if (file.size > 128 * 1024 * 1024) {
      toast.error("O arquivo excede 128 MB.");
      return;
    }
    busy.current = true;
    setSaving(file.name);
    setProgress(0);
    setLastImports([]);
    try {
      // Another user may have uploaded a newer file since this page was opened.
      await client.cancelQueries({ queryKey: [...qualityKeys.user(profile?.id), "dataset"] });
      const fresh = await fetchQualityState(saved.current, visibleKinds);
      saved.current = fresh;
      loading.cacheState(fresh);
      const summaries: Array<{
        kind: QualityKind;
        file: string;
        report: QualityMergeReport;
        saved: boolean;
      }> = [];
      if (importKind.current === "html") {
        if (technicalVisit)
          throw Error(
            "Visita técnica recebe somente o analítico de Técnico Certificado (CSV ou ZIP).",
          );
        const seed = extractQualityHtml(await file.text());
        const qq = normalizeQQSnapshot(seed.quebra),
          existingQQ = saved.current.datasets.quebra;
        const qMerge = mergeQualityRecords("quebra", existingQQ?.records ?? [], qq.records);
        qq.records = qMerge.records;
        summaries.push({
          kind: "quebra",
          file: file.name,
          report: qMerge.report,
          saved: await commit("quebra", qq, file.name),
        });
        const oldTC = saved.current.datasets.certification;
        const tMerge = mergeQualityRecords(
          "certification",
          oldTC?.records ?? [],
          parseTC(seed.certificationCsv, file.name, seed.certificationMetadata),
        );
        const tc = {
          ...seed.certificationMetadata,
          ...oldTC,
          records: tMerge.records,
        };
        summaries.push({
          kind: "certification",
          file: file.name,
          report: tMerge.report,
          saved: await commit("certification", tc, file.name),
        });
        if (loading.directory.isSuccess) {
          const historical = legacyDirectory({
            datasets: {
              quebra: seed.quebra,
              certification: { ...seed.certificationMetadata, records: [] },
            },
            imports: {},
            registry: seed.registry,
          });
          const current = new Set(directory.map((row) => row.login));
          const fresh = historical.filter((row) => !current.has(row.login));
          if (fresh.length) await saveQualityDirectory(fresh);
          const entries = await fetchQualityDirectory();
          client.setQueryData(qualityKeys.directory(profile?.id), entries);
        }
      } else {
        const kind = importKind.current;
        const result =
          kind === "quebra"
            ? await importQQ(file, saved.current.datasets.quebra)
            : await importTC(file, saved.current.datasets[kind], kind);
        const stored = await commit(kind, result.snapshot, file.name);
        summaries.push({ kind, file: file.name, report: result.report, saved: stored });
      }
      setLastImports(summaries);
      if (summaries.some((result) => result.saved))
        toast.success(
          "Base atualizada sem duplicar os atendimentos. Confira o resumo da importação.",
        );
      else
        toast.info("Os dados deste arquivo já estavam na base. Nenhuma nova versão foi gravada.");
    } catch (error) {
      toast.error(moduleError(error));
    } finally {
      busy.current = false;
      setSaving("");
    }
  }
  async function updateDirectory(rows: QualityLogin[]) {
    if (!isAdmin || busy.current) throw Error("Aguarde a operação atual.");
    busy.current = true;
    setSaving("cadastro de logins");
    try {
      await saveQualityDirectory(rows);
      const entries = await fetchQualityDirectory();
      client.setQueryData(qualityKeys.directory(profile?.id), entries);
      toast.success("Cadastro atualizado nos painéis de QQ, TC e Visita técnica.");
    } finally {
      busy.current = false;
      setSaving("");
    }
  }
  async function removeLogin(login: string) {
    if (!isAdmin || busy.current) throw Error("Aguarde a operação atual.");
    busy.current = true;
    setSaving("exclusão de cadastro");
    try {
      await deleteQualityLogin(login);
      const entries = await fetchQualityDirectory();
      client.setQueryData(qualityKeys.directory(profile?.id), entries);
      toast.success("Cadastro excluído. Os dados importados foram preservados.");
    } finally {
      busy.current = false;
      setSaving("");
    }
  }
  const [presentation, setPresentation] = useState(false);
  const registry = useMemo(
    () =>
      Object.fromEntries(
        directory.map((row) => [
          normalizeLogin(row.login),
          { name: row.full_name, supervisor: row.supervisor },
        ]),
      ) as QualityRegistry,
    [directory],
  );
  return (
    <AppShell presentation={presentation} fullWidth>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <ReferenceQualitySurface
        key={profile?.id}
        qq={hydrated.qq}
        tc={hydrated.tc}
        index={index}
        registry={registry}
        names={(state.datasets.quebra?.["names"] || EMPTY_MAP) as Record<string, string>}
        techMap={state.datasets[certificationKind]?.["techMap"] || EMPTY_MAP}
        nameUpdates={state.datasets[certificationKind]?.["nameUpdates"] || EMPTY_MAP}
        technicalVisit={technicalVisit}
        editable={isAdmin}
        onPresentationChange={setPresentation}
        qqReady={loading.qqReady}
        tcReady={loading.tcReady}
        presentationReady={loading.presentationReady}
        requestTC={loading.requestTC}
        qqError={loading.qq.error && !loading.qq.isFetching ? moduleError(loading.qq.error) : ""}
        tcError={
          loading.tc.error && !loading.tc.isFetching
            ? moduleError(loading.tc.error)
            : technicalVisit && loading.directory.isError && !loading.directory.isFetching
              ? "Não foi possível confirmar o setor dos logins. Atualize o cadastro e tente novamente."
              : ""
        }
        importFile={async (kind, file) => {
          importKind.current = kind === "qq" ? "quebra" : certificationKind;
          await importFile(file);
        }}
        importHistory={() => choose("html")}
        refresh={loading.refresh}
        status={
          <>
            {technicalVisit && loading.tcReady && (
              <p role="status" className="quality-vt-scope-notice">
                Visita técnica: somente logins com esse setor no cadastro · {hydrated.tc.length}{" "}
                registros considerados.
                {!hydrated.tc.length &&
                  " Cadastre os logins ou ajuste o setor para Visita técnica em QQ e Certificação."}
              </p>
            )}
            {!technicalVisit && loading.qq.error && (
              <p role="alert">QQ: {moduleError(loading.qq.error)}</p>
            )}
            {loading.needsTC && loading.tc.error && (
              <p role="alert">TC: {moduleError(loading.tc.error)}</p>
            )}
            {loading.directory.error && (
              <p role="alert">
                Não foi possível carregar o cadastro de logins:{" "}
                {moduleError(loading.directory.error)}
              </p>
            )}
            {loading.registry.error && !loading.directory.isSuccess && (
              <p role="alert">{moduleError(loading.registry.error)}</p>
            )}
            {(!technicalVisit && loading.qq.isFetching) ||
            (loading.needsTC && loading.tc.isFetching) ? (
              <p role="status">
                Carregando bases do sistema…{" "}
                {Object.entries(loading.progress)
                  .filter(([, p]) => p.stage !== "ready")
                  .map(
                    ([kind, p]) =>
                      `${kind === "quebra" ? "QQ" : "TC"}: ${p.stage === "download" ? `${p.complete}/${p.total} blocos` : p.stage === "cache" ? "conferindo cache" : "conferindo versão"}`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {saving && (
              <p role="status">
                Salvando {saving} {progress > 0 ? progress + "%" : ""}
              </p>
            )}
            {lastImports.map((result) => (
              <p
                key={result.kind}
                role="status"
                aria-label={`Resumo da importação ${result.kind === "quebra" ? "QQ" : "TC"}`}
              >
                {result.kind === "quebra" ? "QQ" : "TC"} ·{" "}
                {result.saved ? "Base atualizada" : "Sem alterações"} · {result.report.added}{" "}
                adicionados · {result.report.updated} atualizados · {result.report.total} registros
                consolidados · {result.report.unchanged} já existentes sem alteração · {result.file}
              </p>
            ))}
          </>
        }
        directory={
          <QualityDirectory
            technicalVisit={technicalVisit}
            entries={directory}
            missing={hydrated.missing}
            editable={isAdmin && loading.directory.isSuccess}
            busy={!!saving}
            onSave={updateDirectory}
            onDelete={removeLogin}
          />
        }
      />
    </AppShell>
  );
}
