import { importTC } from "./quality-import";
import { qualitySnapshotChanged } from "./quality-merge";
import type { CertificationKind, QualitySnapshot } from "./quality";
self.onmessage = async (
  event: MessageEvent<{ file: File; current?: QualitySnapshot; kind: CertificationKind }>,
) => {
  try {
    const { file, current, kind } = event.data;
    const result = await importTC(file, current, kind, (stage) => self.postMessage({ stage }));
    self.postMessage({ stage: "comparing" });
    self.postMessage({
      result: { ...result, changed: qualitySnapshotChanged(kind, current, result.snapshot) },
    });
  } catch (error) {
    self.postMessage({ error: (error as Error)?.message || "Analítico de TC inválido." });
  }
};
