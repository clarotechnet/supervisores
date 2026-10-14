import type { QQRecord, TCRecord } from "@/lib/quality-math";
import type { QualityRegistry } from "@/lib/quality";
export interface ReferenceEngine {
  loadProjectData(payload: {
    rows: QQRecord[] | TCRecord[];
    names?: Record<string, string>;
    techMap?: unknown;
    nameUpdates?: unknown;
  }): void;
  redraw(): void;
  setUnifiedPresentation(on: boolean): void;
  setUnifiedQQView?(view: "general" | "front"): void;
  getUnifiedUnits(): { units: string[]; selected: string[]; multiple: boolean; ready: boolean };
  setUnifiedUnits(values: string[]): boolean;
  getUnifiedMonths(): { months: string[]; selected: string[] };
  setUnifiedMonths(values: string[]): void;
  getUnifiedDates(): { start: string; end: string };
  setUnifiedDates(value: { start: string; end: string }): boolean;
  refreshSupervisorRegistry(): void;
  isModalOpen(): boolean;
  closeModal(): void;
  getProjectState(): unknown;
  openDataAudit?(tcCount: number): void;
  technetSlides: {
    ready(): boolean;
    begin(): unknown;
    show(slide: unknown): boolean;
    restore(snapshot: unknown): void;
  };
}
export interface ReferenceParent {
  getSupervisorMap(): QualityRegistry;
  refreshUnifiedMonth(): void;
  refreshUnifiedDates?(): void;
  setUnifiedMonths(months: string[]): void;
  setUnifiedDates(dates: { start: string; end: string }): void;
  applyUnifiedDates(dates: { start: string; end: string }): void;
  clearUnifiedDates(): void;
  show(mode: string): void;
}
export interface ReferenceEnvironment {
  technicalVisit?: boolean;
  document: Document;
  window: Window & ReferenceEngine;
  localStorage: Storage;
  location: { search: string };
  ResizeObserver: typeof ResizeObserver;
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestAnimationFrame: typeof window.requestAnimationFrame;
  editable: boolean;
  importFile(kind: "qq" | "tc", file: File): Promise<void>;
}
