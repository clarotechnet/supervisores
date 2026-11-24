/**
 * Controle RN — contrato de aba MENSAL dentro da planilha Google existente.
 * Uma aba por mês, duas linhas de cabeçalho e NOME/FUNÇÃO nas colunas A/B.
 * As abas anteriores não são modificadas.
 */
import { fixedRestColumn, readFixedRest } from "./schedule-fixed-rest-value.ts";
import {
  displayDateHeader,
  parseUpdatedSheet,
  employeeKey,
  type Payload,
  type Person,
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
const CONTROL_CODES = [
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
];
const headerText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const emptyCell = (value: unknown) => value == null || value === "";
const summaryNumber = (value: unknown) =>
  emptyCell(value) ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && /^\d+(?:[.,]\d+)?$/.test(value.trim()));

type ControlRosterOptions = {
  removedRosterNames?: readonly string[];
  allowFutureRemoval?: boolean;
  now?: Date;
};
const localMonth = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
});

export function isFutureControlMonth(month: string, now = new Date()): boolean {
  const competence = month.slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(competence) && competence > localMonth.format(now);
}

/** Totais e critérios de CONT.SE não são colaboradores. Só aceita abaixo da
 * lista: contagens sem Nome/Função ou uma legenda isolada de código conhecido.
 * Demais linhas precisam passar pela validação de Nome/Função como pessoas.
 */
function controlSummaryRow(row: unknown[], planned: Payload, legends: Set<string>): boolean {
  if (!emptyCell(row[1])) return false;
  const days = row.slice(2, planned.dates.length + 2);
  if (emptyCell(row[0])) return days.every(summaryNumber);
  return (
    typeof row[0] === "string" &&
    legends.has(headerText(row[0])) &&
    !planned.people.some((person) => person.name === row[0]) &&
    days.every(emptyCell)
  );
}

/** B1 pode ser texto ou uma data nativa devolvida pela API como serial. */
function monthHeaderMatches(value: unknown, month: string): boolean {
  const target = month.slice(0, 7);
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 20000 || value > 100000) return false;
    const iso = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString();
    return iso.slice(0, 7) === target;
  }
  if (typeof value !== "string") return false;
  const raw = headerText(value);
  const name = headerText(MONTHS[Number(target.slice(5, 7)) - 1]);
  const year = target.slice(0, 4);
  const names = [name, name.slice(0, 3), name.slice(0, 3) + "."];
  if (
    names.some((name) => raw === name + " " + year || raw === name + " " + year.slice(2)) ||
    raw === target ||
    raw === target.slice(5, 7) + "/" + year
  )
    return true;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/);
  const iso = br
    ? (br[3]!.length === 2 ? "20" + br[3] : br[3]) + "-" + br[2] + "-" + br[1]
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw
      : "";
  const millis = Date.parse(iso + "T12:00:00Z");
  return (
    !!iso &&
    Number.isFinite(millis) &&
    new Date(millis).toISOString().slice(0, 10) === iso &&
    iso.slice(0, 7) === target
  );
}
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
  const fixed = payload.people.some((p) => p.fixedRest !== undefined);
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
  if (!monthName) throw Error("Competência inválida.");
  return [
    [
      "Mês-ano:",
      monthName + " " + month.slice(2, 4),
      ...payload.dates.map((day) => DOW[new Date(day + "T12:00:00Z").getUTCDay()]!),
      ...(fixed ? [""] : []),
    ],
    [
      "Nome",
      "Função",
      ...payload.dates.map((day) => day.slice(8, 10) + "/" + day.slice(5, 7)),
      ...(fixed ? ["Folga fixa"] : []),
    ],
    ...payload.people.map((person) => [
      person.name,
      person.jobTitle,
      ...payload.dates.map((date) => person.assignments[date] ?? ""),
      ...(fixed ? [person.fixedRest || ""] : []),
    ]),
  ];
}
export function parseControlMonthTab(
  rows: unknown[][],
  planned: Payload,
  previous: Payload,
  month: string,
  options: ControlRosterOptions = {},
): {
  payload: Payload;
  changes: OperationalChange[];
  addedPeople: Person[];
  removedPeople: Person[];
  functionChanges: Array<{
    employee_name: string;
    previous_function: string;
    current_function: string;
  }>;
} {
  const expected = controlMonthValues(planned, month);
  const fixedColumn = fixedRestColumn(rows[1] || []);
  if (headerText(rows[0]?.[0]) !== headerText(expected[0]![0]))
    throw Error("Cabeçalho A1 inválido. Restaure o texto Mês-ano:.");
  if (!monthHeaderMatches(rows[0]?.[1], month))
    throw Error("Cabeçalho do mês alterado. B1 deve indicar " + expected[0]![1] + ".");
  for (let j = 0; j < planned.dates.length; j++) {
    const day = planned.dates[j]!;
    if (rows[0]?.[j + 2] !== expected[0]![j + 2] || rows[1]?.[j + 2] !== expected[1]![j + 2])
      throw Error("Cabeçalho da data " + displayDateHeader(day) + " alterado.");
  }
  if (headerText(rows[1]?.[0]) !== "NOME")
    throw Error(
      "Cabeçalho A2 inválido. Restaure o texto Nome; edite os dias nas linhas dos colaboradores.",
    );
  if (headerText(rows[1]?.[1]) !== "FUNCAO")
    throw Error(
      "Cabeçalho B2 inválido. Restaure o texto Função; edite os dias nas linhas dos colaboradores.",
    );
  // A ordem visual pode mudar no Sheets. Vincula a linha inteira pelo nome
  // exato, preservando a identidade e a ordem do planejamento no payload/auditoria.
  const plannedNames = new Set(planned.people.map((person) => person.name));
  if (plannedNames.size !== planned.people.length || plannedNames.has(""))
    throw Error("Identificação duplicada ou ausente no planejamento de Controle.");
  const legends = new Set([...CONTROL_CODES, ...planned.codes].map(headerText));
  const removedNames = new Set(options.removedRosterNames);
  const previousByName = new Map(previous.people.map((person) => [person.name, person]));
  const plannedByName = new Map(planned.people.map((person) => [person.name, person]));
  // Saídas já registradas não voltam pelo planejamento antigo, nem quando o mês começa.
  const requiredPeople = [
    ...planned.people.filter(
      (person) => !removedNames.has(person.name) || previousByName.has(person.name),
    ),
    ...previous.people.filter((person) => !plannedNames.has(person.name)),
  ];
  const expectedNames = new Set(requiredPeople.map((person) => person.name));
  const future = isFutureControlMonth(month, options.now);
  const allowRemoval = options.allowFutureRemoval && future;
  if (!allowRemoval && rows.length < requiredPeople.length + 2)
    throw Error("Quantidade de colaboradores alterada na aba de Controle.");
  const summaryLayout = { ...planned, people: requiredPeople };
  const addedPeople: Person[] = [];
  const byName = new Map<string, unknown[]>();
  const keys = new Set<string>();
  let firstNewLine: number | undefined;
  for (let index = 2; index < rows.length; index++) {
    const row = rows[index] ?? [];
    if (controlSummaryRow(row, summaryLayout, legends)) continue;
    const rawName = row[0];
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (
      typeof rawName !== "string" ||
      !name ||
      name.length > 160 ||
      /[<>\p{Cc}]/u.test(rawName) ||
      name.startsWith("=") ||
      legends.has(headerText(name))
    )
      throw Error(
        "Identificação alterada na linha " +
          (index + 1) +
          ": use Nome e Função para colaboradores; totais e legendas isoladas não são pessoas.",
      );
    const key = employeeKey({ name });
    if (keys.has(key))
      throw Error(
        "Quantidade de colaboradores inválida. Identificação duplicada na linha " +
          (index + 1) +
          ": " +
          name,
      );
    keys.add(key);
    if (!expectedNames.has(name)) {
      firstNewLine ??= index + 1;
      if (typeof row[1] !== "string" || !row[1].trim())
        throw Error("Novo colaborador na linha " + (index + 1) + " precisa de Nome e Função.");
      addedPeople.push(
        plannedByName.get(name) ?? {
          name,
          login: "",
          jobTitle: row[1].trim(),
          assignments: {},
        },
      );
    }
    byName.set(name, row);
  }
  const absent = requiredPeople.filter((person) => !byName.has(person.name));
  if (!allowRemoval && absent.length)
    throw Error(
      "Identificação alterada na linha " +
        (firstNewLine ?? rows.length) +
        ": colaborador ausente ou renomeado: " +
        absent[0]!.name +
        (future
          ? ". Esta ação não remove pessoas. Use Atualizar via API para sincronizar a equipe."
          : ". A API não remove pessoas de uma competência já iniciada."),
    );
  if (byName.size === 0 || byName.size > 500)
    throw Error("Quantidade de colaboradores inválida. A escala deve ter de 1 a 500 pessoas.");
  const people = [...requiredPeople.filter((person) => byName.has(person.name)), ...addedPeople];
  // Reconstitui a entrada do parser consolidado: LOGIN continua interno,
  // não é gravado nem precisa ser editado no Google Sheets.
  const oldHeader = ["COLABORADOR", "LOGIN", "FUNÇÃO", ...planned.dates];
  const legacyRows = people.map((person) => {
    const row = byName.get(person.name);
    if (!row) throw Error("Colaborador ausente da aba de Controle: " + person.name);
    return [person.name, person.login || "", row[1], ...planned.dates.map((_, i) => row[i + 2])];
  });
  const result = parseUpdatedSheet(
    [oldHeader, ...legacyRows],
    { ...planned, people },
    {
      ...previous,
      people: [
        ...previous.people,
        ...addedPeople.map((person) => ({ ...person, assignments: {} })),
      ],
    },
    true,
  );
  const functionChanges = result.payload.people.flatMap((person) => {
    const before = previousByName.get(person.name);
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
  result.payload.people = result.payload.people.map((person) => ({
    ...person,
    ...readFixedRest(byName.get(person.name) || [], fixedColumn),
  }));
  return {
    ...result,
    functionChanges,
    removedPeople: absent.map((person) => previousByName.get(person.name) ?? person),
    addedPeople: result.payload.people.filter((person) =>
      addedPeople.some((added) => added.name === person.name),
    ),
  };
}
/** Read-only source: include columns appended to the prior month's extension.
 * Existing headers remain strict; only contiguous real dates, bounded to 42 days.
 * Named auxiliary columns after the dates are never imported as schedule days.
 * This does not change planning or publish/synchronize anything.
 */
export function readControlMonthSource(
  rows: unknown[][],
  planned: Payload,
  previous: Payload,
  month: string,
  options: Pick<ControlRosterOptions, "removedRosterNames"> = {},
) {
  const dates = [...planned.dates];
  const width = Math.max(rows[0]?.length || 0, rows[1]?.length || 0);
  for (let column = dates.length + 2; column < width; column++) {
    if (rows.every((r) => r[column] == null || r[column] === "")) continue;
    const headings = [rows[0]?.[column], rows[1]?.[column]];
    const namedSummary = headings.some((value) => typeof value === "string" && !!value.trim());
    const dateHeading = headings.some(
      (value) =>
        (!emptyCell(value) && typeof value === "number") ||
        DOW.includes(headerText(value)) ||
        /^\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{1,4})?$/.test(headerText(value)),
    );
    if (namedSummary && !dateHeading) continue;
    const last = dates.at(-1);
    if (!last || dates.length >= 42)
      throw Error("Extensão da escala anterior inválida; confira as datas da aba.");
    const next = new Date(Date.parse(last + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    if (
      column !== dates.length + 2 ||
      rows[1]?.[column] !== next.slice(8) + "/" + next.slice(5, 7) ||
      rows[0]?.[column] !== DOW[new Date(next + "T12:00:00Z").getUTCDay()]
    )
      throw Error(
        "Extensão da escala anterior fora de sequência; confira o cabeçalho da coluna " +
          (column + 1) +
          ".",
      );
    dates.push(next);
  }
  return parseControlMonthTab(rows, { ...planned, dates }, previous, month, options);
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
            values: CONTROL_CODES.map((userEnteredValue) => ({ userEnteredValue })),
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
