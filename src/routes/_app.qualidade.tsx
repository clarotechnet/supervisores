import { createFileRoute } from "@tanstack/react-router";
import { QualityDashboard } from "@/components/quality/QualityDashboard";
export const Route = createFileRoute("/_app/qualidade")({
  ssr: false,
  component: () => <QualityDashboard key="quality" />,
});
