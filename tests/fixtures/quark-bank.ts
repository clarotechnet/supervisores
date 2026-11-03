import type { QuarkDay, QuarkPersonView } from "../../src/lib/quark";
import type { QuarkBankExportContext } from "../../src/lib/quark-bank-export";

export const bankContext: QuarkBankExportContext = {
  startDate: "2026-09-26",
  endDate: "2026-10-25",
  filters: {
    collaborator: "Todos",
    city: "Recife",
    sector: "Campo",
    unit: "DMV Recife",
    supervisor: "Equipe A",
  },
};

export function bankPerson(id: string, fullName: string, unitId = 1): QuarkPersonView {
  return {
    unit_id: unitId,
    collaborator_id: id,
    full_name: fullName,
    unit_name: `DMV ${unitId}`,
    unit_city: "Recife",
    registration: `00${id}`,
    job_title: "Técnico",
    job_link_title: null,
    api_sector: "Campo",
    admission_date: null,
    is_active: true,
    is_esocial: false,
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-10-25T00:00:00Z",
    updated_at: "2026-10-25T00:00:00Z",
    home: null,
    directory: {
      unit_id: unitId,
      collaborator_id: id,
      city: "Recife",
      sector: "Campo",
      supervisor: "Equipe A",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-10-25T00:00:00Z",
      updated_by: null,
    },
  };
}

export function bankDay(
  person: QuarkPersonView,
  workDate: string,
  balance: number,
  extra = 0,
): QuarkDay {
  return {
    unit_id: person.unit_id,
    collaborator_id: person.collaborator_id,
    work_date: workDate,
    bank_balance_minutes: balance,
    normal_extra_minutes: extra,
    night_extra_minutes: 0,
    extra_100_minutes: 0,
    absence_minutes: 0,
    bank_operation: null,
    bank_processed_until: null,
    bank_status: null,
    excused_absence_minutes: 0,
    is_day_off: false,
    journey: null,
    late_minutes: 0,
    observation: null,
    scheduled_minutes: 480,
    unexcused_absence_minutes: 0,
    updated_at: "2026-10-25T12:00:00Z",
    weekday: null,
    worked_minutes: 480 + extra,
  };
}

export const bankPeople = [
  bankPerson("1", "Ana Positiva"),
  bankPerson("2", "Bruno Negativo"),
  bankPerson("3", "Carla Zerada"),
  bankPerson("4", "Davi Sem Registros"),
];
export const bankDays = [
  bankDay(bankPeople[0]!, "2026-09-26", 1500, 121),
  bankDay(bankPeople[0]!, "2026-10-25", 30, 120),
  {
    ...bankDay(bankPeople[1]!, "2026-10-24", -3030, 70),
    night_extra_minutes: 30,
    extra_100_minutes: 40,
  },
  bankDay(bankPeople[2]!, "2026-10-25", 0, 119),
];
