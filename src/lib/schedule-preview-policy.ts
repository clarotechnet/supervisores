import type { ScheduleGeneratedPreview } from "./schedule-generator";
import { normalizeScheduleEmployeeName } from "./schedule-generator-rules";
import { scheduleCodeKind } from "./schedule-import";

export const vacationContinuationWarning = (name: string) =>
  name +
  ": férias mantidas na proposta, sem data de retorno presumida. Ajuste as datas no Sheets oficial após criar a aba; este aviso não impede a publicação.";

/** Reclassifica somente a antiga confirmação de continuidade de férias.
 * Não altera células, outros bloqueios nem a versão persistida no histórico.
 */
export function applyVacationContinuationPolicy(
  preview: ScheduleGeneratedPreview,
): ScheduleGeneratedPreview {
  const warnings = [...preview.warnings];
  const blockingIssues = preview.blockingIssues.filter((message) => {
    const match = message.match(
      /^(.+): confirmar datas de F[ée]rias antes de publicar a nova escala\.$/i,
    );
    if (!match) return true;
    const person = preview.payload.people.find(
      (p) => normalizeScheduleEmployeeName(p.name) === normalizeScheduleEmployeeName(match[1]!),
    );
    if (
      !person ||
      !preview.payload.dates.some(
        (date) =>
          date.startsWith(preview.targetMonth + "-") &&
          scheduleCodeKind(person.assignments[date] || "") === "vacation",
      )
    )
      return true;
    warnings.push(vacationContinuationWarning(person.name));
    return false;
  });
  return { ...preview, blockingIssues, warnings: [...new Set(warnings)] };
}
