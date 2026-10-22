import type { SlaSnapshot } from "@/lib/sla-warranty";
export interface SlaEngine {
  loadProjectData(snapshot: SlaSnapshot): void;
  redraw(): void;
  refreshSupervisorRegistry(): void;
  isModalOpen(): boolean;
  closeModal(): void;
  getProjectState(): unknown;
}
