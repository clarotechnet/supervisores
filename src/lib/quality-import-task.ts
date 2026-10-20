import type { CertificationKind, QualitySnapshot } from "./quality";
import type { QualityImportResult } from "./quality-merge";
export type QualityImportStage = "reading" | "validating" | "merging" | "comparing";
export type QualityImportTaskResult = QualityImportResult & { changed: boolean };
// Parsing and comparing a quarterly CSV must not freeze the page's main thread.
export function runTCImportTask(
  file: File,
  current: QualitySnapshot | undefined,
  kind: CertificationKind,
  progress: (stage: QualityImportStage) => void,
): Promise<QualityImportTaskResult> {
  const worker = new Worker(new URL("./quality-import.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.onmessage = (
      event: MessageEvent<{
        stage?: QualityImportStage;
        result?: QualityImportTaskResult;
        error?: string;
      }>,
    ) => {
      if (event.data.stage) progress(event.data.stage);
      else if (event.data.result) {
        finish();
        resolve(event.data.result);
      } else {
        finish();
        reject(Error(event.data.error || "Não foi possível processar o analítico TC."));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(Error(event.message || "Falha ao processar o analítico TC. Tente novamente."));
    };
    worker.onmessageerror = () => {
      finish();
      reject(Error("Falha ao transferir os registros do analítico TC."));
    };
    try {
      worker.postMessage({ file, current, kind });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
