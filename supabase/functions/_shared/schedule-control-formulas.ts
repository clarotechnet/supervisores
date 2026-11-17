import { controlMonthValues } from "./schedule-operational-master.ts";
import type { Payload } from "./schedule-operational.ts";

type Cell = { userEnteredValue: { stringValue: string } | { formulaValue: string } };
const text = (stringValue: string): Cell => ({ userEnteredValue: { stringValue } });
const formula = (formulaValue: string): Cell => ({ userEnteredValue: { formulaValue } });
function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Somente criação: fórmulas tipadas, sem interpretar nomes ou códigos como fórmulas.
 * O indicador Sim/Não considera toda a semana exibida. A quantidade de plantões
 * considera apenas a competência, como E:AI na referência de dezembro de 2026.
 */
export function controlMonthCreation(payload: Payload, month: string, locale = "pt_BR") {
  const decimal = new Intl.NumberFormat(locale.replaceAll("_", "-"))
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value;
  const separator = decimal === "," ? ";" : ",";
  const localizedFormula = (value: string) => formula(value.replaceAll(",", separator));
  if (payload.people.length < 1 || payload.people.length > 500 || payload.dates.length > 42)
    throw Error("Quantidade de pessoas ou datas inválida para criar a aba de Controle.");
  const dates = payload.dates;
  if (
    dates.some(
      (date, index) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || (index > 0 && date <= dates[index - 1]!),
    )
  )
    throw Error("Datas fora de sequência na criação da aba de Controle.");
  const monthIndices = dates.flatMap((date, index) =>
    date.startsWith(month.slice(0, 7) + "-") ? [index] : [],
  );
  if (!monthIndices.length) throw Error("A escala não contém datas da competência selecionada.");
  const end = dates.length + 2;
  const lastDay = columnName(end - 1);
  const firstMonthDay = columnName(monthIndices[0]! + 2);
  const lastMonthDay = columnName(monthIndices.at(-1)! + 2);
  const lastPersonRow = payload.people.length + 2;
  // Em dezembro, com 42 pessoas: totais nas linhas 45/46 e critérios em A59/A60.
  const workCriterionRow = lastPersonRow + 15;
  const dutyCriterionRow = workCriterionRow + 1;
  const rows: Array<{ values: Cell[] }> = controlMonthValues(payload, month).map((row, index) => {
    const values = row.map(text);
    const r = index + 1;
    values.splice(
      end,
      0,
      ...(index < 2
        ? [text(index === 1 ? "PLATÕES" : ""), text(index === 1 ? "quantidades" : "")]
        : [
            localizedFormula(
              `=IF(COUNTIF(C${r}:${lastDay}${r},$A$${dutyCriterionRow})>0,"Sim","Não")`,
            ),
            localizedFormula(
              `=COUNTIF(${firstMonthDay}${r}:${lastMonthDay}${r},$A$${dutyCriterionRow})`,
            ),
          ]),
    );
    return { values };
  });
  for (const criterion of [workCriterionRow, dutyCriterionRow])
    rows.push({
      values: [
        text(""),
        text(""),
        ...dates.map((_, index) => {
          const c = columnName(index + 2);
          return localizedFormula(`=COUNTIF(${c}3:${c}${lastPersonRow},$A$${criterion})`);
        }),
      ],
    });
  while (rows.length < workCriterionRow - 1) rows.push({ values: [] });
  rows.push({ values: [text("T. 1")] }, { values: [text("PLANTÃO")] });
  return { rows, rowCount: rows.length, columnCount: rows[1]!.values.length };
}

/** Todas as requisições ficam restritas à cópia recém-criada. */
export function controlMonthCreationRequests(
  sheetId: number,
  payload: Payload,
  month: string,
  previousGrid: { rowCount?: number; columnCount?: number } = {},
  locale = "pt_BR",
): Record<string, unknown>[] {
  const grid = controlMonthCreation(payload, month, locale);
  const summaryStart = payload.dates.length + 2;
  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            rowCount: Math.max(previousGrid.rowCount || 0, grid.rowCount),
            columnCount: Math.max(previousGrid.columnCount || 0, grid.columnCount),
          },
        },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    },
    // Remove inclusive resumos e Folga fixa antigos que ficaram além de AO.
    { updateCells: { range: { sheetId }, rows: [], fields: "userEnteredValue" } },
    // Validação de turnos da cópia não se aplica a indicadores, referências ou totais.
    {
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: payload.people.length + 2,
          startColumnIndex: summaryStart,
          endColumnIndex: grid.columnCount,
        },
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: payload.people.length + 2,
          endRowIndex: payload.people.length + 4,
          startColumnIndex: 2,
          endColumnIndex: payload.dates.length + 2,
        },
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: grid.rows,
        fields: "userEnteredValue",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: summaryStart,
          endColumnIndex: grid.columnCount,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "CENTER",
            backgroundColor: { red: 12 / 255, green: 50 / 255, blue: 77 / 255 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          },
        },
        fields:
          "userEnteredFormat.horizontalAlignment,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: summaryStart,
          endIndex: grid.columnCount,
        },
        properties: { pixelSize: 105 },
        fields: "pixelSize",
      },
    },
  ];
}
