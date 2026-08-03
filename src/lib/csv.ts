import { formatShortDate, hhmm, isLate, localTime } from "@/lib/date-utils";
import type { TaskRecord } from "@/lib/types";

export interface CsvRow {
  record: TaskRecord;
  sectorName: string;
  supervisorName: string;
}

const HEADERS = [
  "Data",
  "Setor",
  "Supervisor",
  "Atividade",
  "Grupo",
  "Horário previsto",
  "Status",
  "Horário realizado",
  "Observação",
  "Atrasada",
];

const STATUS_PT: Record<string, string> = {
  pending: "Pendente",
  completed: "Concluída",
  reopened: "Reaberta",
};

function escape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: CsvRow[]): string {
  const lines = [HEADERS.map(escape).join(";")];
  for (const { record, sectorName, supervisorName } of rows) {
    const late = isLate({
      scheduledDate: record.scheduled_date,
      scheduledTime: record.scheduled_time,
      completed: record.status === "completed",
    });
    lines.push(
      [
        formatShortDate(record.scheduled_date),
        sectorName,
        supervisorName,
        record.title,
        record.group_name,
        hhmm(record.scheduled_time),
        STATUS_PT[record.status] ?? record.status,
        localTime(record.completed_at),
        record.note ?? "",
        late ? "Sim" : "Não",
      ]
        .map(escape)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
