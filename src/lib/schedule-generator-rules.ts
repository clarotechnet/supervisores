import { CONTROL_DECEMBER_NO_DUTY } from "./schedule-control-december-reference";

/**
 * Políticas operacionais informadas pela gestão.
 * Nunca confundir este catálogo com regras legais/CCT: jornada, descansos e
 * feriados devem ser validados separadamente antes da publicação.
 */
export type ScheduleGenerationRule = {
  city: string;
  sector: string;
  label: string;
  sundayDutyCount: number | null;
  holidayDutyCount: number | null;
  holidayWeekdaysOnly?: boolean;
  saturdayShift: "M. 1" | "M. 2" | "T. 1";
  defaultShift: "M. 1" | "T. 1";
  minimumIntermediateDuties: number;
  excludedFromDuty: readonly string[];
  // 0 = domingo, 1 = segunda, ... 6 = sábado.
  fixedOffWeekdays?: readonly number[];
  fixedOffDistribution?: Readonly<Record<number, number>>;
  fixedOffStrategy?: "balanced" | "login-duty-eligible";
  fixedOffSaturdayShare?: number;
  dutyRequiresLogin?: boolean;
  lastSundayDutyCount?: number;
  dutyCode?: "M. 1" | "T. 1" | "PLANTÃO";
  minimumSupervisorDuty?: number;
  minimumAdesaoControllerDuty?: number;
  personShiftOverrides?: Readonly<Record<string, "M. 1" | "T. 1">>;
  dateDutyOverrides?: Readonly<Record<string, number>>;
  additionalHolidays?: readonly string[]; // MM-DD
  requiresRoleBasedCoverage?: boolean;
  notes?: string;
};

const excludedAdesaoNatal = [
  "BRUNO GABRIEL OLIVEIRA PEREIRA",
  "CHARLES OLIVEIRA DA SILVA",
  "JEFFERSON ANTONIO PEREIRA FERNANDES PIMENTEL",
  "JOAO MARIA DE OLIVEIRA",
  "THIAGO HENRIQUE SILVA",
  "UILDSON OLIVEIRA BARROS",
] as const;

export const scheduleGenerationRules: readonly ScheduleGenerationRule[] = [
  {
    city: "natal",
    sector: "adesao-servico",
    label: "Natal · Adesão/Serviço",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "login-duty-eligible",
    fixedOffSaturdayShare: 0.25,
    dutyRequiresLogin: true,
    lastSundayDutyCount: 10,
    sundayDutyCount: 3,
    holidayDutyCount: 5,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: excludedAdesaoNatal,
    additionalHolidays: ["11-21"],
    notes:
      "Adesão: 25% dos técnicos com login, disponíveis e elegíveis a plantão têm folga fixa no sábado; os demais se dividem entre segunda e sexta. Domingo: 3; último domingo: 10; feriado: 5.",
  },
  {
    city: "natal",
    sector: "mdu",
    label: "Natal · MDU",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "balanced",
    sundayDutyCount: 0,
    holidayDutyCount: 1,
    holidayWeekdaysOnly: true,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    additionalHolidays: ["11-21"],
  },
  {
    city: "natal",
    sector: "vt",
    label: "Natal · VT",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "balanced",
    sundayDutyCount: 5,
    holidayDutyCount: 5,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 2,
    excludedFromDuty: [],
    additionalHolidays: ["11-21"],
  },
  {
    city: "natal",
    sector: "construcao",
    label: "Natal · Construção",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "balanced",
    sundayDutyCount: 0,
    holidayDutyCount: 0,
    saturdayShift: "M. 2",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
  },
  {
    city: "natal",
    sector: "desconexao",
    label: "Natal · Desconexão",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "balanced",
    sundayDutyCount: 0,
    holidayDutyCount: 0,
    saturdayShift: "M. 2",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
  },
  {
    city: "mossoro",
    sector: "mossoro",
    label: "Mossoró · Operacional",
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    fixedOffStrategy: "balanced",
    sundayDutyCount: 1,
    holidayDutyCount: 1,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    additionalHolidays: ["12-13"],
    notes: "13/12 é Santa Luzia, coincidente com domingo em 2026; não duplicar a demanda.",
  },
  {
    city: "fortaleza",
    sector: "instalacao",
    label: "Fortaleza · Instalação",
    sundayDutyCount: null,
    holidayDutyCount: null,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    notes: "Cobertura diferente do RN, mas ainda não informada: não estimar nem publicar plantões.",
  },
  {
    city: "fortaleza",
    sector: "manutencao",
    label: "Fortaleza · Manutenção",
    sundayDutyCount: 3,
    holidayDutyCount: 3,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    personShiftOverrides: { "FABIO DE SOUZA APOLINARIO": "T. 1" },
    notes: "Manter Fábio de Souza Apolinário em T. 1 nos dias trabalhados.",
  },
  {
    city: "fortaleza",
    sector: "desconexao",
    label: "Fortaleza · Desconexão",
    sundayDutyCount: 0,
    holidayDutyCount: 0,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    notes: "Ao passar para 5x2, sábado trabalhado deve ser M. 1 (não M. 2).",
  },
  {
    city: "recife",
    sector: "instalacao",
    label: "Recife · Instalação",
    sundayDutyCount: 1,
    holidayDutyCount: 1,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
  },
  {
    city: "recife",
    sector: "desconexao",
    label: "Recife · Desconexão",
    sundayDutyCount: 0,
    holidayDutyCount: 0,
    saturdayShift: "M. 1",
    defaultShift: "M. 1",
    minimumIntermediateDuties: 0,
    excludedFromDuty: [],
    notes:
      "Confirmar com gestão o turno de sábado; aplicado M. 1 como na nova regra de Desconexão CE.",
  },
  {
    city: "natal",
    sector: "controle-operacional",
    label: "Controle RN · Multicidade",
    sundayDutyCount: 3,
    holidayDutyCount: 3,
    saturdayShift: "T. 1",
    defaultShift: "T. 1",
    minimumIntermediateDuties: 0,
    fixedOffWeekdays: [1, 2, 3, 4, 5, 6],
    dutyCode: "PLANTÃO",
    minimumSupervisorDuty: 1,
    minimumAdesaoControllerDuty: 1,
    // Verde no Excel de dezembro: NÃO incluir no rodízio automático.
    // O editor da prévia permite alteração pela gestão, sem tocar no original.
    excludedFromDuty: CONTROL_DECEMBER_NO_DUTY,
    notes:
      "Referência dez/2026: 3 por domingo/feriado, incluindo 1 supervisor COP e no mínimo 1 controlador de Adesão. Conferir cobertura por cidade e cargo antes de publicar.",
  },
];

export function normalizeScheduleEmployeeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getScheduleGenerationRule(
  city: string,
  sector: string,
): ScheduleGenerationRule | null {
  return scheduleGenerationRules.find((x) => x.city === city && x.sector === sector) ?? null;
}

export function isExcludedFromDuty(name: string, policy: ScheduleGenerationRule): boolean {
  const normalized = normalizeScheduleEmployeeName(name);
  return policy.excludedFromDuty.some((s) => normalizeScheduleEmployeeName(s) === normalized);
}
/** Quota do último domingo resolvida para a competência, inclusive na análise IA. */
export function scheduleRuleForMonth(
  rule: ScheduleGenerationRule,
  month: string,
): ScheduleGenerationRule {
  if (rule.lastSundayDutyCount === undefined) return rule;
  const [year, m] = month.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year!, m!, 0, 12));
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  const date = last.toISOString().slice(0, 10);
  return {
    ...rule,
    dateDutyOverrides: { ...rule.dateDutyOverrides, [date]: rule.lastSundayDutyCount },
  };
}
