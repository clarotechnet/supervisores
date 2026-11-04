/** Fechamentos explicitamente confirmados para o TC de QQ e Certificação.
 * Não extrapolar para outras competências ou para Visita técnica.
 * Os dados importados e seus campos de DATA_NOTA permanecem intactos.
 */
const confirmedClosings: Readonly<Record<string, Readonly<{ start: string; end: string }>>> = {
  "2026-11": { start: "2026-10-22", end: "2026-11-21" },
};

type PeriodRecord = {
  year: number | null;
  month: number | null;
  day: string;
  finish?: string;
};

export function referenceTCClosing(month: string, technicalVisit = false) {
  return technicalVisit ? undefined : confirmedClosings[month];
}

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(day + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}

function workDay(row: PeriodRecord): string {
  if (validDay(row.day)) return row.day;
  const br = row.finish?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  const day = br ? `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}` : "";
  return validDay(day) ? day : "";
}

function adjacentMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, number! - 1 + offset, 1)).toISOString().slice(0, 7);
}

/** Um único fechamento por registro: os dias 22/10 e 21/11 pertencem a novembro,
 * não são contados novamente em outubro/dezembro. Demais cortes seguem a nota.
 */
export function referenceTCRecordMonth(row: PeriodRecord, technicalVisit = false): string {
  const noteMonth =
    row.year && row.month ? `${row.year}-${String(row.month).padStart(2, "0")}` : "";
  if (technicalVisit) return noteMonth;
  const day = workDay(row);
  if (day)
    for (const [month, period] of Object.entries(confirmedClosings))
      if (day >= period.start && day <= period.end) return month;
  const period = referenceTCClosing(noteMonth);
  if (!period) return noteMonth;
  // Sem data de trabalho verificável, não atribuir ao fechamento confirmado.
  if (!day) return "";
  return adjacentMonth(noteMonth, day < period.start ? -1 : 1);
}

export function referenceTCPeriodDescription(technicalVisit = false): string {
  return technicalVisit
    ? "Competência por DATA_NOTA; filtro de datas e dias de produtividade por FIM_TRABALHO."
    : "Novembro/2026: de 22/10/2026 a 21/11/2026, inclusive, por FIM_TRABALHO. Demais competências seguem DATA_NOTA.";
}
