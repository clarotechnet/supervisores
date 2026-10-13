import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileUp,
  Loader2,
  RefreshCw,
  Maximize2,
  Minimize2,
  Users,
  SlidersHorizontal,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import {
  extractQualityHtml,
  qualityErrorMessage,
  type QualityKind,
  type QualitySnapshot,
  type QualityState,
  type CertificationKind,
} from "@/lib/quality";
import {
  directoryIndex,
  hydrateQuality,
  legacyDirectory,
  normalizeLogin,
  type QualityLogin,
} from "@/lib/quality-directory";
import { norm, presentationCityLabel } from "@/lib/quality-math";
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
import { QualityDirectory } from "@/components/quality/QualityDirectory";
import { QQMetrics, TCMetrics } from "@/components/quality/QualityMetrics";
import { monthLabel } from "@/lib/quality-format";
import {
  emptyQualityFilters as emptyFilters,
  qqUnitPass,
  type QualityFilters as Filters,
  type QualityMode as Mode,
} from "@/lib/quality-scope";
import {
  buildQualitySlides,
  qualitySlideFilters,
  QualitySlidePlayer,
  emptyQualityPlayer,
  type QualitySlideSnapshot,
  type QualitySlide,
} from "@/lib/quality-slides";
import { QualitySlideControls } from "./QualitySlideControls";
import type { TCProjectionPlans } from "@/lib/quality-projection";
import "@/components/quality/quality.css";

interface LoadedQuality {
  state: QualityState;
  directory: QualityLogin[];
  directoryReady: boolean;
  directoryError: string;
}
const EMPTY_STATE: QualityState = { datasets: {}, imports: {}, registry: {} };
const unique = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
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
  const key = ["native-quality", profile?.id, variant];
  const query = useQuery({
    queryKey: key,
    enabled: !!profile,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<LoadedQuality> => {
      const [state, dir] = await Promise.all([
        fetchQualityState(client.getQueryData<LoadedQuality>(key)?.state, visibleKinds),
        fetchQualityDirectory()
          .then((directory) => ({ directory, directoryReady: true, directoryError: "" }))
          .catch((error) => ({
            directory: [],
            directoryReady: false,
            directoryError: ["42P01", "PGRST205", "PGRST202"].includes(error?.code)
              ? "O cadastro de logins precisa da migration complementar 20261013140334_add_quality_technician_directory.sql no projeto supervisortechnet. Não repita a migration anterior."
              : `Não foi possível carregar o cadastro de logins: ${qualityErrorMessage(error)}`,
          })),
      ]);
      return { state, ...dir };
    },
  });
  const data = query.data,
    state = data?.state ?? EMPTY_STATE;
  const saved = useRef(state);
  saved.current = state;
  const [mode, setMode] = useState<Mode>(technicalVisit ? "tc" : "qq"),
    [filters, setFilters] = useState<Filters>(emptyFilters),
    [expandedFilters, setExpandedFilters] = useState(false),
    [presentation, setPresentation] = useState(false);
  const [qqFront, setQQFront] = useState("ND"),
    [tcView, setTCView] = useState<"result" | "daily">("result"),
    [tcPlans, setTCPlans] = useState<TCProjectionPlans>({}),
    [metricsEpoch, setMetricsEpoch] = useState(0),
    [slideState, setSlideState] = useState(emptyQualityPlayer);
  const [saving, setSaving] = useState(""),
    [progress, setProgress] = useState(0);
  const [lastImports, setLastImports] = useState<
    Array<{ kind: QualityKind; file: string; report: QualityMergeReport; saved: boolean }>
  >([]);
  const busy = useRef(false),
    panel = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    importKind = useRef<QualityKind | "html">(technicalVisit ? "technical_visit" : "quebra");
  const directory = useMemo(
    () => (data?.directoryReady ? data.directory : legacyDirectory(state)),
    [state, data?.directory, data?.directoryReady],
  );
  const hydrated = useMemo(
    () => hydrateQuality(state, directory, certificationKind),
    [state, directory, certificationKind],
  );
  const slideCallbacks = useRef<{
    capture(): QualitySlideSnapshot;
    build(snapshot: QualitySlideSnapshot): QualitySlide[];
    show(slide: QualitySlide, snapshot: QualitySlideSnapshot): void;
    restore(snapshot: QualitySlideSnapshot): void;
  }>(null!);
  slideCallbacks.current = {
    capture: () => ({
      mode,
      filters: structuredClone(filters),
      front: qqFront,
      tcView,
      expanded: expandedFilters,
    }),
    build: (snapshot) =>
      buildQualitySlides(hydrated.qq, hydrated.tc, hydrated.index, snapshot, technicalVisit),
    show: (slide, snapshot) => {
      setMode(slide.panel);
      setFilters(qualitySlideFilters(slide, snapshot));
      setQQFront(slide.front || "ND");
      setTCView("result");
      setExpandedFilters(false);
      setMetricsEpoch((n) => n + 1);
      requestAnimationFrame(() => {
        panel.current?.scrollTo({ top: 0, left: 0 });
        panel.current?.focus({ preventScroll: true });
      });
    },
    restore: (snapshot) => {
      setMode(snapshot.mode);
      setFilters(snapshot.filters);
      setQQFront(snapshot.front);
      setTCView(snapshot.tcView);
      setExpandedFilters(snapshot.expanded);
      setMetricsEpoch((n) => n + 1);
    },
  };
  const [slidePlayer] = useState(
    () =>
      new QualitySlidePlayer({
        capture: () => slideCallbacks.current.capture(),
        build: (snapshot) => slideCallbacks.current.build(snapshot),
        show: (slide, snapshot) => slideCallbacks.current.show(slide, snapshot),
        restore: (snapshot) => slideCallbacks.current.restore(snapshot),
        change: setSlideState,
        error: () =>
          toast.error("Apresentação encerrada. Os filtros anteriores foram restaurados."),
      }),
  );
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        document.querySelector(".quality-presentation") &&
        !document.querySelector('[role="dialog"][data-state="open"]')
      ) {
        slidePlayer.stop();
        setPresentation(false);
      }
      const target = event.target as HTMLElement;
      if (
        slidePlayer.state.active &&
        ["Enter", " "].includes(event.key) &&
        target.closest?.("button,summary,[role='link']") &&
        !target.closest("[data-slides-controls],[data-slides-locked],[role='dialog']")
      )
        slidePlayer.pause();
      if (
        !slidePlayer.state.active ||
        (event.target as HTMLElement)?.closest?.(
          'input,textarea,select,button,summary,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        slidePlayer.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        slidePlayer.previous();
      } else if (event.key === " ") {
        event.preventDefault();
        if (slidePlayer.state.paused) slidePlayer.resume();
        else slidePlayer.pause();
      }
    };
    const change = () => {
      if (!document.fullscreenElement) {
        slidePlayer.stop();
        setPresentation(false);
      }
    };
    const visibility = () => slidePlayer.visibility(document.hidden);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("visibilitychange", visibility);
      slidePlayer.dispose();
    };
  }, [slidePlayer]);
  const dimensions = useMemo(() => {
    const rows =
      mode === "tc"
        ? hydrated.tc.map((r) => ({
            login: r.login,
            unit: r.baseUnit,
            city: r.city,
            month: `${r.year}-${String(r.month).padStart(2, "0")}`,
            cluster: "",
            week: "",
            uf: r.uf,
            sub: r.sub,
            group: r.group,
            job: r.type,
          }))
        : hydrated.qq.map((r) => ({
            login: r.lt,
            unit: r.un,
            city: r.ci,
            month: r.d.slice(0, 7),
            cluster: r.cl,
            week: r.w,
            uf: "",
            sub: "",
            group: (r.osGroup as string) || "",
            job: r.service,
          }));
    return {
      units: unique(rows.map((r) => r.unit)),
      cities: unique(
        rows.map((r) =>
          presentationCityLabel(hydrated.index.get(normalizeLogin(r.login))?.city || r.city),
        ),
      ),
      sectors: unique(rows.map((r) => hydrated.index.get(normalizeLogin(r.login))?.sector || "")),
      supervisors: unique(
        rows.map(
          (r) => hydrated.index.get(normalizeLogin(r.login))?.supervisor || "Sem supervisor",
        ),
      ),
      months: unique(rows.map((r) => r.month)),
      clusters: unique(rows.map((r) => r.cluster)),
      weeks: unique(rows.map((r) => r.week)),
      ufs: unique(rows.map((r) => r.uf)),
      subclusters: unique(rows.map((r) => r.sub)),
      groups: unique(rows.map((r) => r.group)),
      jobs: unique(rows.map((r) => r.job)),
    };
  }, [mode, hydrated]);
  const filtered = useMemo(() => {
    const pass = (
      login: string,
      unit: string,
      city: string,
      month: string,
      day: string,
      ignoreMonth = false,
    ) => {
      const person = hydrated.index.get(normalizeLogin(login));
      const allows = (selected: string[], value: string) =>
        !selected.length || selected.includes(value);
      return (
        allows(filters.units, unit) &&
        allows(filters.cities, presentationCityLabel(person?.city || city)) &&
        allows(filters.sectors, person?.sector || "") &&
        allows(filters.supervisors, person?.supervisor || "Sem supervisor") &&
        (ignoreMonth || allows(filters.months, month)) &&
        (!filters.start || day >= filters.start) &&
        (!filters.end || day <= filters.end) &&
        (!filters.search ||
          norm(`${login} ${person?.full_name ?? ""} ${city} ${unit}`).includes(
            norm(filters.search),
          ))
      );
    };
    return {
      contextTC: hydrated.tc.filter(
        (r) =>
          pass(
            r.login,
            r.baseUnit,
            r.city,
            `${r.year}-${String(r.month).padStart(2, "0")}`,
            r.day,
            true,
          ) &&
          (!filters.ufs.length || filters.ufs.includes(r.uf)) &&
          (!filters.subclusters.length || filters.subclusters.includes(r.sub)) &&
          (!filters.groups.length || filters.groups.includes(r.group)) &&
          (!filters.jobs.length || filters.jobs.includes(r.type)),
      ),
      qq: hydrated.qq.filter(
        (r) =>
          qqUnitPass(r.un, filters.units) &&
          pass(r.lt, r.un, r.ci, r.d.slice(0, 7), r.d) &&
          (!filters.clusters.length || filters.clusters.includes(r.cl)) &&
          (!filters.weeks.length || filters.weeks.includes(r.w)),
      ),
      tc: hydrated.tc.filter(
        (r) =>
          pass(
            r.login,
            r.baseUnit,
            r.city,
            `${r.year}-${String(r.month).padStart(2, "0")}`,
            r.day,
          ) &&
          (!filters.ufs.length || filters.ufs.includes(r.uf)) &&
          (!filters.subclusters.length || filters.subclusters.includes(r.sub)) &&
          (!filters.groups.length || filters.groups.includes(r.group)) &&
          (!filters.jobs.length || filters.jobs.includes(r.type)),
      ),
    };
  }, [hydrated, filters]);
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
    client.setQueryData<LoadedQuality>(key, (old) => (old ? { ...old, state: next } : old));
    void client.invalidateQueries({
      queryKey: ["native-quality", profile.id],
      refetchType: "none",
    });
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
      const fresh = await fetchQualityState(saved.current, visibleKinds);
      saved.current = fresh;
      client.setQueryData<LoadedQuality>(key, (old) => (old ? { ...old, state: fresh } : old));
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
        if (data?.directoryReady) {
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
          client.setQueriesData<LoadedQuality>(
            { queryKey: ["native-quality", profile?.id] },
            (old) => (old ? { ...old, directory: entries } : old),
          );
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
      client.setQueriesData<LoadedQuality>({ queryKey: ["native-quality", profile?.id] }, (old) =>
        old ? { ...old, directory: entries } : old,
      );
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
      client.setQueriesData<LoadedQuality>({ queryKey: ["native-quality", profile?.id] }, (old) =>
        old ? { ...old, directory: entries } : old,
      );
      toast.success("Cadastro excluído. Os dados importados foram preservados.");
    } finally {
      busy.current = false;
      setSaving("");
    }
  }
  async function togglePresentation() {
    if (presentation) {
      slidePlayer.stop();
      if (document.fullscreenElement)
        try {
          await document.exitFullscreen();
        } catch {
          /* Exit the layout even if the browser refuses. */
        }
      setPresentation(false);
    } else {
      setPresentation(true);
      try {
        // Include portal-based filters/dialogs as well as the native panel.
        await document.documentElement.requestFullscreen();
      } catch {
        /* fixed presentation works without browser fullscreen. */
      }
    }
  }
  function changeMode(next: Mode) {
    slidePlayer.stop();
    setMode(next);
    setFilters(emptyFilters());
    setQQFront("ND");
  }
  const filterSelect = (name: keyof typeof dimensions, label: string) => (
    <MultiFilter
      key={name}
      label={label}
      values={dimensions[name]}
      selected={filters[name]}
      onChange={(values) => setFilters({ ...filters, [name]: values })}
      format={name === "months" ? monthLabel : undefined}
      defaultLabel={name === "units" && mode !== "tc" ? "Adesão (padrão)" : undefined}
    />
  );
  return (
    <AppShell presentation={presentation}>
      <div
        ref={panel}
        tabIndex={-1}
        className={`quality-module space-y-5 ${presentation ? "quality-presentation" : ""} ${slideState.active ? "quality-sliding" : ""}`}
        onPointerDownCapture={(event) => {
          if (
            slidePlayer.state.active &&
            !(event.target as HTMLElement).closest("[data-slides-controls],[data-slides-locked]")
          )
            slidePlayer.pause();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4" data-slides-controls>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">
              TechNET · Qualidade operacional
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">
              {technicalVisit ? "Visita técnica" : "QQ e Certificação"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {technicalVisit
                ? "Painel exclusivo de Técnico Certificado para visitas técnicas."
                : "Quebra qualificada, visão geral e técnico certificado."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!!saving || query.isFetching || slideState.active}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={() => void togglePresentation()}>
              {presentation ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {presentation ? "Sair da apresentação" : "Apresentação"}
            </Button>
            {presentation && !slideState.active && (
              <Button
                variant="outline"
                disabled={!!saving || query.isPending}
                onClick={() => {
                  if (!slidePlayer.start())
                    toast.info(
                      "Não há dados nos meses, datas e unidades selecionados para montar os slides.",
                    );
                }}
              >
                <Play className="size-4" />
                Slides
              </Button>
            )}
            {isAdmin && (
              <span className="quality-import-tools flex flex-wrap gap-2">
                {!technicalVisit && (
                  <>
                    <Button
                      variant="outline"
                      disabled={!!saving || query.isFetching}
                      onClick={() => choose("html")}
                    >
                      <FileUp className="size-4" />
                      Importar histórico HTML
                    </Button>
                    <Button
                      disabled={!!saving || query.isFetching}
                      onClick={() => choose("quebra")}
                    >
                      <FileUp className="size-4" />
                      Importar QQ (.xlsx)
                    </Button>
                  </>
                )}
                <Button
                  disabled={!!saving || query.isFetching}
                  onClick={() => choose(certificationKind)}
                >
                  <FileUp className="size-4" />
                  Importar TC (.csv / .zip)
                </Button>
              </span>
            )}
          </div>
        </div>
        <QualitySlideControls state={slideState} player={slidePlayer} />
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
        <div className="quality-source-info flex flex-wrap gap-3 text-xs text-muted-foreground">
          {visibleKinds.map((kind) => (
            <span key={kind} className="rounded-lg border px-3 py-2">
              <strong>{kind === "quebra" ? "QQ" : "TC"}:</strong>{" "}
              {state.imports[kind]
                ? `${state.imports[kind]!.row_count.toLocaleString("pt-BR")} registros · ${new Date(state.imports[kind]!.published_at!).toLocaleString("pt-BR")}`
                : "Nenhuma base importada"}
            </span>
          ))}
        </div>
        <p className="quality-source-info text-sm text-muted-foreground">
          Atualização incremental automática: atualiza as O.S. existentes, adiciona as novas e
          preserva os dias que não vieram no arquivo.
        </p>
        {lastImports.map((result) => (
          <section
            key={result.kind}
            aria-label={`Resumo da importação ${result.kind === "quebra" ? "QQ" : "TC"}`}
            className="quality-card space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">
                {result.kind === "quebra" ? "QQ" : "TC"} ·{" "}
                {result.saved ? "Base atualizada" : "Arquivo sem alterações"}
              </h2>
              <span className="text-xs text-muted-foreground break-all">{result.file}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>{result.report.added.toLocaleString("pt-BR")} adicionados</span>
              <span>{result.report.updated.toLocaleString("pt-BR")} atualizados</span>
              <span>
                {result.report.unchanged.toLocaleString("pt-BR")} já existentes sem alteração
              </span>
              <span>
                {result.report.total.toLocaleString("pt-BR")} registros na base consolidada
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Período preservado da base: {result.report.start.split("-").reverse().join("/")} até{" "}
              {result.report.end.split("-").reverse().join("/")}.
              {result.report.duplicatesInFile > 0
                ? ` ${result.report.duplicatesInFile} repetições dentro do arquivo consolidadas.`
                : ""}
              {result.report.duplicatesRemoved > 0
                ? ` ${result.report.duplicatesRemoved} duplicidades anteriores corrigidas.`
                : ""}
            </p>
          </section>
        ))}
        {query.error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            {moduleError(query.error)}
          </p>
        )}
        {data?.directoryError && (
          <p
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
          >
            {data.directoryError}
          </p>
        )}
        {saving && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
          >
            <Loader2 className="size-4 animate-spin" />
            Salvando {saving} {progress > 0 ? `· ${progress}%` : ""}
          </p>
        )}
        <nav
          aria-label="Modos de qualidade"
          className="flex flex-wrap gap-2 border-b pb-4"
          data-slides-controls
        >
          {(
            (technicalVisit
              ? [
                  ["tc", "Técnico certificado"],
                  ["logins", "Logins e supervisores"],
                ]
              : [
                  ["qq", "QQ · Adesão / Serviços"],
                  ["general", "QQ · Visão geral"],
                  ["tc", "Técnico certificado"],
                  ["logins", "Logins e supervisores"],
                ]) as Array<readonly [Mode, string]>
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={key === mode ? "default" : "outline"}
              aria-pressed={key === mode}
              onClick={() => changeMode(key)}
            >
              {key === "logins" && <Users className="size-4" />}
              {label}
              {key === "logins" && hydrated.missing.length > 0 && (
                <span className="rounded bg-amber-500/20 px-1.5 text-xs">
                  {hydrated.missing.length}
                </span>
              )}
            </Button>
          ))}
        </nav>
        {query.isPending ? (
          <div className="quality-card flex items-center justify-center gap-3 py-20">
            <Loader2 className="size-5 animate-spin" />
            Carregando dados…
          </div>
        ) : mode === "logins" ? (
          <QualityDirectory
            entries={directory}
            missing={hydrated.missing}
            editable={isAdmin && !!data?.directoryReady}
            busy={!!saving}
            onSave={updateDirectory}
            onDelete={removeLogin}
          />
        ) : (
          <>
            {slideState.active ? (
              <section
                className="quality-card flex flex-wrap gap-x-6 gap-y-2 text-xs"
                aria-label="Contexto dos slides"
                data-slides-locked
              >
                <span>
                  <strong>Unidade:</strong>{" "}
                  {filters.units.length
                    ? filters.units.join(" / ")
                    : mode === "tc"
                      ? "Todas"
                      : "Adesão"}
                </span>
                <span>
                  <strong>Cidade:</strong> {filters.cities.join(" / ") || "Todas"}
                </span>
                {mode === "tc" && (
                  <span>
                    <strong>Supervisor:</strong> {filters.supervisors.join(" / ") || "Todos"}
                  </span>
                )}
                <span>
                  <strong>Mês:</strong>{" "}
                  {filters.months.length ? filters.months.map(monthLabel).join(" / ") : "Todos"}
                </span>
                {(filters.start || filters.end) && (
                  <span>
                    <strong>Datas:</strong>{" "}
                    {filters.start.split("-").reverse().join("/") || "Início da base"} até{" "}
                    {filters.end.split("-").reverse().join("/") || "Fim da base"}
                  </span>
                )}
              </section>
            ) : (
              <fieldset
                disabled={slideState.active}
                className="quality-card space-y-4"
                data-slides-locked
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-bold">Filtros do painel</h2>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters())}>
                      Limpar filtros
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedFilters(!expandedFilters)}
                    >
                      <SlidersHorizontal className="size-4" />
                      {expandedFilters ? "Menos filtros" : "Mais filtros"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {filterSelect("units", "Unidade de negócio")}
                  {filterSelect("cities", "Cidade")}
                  {filterSelect("sectors", "Setor")}
                  {filterSelect("supervisors", "Supervisor")}
                  {filterSelect("months", "Mês")}
                </div>
                {mode !== "tc" && (
                  <p className="text-xs text-muted-foreground">
                    {filters.units.length
                      ? "Unidades selecionadas explicitamente."
                      : "Adesão por padrão. Desconexão, Visita técnica e outras unidades só entram quando selecionadas."}
                  </p>
                )}
                {slideState.active && (
                  <p className="text-xs text-muted-foreground">
                    Slides mantêm meses, datas e o recorte de unidades. Cidades e supervisores
                    alternam automaticamente; ao encerrar, seus filtros são restaurados.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Buscar login ou nome
                    <Input
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      placeholder="Pesquisar técnico"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Data inicial {mode === "tc" ? "(fim do trabalho)" : "(agenda)"}
                    <Input
                      type="date"
                      value={filters.start}
                      onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Data final
                    <Input
                      type="date"
                      value={filters.end}
                      onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                    />
                  </label>
                </div>
                {expandedFilters && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {mode === "tc" ? (
                      <>
                        {filterSelect("ufs", "UF")}
                        {filterSelect("subclusters", "Subcluster")}
                        {filterSelect("groups", "Grupo da ordem")}
                        {filterSelect("jobs", "Tipo de job")}
                      </>
                    ) : (
                      <>
                        {filterSelect("clusters", "Cluster")}
                        {filterSelect("weeks", "Semana")}
                      </>
                    )}
                  </div>
                )}
              </fieldset>
            )}
            {mode === "tc" ? (
              <TCMetrics
                key={`tc:${metricsEpoch}`}
                records={filtered.tc}
                contextRecords={filtered.contextTC}
                allRecords={hydrated.tc}
                index={hydrated.index}
                view={tcView}
                onViewChange={setTCView}
                plans={tcPlans}
                onPlansChange={setTCPlans}
                locked={slideState.active}
              />
            ) : (
              <QQMetrics
                key={`${mode}:${metricsEpoch}`}
                records={filtered.qq}
                general={mode === "general"}
                index={hydrated.index}
                front={qqFront}
                onFrontChange={setQQFront}
                locked={slideState.active}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
function MultiFilter({
  label,
  values,
  selected,
  onChange,
  format,
  defaultLabel,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  format?: ((value: string) => string) | undefined;
  defaultLabel?: string | undefined;
}) {
  const [search, setSearch] = useState("");
  return (
    <div data-quality-filter={label}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
            aria-label={`${label}: ${selected.length ? (selected.length === 1 ? format?.(selected[0]!) || selected[0] : `${selected.length} selecionados`) : defaultLabel || "Todos"}`}
          >
            <span className="truncate">
              {selected.length === 0
                ? defaultLabel || "Todos"
                : selected.length === 1
                  ? (format?.(selected[0]!) ?? selected[0])
                  : `${selected.length} selecionados`}
            </span>
            <span>⌄</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="quality-dialog w-72 space-y-3">
          <Input
            aria-label={`Buscar ${label}`}
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                defaultLabel
                  ? values.length > 0 && values.every((v) => selected.includes(v))
                  : !selected.length
              }
              onChange={(event) =>
                onChange(defaultLabel && event.target.checked ? [...values] : [])
              }
            />
            {defaultLabel ? "Todas as unidades (seleção explícita)" : "Todos"}
          </label>
          {defaultLabel && (
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Voltar à Adesão
            </Button>
          )}
          <div className="max-h-64 space-y-2 overflow-auto">
            {values
              .filter((value) => norm(value).includes(norm(search)))
              .map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, value]
                          : selected.filter((v) => v !== value),
                      )
                    }
                  />
                  {format?.(value) ?? value}
                </label>
              ))}
            {!values.length && <p className="text-xs text-muted-foreground">Sem opções na base.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
