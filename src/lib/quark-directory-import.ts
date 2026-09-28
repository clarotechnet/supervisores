import type { QuarkDirectory, QuarkPerson } from "@/lib/quark";

export interface DirectoryImportIssue {
  name: string;
  reason: string;
}

export interface DirectoryImportResult {
  totalRows: number;
  rows: Omit<QuarkDirectory, "created_at" | "updated_at">[];
  unmatched: DirectoryImportIssue[];
  ambiguous: DirectoryImportIssue[];
  invalid: DirectoryImportIssue[];
}

function cellText(value: unknown): string {
  if (value && typeof value === "object") {
    if ("result" in value) return cellText(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          cellText(part && typeof part === "object" && "text" in part ? part.text : part),
        )
        .join("");
    }
    if ("text" in value) return cellText(value.text);
  }
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedHeader(value: unknown): string {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeQuarkPersonName(value: unknown): string {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizedHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

export async function parseDirectoryWorkbook(
  file: File,
  people: QuarkPerson[],
  updatedBy: string,
): Promise<DirectoryImportResult> {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    throw new Error("Selecione a planilha dados.xlsx em formato .xlsx ou .xlsm.");
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet =
    workbook.worksheets.find((item) => normalizedHeader(item.name).includes("dados")) ??
    workbook.worksheets[0];
  if (!sheet) throw new Error("A planilha não possui nenhuma aba.");

  const headers: string[] = [];
  for (let column = 1; column <= sheet.actualColumnCount; column += 1) {
    headers.push(normalizedHeader(sheet.getRow(1).getCell(column).value));
  }

  const columns = {
    name: findColumn(headers, ["colaborador", "nome", "nome colaborador"]),
    city: findColumn(headers, ["cidade"]),
    sector: findColumn(headers, ["setor"]),
    supervisor: findColumn(headers, ["supervisor"]),
  };

  for (const [key, index] of Object.entries(columns)) {
    if (index < 0) throw new Error(`Coluna obrigatória não encontrada: ${key}.`);
  }

  const peopleByName = new Map<string, QuarkPerson[]>();
  for (const person of people) {
    const key = normalizeQuarkPersonName(person.full_name);
    if (!key) continue;
    peopleByName.set(key, [...(peopleByName.get(key) ?? []), person]);
  }

  const result: DirectoryImportResult = {
    totalRows: 0,
    rows: [],
    unmatched: [],
    ambiguous: [],
    invalid: [],
  };
  const rowsByPerson = new Map<string, Omit<QuarkDirectory, "created_at" | "updated_at">>();

  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = cellText(row.getCell(columns.name + 1).value);
    if (!name) continue;

    result.totalRows += 1;
    const city = cellText(row.getCell(columns.city + 1).value);
    const sector = cellText(row.getCell(columns.sector + 1).value);
    const supervisor = cellText(row.getCell(columns.supervisor + 1).value);

    if (!city || !sector || !supervisor) {
      result.invalid.push({
        name,
        reason: "Cidade, setor ou supervisor ausente.",
      });
      continue;
    }

    const matches = peopleByName.get(normalizeQuarkPersonName(name)) ?? [];
    if (matches.length === 0) {
      result.unmatched.push({
        name,
        reason: "Nome ainda não encontrado no cadastro Quark.",
      });
      continue;
    }
    if (matches.length > 1) {
      result.ambiguous.push({
        name,
        reason: "Mais de um colaborador do Quark possui este nome.",
      });
      continue;
    }

    const person = matches[0]!;
    rowsByPerson.set(`${person.unit_id}:${person.collaborator_id}`, {
      unit_id: person.unit_id,
      collaborator_id: person.collaborator_id,
      city,
      sector,
      supervisor,
      updated_by: updatedBy,
    });
  }

  result.rows = [...rowsByPerson.values()];
  return result;
}
