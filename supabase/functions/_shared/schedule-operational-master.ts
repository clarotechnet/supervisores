/**
 * Controle RN — contrato de aba MENSAL dentro da planilha Google existente.
 * Uma aba por mês, duas linhas de cabeçalho e NOME/FUNÇÃO nas colunas A/B.
 * As abas anteriores não são modificadas.
 */
import {
  displayDateHeader,
  parseUpdatedSheet,
  type Payload,
  type OperationalChange,
} from "./schedule-operational.ts";

const MONTHS = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];
const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
export const CONTROL_NOVEMBER_TAB = "Controle NOVEMBRO 26 - ORIGINAL";
export const CONTROL_EXPECTED_MASTER_ID = "1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64";
export const usesControlMaster = (city: string, sector: string) =>
  city === "natal" && sector === "controle-operacional";
export function controlMonthTabName(month: string): string {
  if (!/^\d{4}-\d{2}/.test(month)) throw Error("Competência inválida.");
  const n = Number(month.slice(5, 7)),
    year = month.slice(2, 4);
  if (n < 1 || n > 12) throw Error("Mês inválido.");
  return "Controle " + MONTHS[n - 1] + " " + year + " - 5X2";
}
export function controlTemplateTab(month: string): string {
  if (month.startsWith("2026-12")) return CONTROL_NOVEMBER_TAB;
  const [year, number] = month.split("-").map(Number);
  if (!year || !number || number < 1 || number > 12) throw Error("Competência inválida.");
  const previous = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
  return controlMonthTabName(previous);
}
export function controlMonthValues(payload: Payload, month: string): string[][] {
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
  if (!monthName) throw Error("Competência inválida.");
  return [
    [
      "Mês-ano:",
      monthName + " " + month.slice(2, 4),
      ...payload.dates.map((day) => DOW[new Date(day + "T12:00:00Z").getUTCDay()]!),
    ],
    ["Nome", "Função", ...payload.dates.map((day) => day.slice(8, 10) + "/" + day.slice(5, 7))],
    ...payload.people.map((person) => [
      person.name,
      person.jobTitle,
      ...payload.dates.map((date) => person.assignments[date] ?? ""),
    ]),
  ];
}
export function parseControlMonthTab(
  rows: unknown[][],
  planned: Payload,
  previous: Payload,
  month: string,
): {
  payload: Payload;
  changes: OperationalChange[];
  functionChanges: Array<{
    employee_name: string;
    previous_function: string;
    current_function: string;
  }>;
} {
  const expected = controlMonthValues(planned, month);
  if (
    rows.length < expected.length ||
    rows.slice(expected.length).some((row) => row.some((v) => v !== "" && v != null))
  )
    throw Error("Quantidade de colaboradores alterada na aba de Controle.");
  if (rows[0]?.[0] !== expected[0]![0] || rows[0]?.[1] !== expected[0]![1])
    throw Error("Cabeçalho do mês alterado. Restaure A1:B1.");
  for (let j = 0; j < planned.dates.length; j++) {
    const day = planned.dates[j]!;
    if (rows[0]?.[j + 2] !== expected[0]![j + 2] || rows[1]?.[j + 2] !== expected[1]![j + 2])
      throw Error("Cabeçalho da data " + displayDateHeader(day) + " alterado.");
  }
  const headerText = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  if (headerText(rows[1]?.[0]) !== "NOME")
    throw Error(
      "Cabeçalho A2 inválido. Restaure o texto Nome; edite os dias nas linhas dos colaboradores.",
    );
  if (headerText(rows[1]?.[1]) !== "FUNCAO")
    throw Error(
      "Cabeçalho B2 inválido. Restaure o texto Função; edite os dias nas linhas dos colaboradores.",
    );
  // Reconstitui a entrada do parser consolidado: LOGIN continua interno,
  // não é gravado nem precisa ser editado no Google Sheets.
  const oldHeader = ["COLABORADOR", "LOGIN", "FUNÇÃO", ...planned.dates];
  const legacyRows = planned.people.map((person, index) => {
    const row = rows[index + 2] ?? [];
    if (row[0] !== person.name)
      throw Error("Identificação alterada na linha " + (index + 3) + ": " + person.name);
    return [person.name, person.login || "", row[1], ...planned.dates.map((_, i) => row[i + 2])];
  });
  const result = parseUpdatedSheet([oldHeader, ...legacyRows], planned, previous, true);
  const functionChanges = result.payload.people.flatMap((person) => {
    const before = previous.people.find((p) => p.name === person.name);
    return before && before.jobTitle !== person.jobTitle
      ? [
          {
            employee_name: person.name,
            previous_function: before.jobTitle,
            current_function: person.jobTitle,
          },
        ]
      : [];
  });
  return { ...result, functionChanges };
}
/** Formatação visual somente da nova ABA, nunca do arquivo inteiro. */
export function controlMonthFormatting(
  sheetId: number,
  count: number,
  days: number,
  nonDutyRowIndices: readonly number[] = [],
): Record<string, unknown>[] {
  const rgb = (r: number, g: number, b: number) => ({
    red: r / 255,
    green: g / 255,
    blue: b / 255,
  });
  const rules = [
    ["Folga", rgb(18, 166, 59), rgb(255, 255, 255)],
    ["PLANTÃO", rgb(245, 198, 40), rgb(32, 32, 32)],
    ["AT", rgb(235, 85, 100), rgb(255, 255, 255)],
    ["FALTA", rgb(195, 45, 56), rgb(255, 255, 255)],
    ["Férias", rgb(143, 98, 208), rgb(255, 255, 255)],
    ["T. 1", rgb(255, 175, 84), rgb(32, 32, 32)],
  ] as const;
  const range = {
    sheetId,
    startRowIndex: 2,
    endRowIndex: count + 2,
    startColumnIndex: 2,
    endColumnIndex: days + 2,
  };
  const requests: Record<string, unknown>[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 2, frozenColumnCount: 2, hideGridlines: true },
        },
        fields:
          "gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines",
      },
    },
    {
      repeatCell: {
        range,
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(255, 255, 255),
            horizontalAlignment: "CENTER",
            textFormat: { foregroundColor: rgb(45, 45, 45) },
          },
        },
        fields:
          "userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.foregroundColor",
      },
    },
    {
      setDataValidation: {
        range,
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: [
              "T. 1",
              "M. 1",
              "M. 2",
              "Folga",
              "PLANTÃO",
              "AT",
              "FALTA",
              "Férias",
              "BH",
              "Afastamento",
            ].map((userEnteredValue) => ({ userEnteredValue })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: 2,
          endColumnIndex: days + 2,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "CENTER",
            textFormat: { bold: true, foregroundColor: rgb(255, 255, 255) },
            backgroundColor: rgb(12, 50, 77),
          },
        },
        fields:
          "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
      },
    },
  ];
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: days + 2,
        },
        warningOnly: true,
        description:
          "Cabeçalho da sincronização. Edite as folgas e os turnos nas linhas dos colaboradores.",
      },
    },
  });
  // Verde em A/B significa sem plantão AUTOMÁTICO. Essa marcação
  // corresponde à política editável salva no rascunho, não à cor
  // original (que pode variar entre competências).
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 2,
        endRowIndex: count + 2,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
      cell: { userEnteredFormat: { backgroundColor: rgb(255, 255, 255) } },
      fields: "userEnteredFormat.backgroundColor",
    },
  });
  for (const row of nonDutyRowIndices) {
    if (!Number.isInteger(row) || row < 0 || row >= count) throw Error("Índice inválido.");
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: row + 2,
          endRowIndex: row + 3,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: { userEnteredFormat: { backgroundColor: rgb(0, 176, 80) } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  }
  for (const [value, bg, fg] of rules) {
    requests.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [range],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
            format: {
              backgroundColor: bg,
              textFormat: { foregroundColor: fg, bold: value === "PLANTÃO" },
            },
          },
        },
      },
    });
  }
  return requests;
}
