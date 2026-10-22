import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { importSlaFile, sameSlaSnapshot } from "@/lib/sla-import";
import { slaErrorMessage, type SlaDataset } from "@/lib/sla-warranty";
import { fetchSlaDataset, saveSlaDataset } from "@/services/sla-warranty";
import { referenceScope } from "./reference-scope";
import { mountSla } from "./sla-reference/sla-engine";
import { slaMarkup, slaStyle } from "./sla-reference/templates";
import type { SlaEngine } from "./sla-types";
import type { ReferenceParent } from "./reference-types";
import type { QualityRegistry } from "@/lib/quality";
import { slaPresentation } from "./sla-presentation";
import presentationStyle from "./sla-presentation.css?inline";
import directoryStyle from "./sla-directory.css?inline";
import tableSortStyle from "./sla-table-sort.css?inline";
import "./sla-warranty.css";

interface Props {
  active: boolean;
  presenting: boolean;
  registry: QualityRegistry;
}
export function SlaWarrantyPanel({ active, presenting, registry }: Props) {
  const [opened, setOpened] = useState(active);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  return opened ? (
    <SlaContents active={active} presenting={presenting} registry={registry} />
  ) : null;
}
function SlaContents({ active, presenting, registry }: Props) {
  const { profile, isAdmin } = useAuth();
  const client = useQueryClient();
  const key = ["sla-warranty", profile?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!profile,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchSlaDataset(client.getQueryData<SlaDataset>(key), signal),
  });
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<SlaEngine | null>(null),
    presentation = useRef<ReturnType<typeof slaPresentation> | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ dataset: query.data, isAdmin, user: profile?.id, registry });
  latest.current = { dataset: query.data, isAdmin, user: profile?.id, registry };
  const busy = useRef(false);
  const [operation, setOperation] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const importRef = useRef<(file: File) => Promise<void>>(async () => {});
  importRef.current = async (file) => {
    if (!latest.current.isAdmin || !latest.current.user || busy.current) return;
    const importingUser = latest.current.user;
    const importKey = ["sla-warranty", importingUser];
    const confirmUser = () => {
      if (latest.current.user !== importingUser || !latest.current.isAdmin)
        throw Error("A sessão mudou. Entre novamente antes de importar SLA.");
    };
    busy.current = true;
    setError("");
    setSummary("");
    setProgress(0);
    setOperation("Conferindo a versão atual do SLA…");
    try {
      await client.cancelQueries({ queryKey: importKey });
      const fresh = await fetchSlaDataset(latest.current.dataset);
      confirmUser();
      setOperation(`Lendo e validando ${file.name}…`);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const snapshot = await importSlaFile(file, fresh.snapshot);
      confirmUser();
      if (sameSlaSnapshot(fresh.snapshot, snapshot)) {
        client.setQueryData(importKey, fresh);
        setSummary(
          "Esse arquivo já está na base de SLA. Nenhuma duplicação ou nova versão foi criada.",
        );
        return;
      }
      setOperation(`Salvando ${file.name}…`);
      const published = await saveSlaDataset(
        snapshot,
        file.name,
        importingUser,
        fresh.manifest?.id ?? null,
        setProgress,
      );
      confirmUser();
      client.setQueryData(importKey, published);
      setSummary(
        `SLA atualizado · ${snapshot.current.records.length.toLocaleString("pt-BR")} registros na fonte atual · ${file.name}. A fonte atual foi substituída, sem acrescentar cópias e sem alterar QQ, TC ou Visita técnica.`,
      );
      toast.success("SLA Garantia atualizado.");
    } catch (reason) {
      const message = slaErrorMessage(reason);
      setError(message);
      toast.error(message);
    } finally {
      busy.current = false;
      setOperation("");
    }
  };
  useEffect(() => {
    const parent: ReferenceParent = {
      getSupervisorMap: () => latest.current.registry,
      refreshUnifiedMonth() {},
      setUnifiedMonths() {},
      setUnifiedDates() {},
      applyUnifiedDates() {},
      clearUnifiedDates() {},
      show() {},
    };
    const scope = referenceScope(
      host.current!,
      `${slaStyle}\n${presentationStyle}\n${directoryStyle}\n${tableSortStyle}`,
      slaMarkup,
      parent,
      isAdmin,
      async (_, file) => importRef.current(file),
    );
    engine.current = mountSla(scope.environment);
    presentation.current = slaPresentation(scope);
    return () => {
      presentation.current?.dispose();
      presentation.current = null;
      engine.current?.closeModal();
      engine.current = null;
      scope.dispose();
    };
  }, [isAdmin, profile?.id]);
  useEffect(() => {
    if (query.data?.snapshot) engine.current?.loadProjectData(query.data.snapshot);
  }, [query.data?.snapshot, isAdmin, profile?.id]);
  useEffect(() => {
    engine.current?.refreshSupervisorRegistry();
  }, [registry, isAdmin, profile?.id]);
  useEffect(() => {
    if (!active) {
      engine.current?.closeModal();
      presentation.current?.close();
    }
  }, [active]);
  useEffect(() => {
    presentation.current?.setPresenting(presenting);
  }, [presenting, isAdmin, profile?.id]);
  useEffect(() => {
    const input = host.current?.shadowRoot?.getElementById("fileInput") as HTMLInputElement | null;
    if (input) input.disabled = !isAdmin || !!operation;
  }, [isAdmin, operation]);
  const message = error || (query.error ? slaErrorMessage(query.error) : "");
  return (
    <div className={`sla-warranty-panel${presenting ? " is-presenting" : ""}`}>
      <div className="sla-system-controls">
        <div>
          <strong>Base de SLA Garantia</strong>
          <span>
            Fonte independente de QQ e Técnico Certificado. A importação mantém os dois indicadores
            e os cálculos do HTML.
          </span>
        </div>
        <button
          type="button"
          disabled={!!operation || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Atualizar base
        </button>
        {isAdmin && (
          <button type="button" disabled={!!operation} onClick={() => fileInput.current?.click()}>
            Importar histórico HTML
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".html"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importRef.current(file);
          }}
        />
      </div>
      <div className="sla-system-status">
        {query.isFetching && <p role="status">Carregando a base completa de SLA Garantia…</p>}
        {operation && (
          <p role="status">
            {operation} {progress > 0 ? `${progress}%` : ""}
          </p>
        )}
        {message && <p role="alert">{message}</p>}
        {summary && <p role="status">{summary}</p>}
        {!query.isFetching && !message && !query.data?.snapshot && (
          <p role="status">
            Nenhuma base de SLA importada. Importe CSV/XLSX ou o histórico do HTML para iniciar.
          </p>
        )}
      </div>
      <div
        ref={host}
        className="sla-surface"
        aria-label="SLA Garantia"
        hidden={!!query.error || query.isPending}
      />
    </div>
  );
}
