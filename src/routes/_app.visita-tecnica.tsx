import { createFileRoute } from "@tanstack/react-router";
import { QualityDashboard } from "@/components/quality/QualityDashboard";
export const Route = createFileRoute("/_app/visita-tecnica")({
  ssr: false,
  component: () => <QualityDashboard key="technical_visit" variant="technical_visit" />,
});
