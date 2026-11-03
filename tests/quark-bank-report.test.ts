import { describe, expect, it } from "vitest";
import { buildOccurrences, personKey } from "../src/lib/quark";
import {
  buildQuarkBankReport,
  quarkBankRowsForScope,
  type QuarkBankScope,
} from "../src/lib/quark-bank-report";
import { createQuarkBankWorkbook } from "../src/lib/quark-bank-export";
import { bankContext, bankDay, bankDays, bankPeople, bankPerson } from "./fixtures/quark-bank";

describe("Quark — Banco de horas", () => {
  it("preserva a soma das movimentações, extras e último dia, sem exigir moradia", () => {
    const report = buildQuarkBankReport(bankPeople, [...bankDays].reverse());
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]?.balance).toBe(1530);
    expect(report.rows[0]?.latest.work_date).toBe("2026-10-25");
    expect(report.rows[0]?.extras).toBe(241);
    expect(report.totalPositiveMinutes).toBe(1530);
    expect(report.totalNegativeMinutes).toBe(-3030);
    expect(report.rows[2]?.balance).toBe(0);
    expect(bankDays[0]?.bank_balance_minutes).toBe(1500);
  });

  it("alertas são dias estritamente acima de 120min, somando as três extras, não todos os dias da pessoa", () => {
    const report = buildQuarkBankReport(bankPeople, bankDays);
    expect(report.alerts.map(({ day, extras }) => [day.work_date, extras])).toEqual([
      ["2026-10-24", 140],
      ["2026-09-26", 121],
    ]);
    expect(report.alerts).toHaveLength(
      buildOccurrences(bankPeople, bankDays, []).filter((item) => item.type === "extra").length,
    );
    expect(quarkBankRowsForScope(report, "alerts")).toEqual([]);
  });

  it("KPIs separam positivos, negativos, todos e saldo zero sem alterar o total de base", () => {
    const report = buildQuarkBankReport(bankPeople, bankDays);
    expect(quarkBankRowsForScope(report, "positive").map((row) => row.balance)).toEqual([1530]);
    expect(quarkBankRowsForScope(report, "negative").map((row) => row.balance)).toEqual([-3030]);
    expect(quarkBankRowsForScope(report, "people")).toHaveLength(3);
    expect(quarkBankRowsForScope(report, null)).toHaveLength(3);
    expect(report.rows).toHaveLength(3);
  });

  it("respeita a população e o período já filtrados, sem misturar IDs iguais de unidades distintas", () => {
    const other = bankPerson("1", "Outra unidade", 2);
    const days = [...bankDays, bankDay(other, "2026-10-25", -60, 200)];
    const filtered = buildQuarkBankReport(
      [bankPeople[0]!],
      days.filter((day) => day.work_date === "2026-10-25"),
    );
    expect(filtered.rows.map((row) => [personKey(row.person), row.balance])).toEqual([["1:1", 30]]);
    expect(filtered.alerts).toHaveLength(0);
    const both = buildQuarkBankReport([bankPeople[0]!, other], days);
    expect(both.rows.map((row) => row.balance)).toEqual([1530, -60]);
    expect(both.alerts).toHaveLength(2);
  });

  it("ordena cada top 10 corretamente com desempate estável e não trunca o KPI completo", () => {
    const people = Array.from({ length: 24 }, (_, index) =>
      bankPerson(String(index), `Pessoa ${String(index).padStart(2, "0")}`),
    );
    const days = people.map((person, index) =>
      bankDay(person, "2026-10-25", index < 12 ? 60 * (index + 1) : -60 * (index - 11)),
    );
    const report = buildQuarkBankReport(people, days);
    expect(quarkBankRowsForScope(report, "positive")).toHaveLength(12);
    expect(quarkBankRowsForScope(report, "top-positive").map((row) => row.balance)).toEqual([
      720, 660, 600, 540, 480, 420, 360, 300, 240, 180,
    ]);
    expect(quarkBankRowsForScope(report, "top-negative").map((row) => row.balance)).toEqual([
      -720, -660, -600, -540, -480, -420, -360, -300, -240, -180,
    ]);
    const tied = buildQuarkBankReport(
      [...people].reverse(),
      people.map((person) => bankDay(person, "2026-10-25", 60)),
    );
    expect(tied.positive[0]?.person.full_name).toBe("Pessoa 00");
  });
});

describe("Excel do banco de horas", () => {
  async function reopen(scope: QuarkBankScope | null, people = bankPeople, days = bankDays) {
    const { default: ExcelJS } = await import("exceljs");
    const bytes = await createQuarkBankWorkbook(
      buildQuarkBankReport(people, days),
      bankContext,
      scope,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    return book;
  }

  it("sem KPI gera abas descritivas com filtros, período, identificação e horas numéricas assinadas", async () => {
    const book = await reopen(null);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      "Colaboradores",
      "Saldos positivos",
      "Saldos negativos",
      "Top 10 positivos",
      "Top 10 negativos",
      "Alertas acima de 2h",
    ]);
    for (const sheet of book.worksheets) {
      expect(sheet.getCell("A1").value).toMatch(/TECHNET/);
      expect(sheet.getCell("A2").value).toBeTypeOf("string");
      expect(sheet.getCell("A4").value).toMatch(/Recife.*Campo.*DMV Recife.*Equipe A/);
      expect(sheet.getRow(7).values).toEqual(
        expect.arrayContaining(["Nome", "Setor", "Unidade", "Período - início", "Período - fim"]),
      );
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 7 });
      expect(sheet.autoFilter).toBeTruthy();
      expect(sheet.getCell("H8").value).toEqual(new Date("2026-09-26T12:00:00Z"));
      expect(sheet.getCell("I8").value).toEqual(new Date("2026-10-25T12:00:00Z"));
      expect(sheet.getCell("B8").value).toBeTypeOf("string");
    }
    expect(book.getWorksheet("Colaboradores")!.getCell("L8").value).toBe(25.5);
    expect(book.getWorksheet("Saldos negativos")!.getCell("L8").value).toBe(-50.5);
    expect(book.getWorksheet("Saldos negativos")!.getCell("L8").numFmt).toContain("[Red]-");
    expect(book.getWorksheet("Colaboradores")!.getCell("L10").value).toBe(0);
  }, 30_000);

  it.each([
    ["positive", "Saldos positivos", 1],
    ["negative", "Saldos negativos", 1],
    ["people", "Colaboradores", 3],
    ["top-positive", "Top 10 positivos", 1],
    ["top-negative", "Top 10 negativos", 1],
    ["alerts", "Alertas acima de 2h", 2],
  ] as const)("KPI %s exporta apenas sua aba e linhas", async (scope, title, count) => {
    const book = await reopen(scope);
    expect(book.worksheets).toHaveLength(1);
    const sheet = book.worksheets[0]!;
    expect(sheet.name).toBe(title);
    expect(sheet.rowCount).toBe(7 + count);
    if (scope === "alerts") {
      expect(sheet.getCell("L8").value).toBe(140 / 60);
      expect(sheet.getCell("L9").value).toBe(121 / 60);
      expect(sheet.getCell("J9").value).toEqual(new Date("2026-09-26T12:00:00Z"));
      expect(sheet.getCell("S8").value).toBe(-50.5);
      expect(sheet.getRow(7).values).not.toContain("Extras no período (horas)");
    }
  });

  it("não vaza pessoas fora do filtro e explica abas vazias sem inventar registros", async () => {
    const filtered = await reopen(null, [bankPeople[0]!], bankDays);
    expect(filtered.getWorksheet("Colaboradores")!.rowCount).toBe(8);
    expect(filtered.getWorksheet("Alertas acima de 2h")!.rowCount).toBe(8);
    const empty = await reopen("alerts", [], []);
    expect(empty.worksheets[0]!.getCell("A8").value).toMatch(/Nenhum registro/);
    expect(empty.worksheets[0]!.getCell("L8").value).toMatch(/Nenhum registro/);
  });
});
