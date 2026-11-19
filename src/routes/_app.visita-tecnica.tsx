import { lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { QualityDashboard } from "@/components/quality/QualityDashboard";
import { cn } from "@/lib/utils";

const Revisitas = lazy(() =>
  import("@/components/quality/VtRevisitas").then((module) => ({ default: module.VtRevisitas })),
);

export const Route = createFileRoute("/_app/visita-tecnica")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { view?: "revisitas" } =>
    search["view"] === "revisitas" ? { view: "revisitas" } : {},
  component: VisitaTecnica,
});

function VisitaTecnica() {
  const { view } = Route.useSearch();
  const revisitas = view === "revisitas";
  const nav = (
    <nav
      aria-label="Visita técnica"
      className="mb-3 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2"
    >
      <Link
        to="/visita-tecnica"
        search={{}}
        aria-current={!revisitas ? "page" : undefined}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-semibold",
          !revisitas
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Técnico Certificado
      </Link>
      <Link
        to="/visita-tecnica"
        search={{ view: "revisitas" }}
        aria-current={revisitas ? "page" : undefined}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-semibold",
          revisitas ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
      >
        Revisitas
      </Link>
    </nav>
  );
  if (revisitas)
    return (
      <AppShell fullWidth>
        <div className="mx-auto max-w-[1640px] px-3 pb-8 pt-3 sm:px-5">
          {nav}
          <Suspense fallback={<p role="status">Carregando Revisitas…</p>}>
            <Revisitas />
          </Suspense>
        </div>
      </AppShell>
    );
  return <QualityDashboard key="technical_visit" variant="technical_visit" navigation={nav} />;
}
