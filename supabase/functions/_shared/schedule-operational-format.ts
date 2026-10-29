/** Google Sheets layout for the Controle operational 5x2 (visual-only). */
import type { Payload } from "./schedule-operational.ts";
type Request = Record<string, unknown>;
const rgb = (r: number, g: number, b: number) => ({ red: r / 255, green: g / 255, blue: b / 255 });
export function operationalSheetFormatting(p: Payload): Request[] {
  const count = p.people.length,
    n = p.dates.length;
  const requests: Request[] = [];
  for (const sheetId of [0, 1]) {
    // Hide the legacy login column and the 6x1 November-30 context in both tabs,
    // keeping those cells in the API for audit and week continuity.
    requests.push(
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 218 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 275 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 3 + n },
          properties: { pixelSize: 96 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 44 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: count + 1 },
          properties: { pixelSize: 27 },
          fields: "pixelSize",
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: rgb(13, 42, 75),
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "WRAP",
              textFormat: { bold: true, fontSize: 10, foregroundColor: rgb(255, 255, 255) },
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: count + 1 },
          cell: {
            userEnteredFormat: {
              verticalAlignment: "MIDDLE",
              textFormat: { fontSize: 10, foregroundColor: rgb(32, 46, 62) },
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: count + 1,
            startColumnIndex: 3,
            endColumnIndex: 3 + n,
          },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment",
        },
      },
      {
        addBanding: {
          bandedRange: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: count + 1,
              startColumnIndex: 0,
              endColumnIndex: 3 + n,
            },
            rowProperties: {
              headerColor: rgb(13, 42, 75),
              firstBandColor: rgb(255, 255, 255),
              secondBandColor: rgb(243, 247, 251),
            },
          },
        },
      },
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            tabColorStyle: { rgbColor: sheetId === 0 ? rgb(18, 135, 96) : rgb(53, 102, 175) },
            gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 },
          },
          fields: "tabColorStyle,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        },
      },
    );
    const historic = p.dates.findIndex((d) => d === "2026-11-30");
    if (historic >= 0)
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: historic + 3,
            endIndex: historic + 4,
          },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      });
    // Color-code work, rest, duty, certificate and vacation as in the
    // operational source template. These rules follow edits automatically.
    const colorRules = [
      { code: "Folga", bg: rgb(213, 238, 219), fg: rgb(30, 97, 51) },
      { code: "PLANTÃO", bg: rgb(255, 227, 179), fg: rgb(144, 79, 0) },
      { code: "AT", bg: rgb(255, 211, 211), fg: rgb(150, 38, 49) },
      { code: "FALTA", bg: rgb(255, 191, 191), fg: rgb(150, 24, 24) },
      { code: "Férias", bg: rgb(237, 222, 255), fg: rgb(101, 62, 150) },
      { code: "T. 1", bg: rgb(228, 239, 255), fg: rgb(40, 78, 135) },
    ];
    for (const { code, bg, fg } of colorRules) {
      requests.push({
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: count + 1,
                startColumnIndex: 3,
                endColumnIndex: 3 + n,
              },
            ],
            booleanRule: {
              condition: { type: "TEXT_EQ", values: [{ userEnteredValue: code }] },
              format: {
                backgroundColor: bg,
                textFormat: { foregroundColor: fg, bold: code === "PLANTÃO" },
              },
            },
          },
        },
      });
    }
  }
  requests.push({
    setDataValidation: {
      range: {
        sheetId: 0,
        startRowIndex: 1,
        endRowIndex: count + 1,
        startColumnIndex: 3,
        endColumnIndex: 3 + n,
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: [
            ...new Set(
              [
                "T. 1",
                "M. 1",
                "M. 2",
                "PLANTÃO",
                "Folga",
                "AT",
                "FALTA",
                "Férias",
                "Afastamento",
                "BH",
                ...p.codes,
              ].filter(Boolean),
            ),
          ]
            .slice(0, 100)
            .map((userEnteredValue) => ({ userEnteredValue })),
        },
        strict: false,
        showCustomUi: true,
      },
    },
  });
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: 1,
          startRowIndex: 0,
          endRowIndex: count + 1,
          startColumnIndex: 0,
          endColumnIndex: 3 + n,
        },
        description: "Aba planejada — cópia de consulta, editar somente ATUALIZADA",
        warningOnly: true,
      },
    },
  });
  return requests;
}
