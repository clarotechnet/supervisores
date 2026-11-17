import { analyzeSchedule, type AnalysisRule } from "./schedule-ai-analysis.ts";
import type { Payload } from "./schedule-operational.ts";

export const PUBLICATION_REASON_MIN = 20;
export const PUBLICATION_REASON_MAX = 2000;
export type PublicationIssue = {
  id: string;
  source: "saved" | "sheet";
  date: string | null;
  title: string;
  detail: string;
};
export type PublicationReview = {
  issues: PublicationIssue[];
  reviewToken: string;
  sheetId: string;
  draftId: string;
  month: string;
};
export type PublicationExceptionInput = {
  reason: string;
  acknowledged: true;
  reviewToken: string;
};
export class InvalidPublicationException extends Error {}
export function publicationReasonError(value: string): string | null {
  const text = value.trim();
  if (text.length < PUBLICATION_REASON_MIN || text.length > PUBLICATION_REASON_MAX)
    return "Informe uma justificativa de 20 a 2000 caracteres.";
  if (
    [...text].some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    return "A justificativa contém caracteres inválidos.";
  return null;
}
export function validatePublicationException(value: unknown): PublicationExceptionInput {
  const input = value as Partial<PublicationExceptionInput> | null;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof input.reason !== "string"
  )
    throw new InvalidPublicationException("Informe a justificativa da publicação com ressalva.");
  const error = publicationReasonError(input.reason);
  if (error) throw new InvalidPublicationException(error);
  if (input.acknowledged !== true)
    throw new InvalidPublicationException("Confirme a publicação com as pendências listadas.");
  if (typeof input.reviewToken !== "string" || !/^[a-f0-9]{64}$/.test(input.reviewToken))
    throw new InvalidPublicationException("Revise novamente as pendências antes de publicar.");
  return { reason: input.reason.trim(), acknowledged: true, reviewToken: input.reviewToken };
}
export function savedPublicationIssues(warnings: unknown): PublicationIssue[] {
  return (Array.isArray(warnings) ? warnings : []).flatMap((notice, index) => {
    if (!notice || typeof notice !== "object" || notice.level !== "blocking") return [];
    return [
      {
        id: "saved:" + index,
        source: "saved" as const,
        date: null,
        title: "Pendência da versão salva",
        detail:
          typeof notice.message === "string" && notice.message.trim()
            ? notice.message.slice(0, 4000)
            : "Pendência de publicação registrada nesta versão.",
      },
    ];
  });
}
export async function reviewSchedulePublication(input: {
  sheetId: string;
  sheetUpdatedAt: string;
  draftId: string;
  month: string;
  planned: Payload;
  current: Payload;
  policy: unknown;
  warnings: unknown;
  rule: AnalysisRule;
}): Promise<PublicationReview> {
  const month = input.month.slice(0, 7);
  const analysis = analyzeSchedule(input.planned, input.current, {
    ...input.rule,
    analysisMonth: month,
  });
  const blockers = analysis.issues.filter((issue) =>
    issue.kind === "weekly"
      ? input.current.dates.some(
          (day) =>
            day.startsWith(month + "-") &&
            day >= issue.date &&
            day <=
              new Date(Date.parse(issue.date + "T12:00:00Z") + 6 * 86400000)
                .toISOString()
                .slice(0, 10),
        )
      : issue.severity === "high" &&
        /^(coverage|role):/.test(issue.id) &&
        (new Date(issue.date + "T12:00:00Z").getUTCDay() === 0 ||
          issue.kind === "role" ||
          issue.title !== "Ausência em dia de trabalho"),
  );
  const issues: PublicationIssue[] = [
    ...savedPublicationIssues(input.warnings),
    ...blockers.map((issue) => ({
      id: "sheet:" + issue.id,
      source: "sheet" as const,
      date: issue.date,
      title: issue.title.slice(0, 240),
      detail: issue.detail.slice(0, 4000),
    })),
  ];
  if (issues.length > 500)
    throw new InvalidPublicationException(
      "Há pendências demais para uma única ressalva. Revise a escala e analise novamente.",
    );
  // Inclui todo o conteúdo, não só a lista de problemas. Uma edição no Sheets,
  // no rascunho ou no vínculo invalida a confirmação anterior.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        sheetId: input.sheetId,
        updatedAt: input.sheetUpdatedAt,
        draftId: input.draftId,
        month,
        planned: input.planned,
        current: input.current,
        policy: input.policy,
        warnings: input.warnings,
        issues,
      }),
    ),
  );
  const reviewToken = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { issues, reviewToken, sheetId: input.sheetId, draftId: input.draftId, month };
}
