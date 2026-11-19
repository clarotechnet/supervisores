import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyVtOrders,
  parseVtAttendance,
  parseVtOrders,
  VT_SHEET_RULES,
  vtDate,
  vtPayments,
  vtSeconds,
  vtSummaries,
  type VtOrder,
  type VtAttendance,
} from "../src/lib/vt-revisitas";
import { readVtWorkbook } from "../src/lib/vt-revisitas-xlsx";

const heading = [
  "Data",
  "Núm. Contrato",
  "Número W.O",
  "Núm. OS",
  "Instalador",
  "Cidade",
  "Cód. Baixa",
  "Bairro",
];
const line = (os: string, city = "Fortaleza", day: unknown = 46344) => [
  day,
  "C1",
  "WO1",
  os,
  "Técnico 1",
  city,
  517,
  "Centro",
];
const order = (
  id: string,
  day: string,
  code: number,
  contract = "C1",
  rest: Partial<VtOrder> = {},
): VtOrder => ({
  id: `OS:${id}`,
  os: id,
  wo: "WO1",
  contract,
  day,
  time: "08:00:00",
  technician: "Técnico 1",
  municipality: "FORTALEZA",
  neighborhood: "CENTRO",
  node: "",
  service: "Visita técnica",
  code,
  description: "",
  expunge: false,
  ...rest,
});
const loginAttendance = (technician: string, login: string, value: number): VtAttendance => ({
  id: `LOGIN:${login}`,
  technician,
  login,
  value,
});

describe("Revisitas VT", () => {
  it("mantém O.S. distintas da mesma WO, elimina repetições idênticas e rejeita conflito", () => {
    const imported = parseVtOrders(
      [heading, line("1"), line("2"), line("1")],
      "fortaleza",
      "2026-11",
    );
    expect(imported.rows.map((r) => r.id)).toEqual(["OS:1", "OS:2"]);
    expect(imported.duplicates).toBe(1);
    expect(() =>
      parseVtOrders(
        [heading, line("1"), line("1", "Fortaleza", "19/11/2026")],
        "fortaleza",
        "2026-11",
      ),
    ).toThrow(/informações diferentes/);
  });
  it("aceita Natal e Parnamirim juntos, rejeita outra cidade e competência", () => {
    expect(
      parseVtOrders([heading, line("1", "Natal"), line("2", "Parnamirim")], "natal", "2026-11")
        .rows,
    ).toHaveLength(2);
    expect(() => parseVtOrders([heading, line("1", "Recife")], "natal", "2026-11")).toThrow(
      /cidade/,
    );
    expect(() => parseVtOrders([heading, line("1")], "fortaleza", "2026-10")).toThrow(
      /competência/,
    );
    expect(vtDate("29/02/2026")).toBeNull();
    expect(vtDate(46344)).toBe("2026-11-18");
  });
  it("usa a ordem temporal por contrato, sem depender da ordem do arquivo, e inclui o dia 9", () => {
    const a = order("1", "2026-11-01", 517),
      b = order("2", "2026-11-10", 555),
      c = order("3", "2026-11-11", 509, "C2"),
      d = order("4", "2026-11-21", 509, "C2");
    const rows = classifyVtOrders([d, b, c, a]);
    expect(rows.find((r) => r.os === "1")).toMatchObject({
      productive: true,
      revisited: true,
      returnOs: "2",
    });
    expect(rows.find((r) => r.os === "3")).toMatchObject({ productive: true, revisited: false });
    expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({ productive: 4, revisits: 1 });
  });
  it("considera 400 improdutivo, expurgo entra no volume e retorno improdutivo não conta", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 400, "BOUND"),
      order("2", "2026-11-02", 516, "BOUND"),
      order("3", "2026-11-01", 570, "EXP"),
      order("4", "2026-11-03", 505, "EXP"),
      order("5", "2026-11-01", 517, "CANCEL"),
      order("6", "2026-11-02", 0, "CANCEL"),
      order("7", "2026-11-09", 302, "MANUAL", { expunge: true }),
      order("8", "2026-11-30", 517, "DEC"),
      order("9", "2026-12-01", 505, "DEC"),
    ]);
    const get = (os: string) => rows.find((r) => r.os === os);
    expect(get("1")).toMatchObject({ improductive: true, productive: false, revisited: false });
    expect(get("3")).toMatchObject({ expunged: true, productive: true, revisited: false });
    expect(get("5")).toMatchObject({ revisited: false });
    expect(get("7")).toMatchObject({ expunged: true, productive: true });
    expect(get("8")).toMatchObject({ revisited: false });
  });
  it("interpreta relatórios acumulados e diferencia ausência de zero", () => {
    const matrix = [
      ["Técnico", "Login", "Dias Trabalhados"],
      ["Técnico 1", "Z01", 0],
    ];
    expect(parseVtAttendance(matrix, "days", "fortaleza", "2026-11").rows[0]).toMatchObject({
      id: "LOGIN:Z01",
      value: 0,
    });
    expect(() =>
      parseVtAttendance([matrix[0]!, ["Técnico 1", "Z01", ""]], "days", "fortaleza", "2026-11"),
    ).toThrow(/inválidos/);
    const hours = parseVtAttendance(
      [
        ["Técnico", "Média Hora"],
        ["Técnico 1", "08:15:00"],
      ],
      "entries",
      "fortaleza",
      "2026-11",
    );
    expect(hours.rows[0]?.value).toBe(29700);
    expect(vtSeconds(29700 / 86400)).toBe(29700);
    expect(vtSeconds("24:00")).toBeNull();
  });
  it("mantém pendente sem presença, aplica o desconto integral e congela valores em centavos", () => {
    const rows = classifyVtOrders(
      Array.from({ length: 5 }, (_, i) => [
        order(`A${i}`, "2026-11-01", 517, `C${i}`),
        order(`B${i}`, "2026-11-02", 517, `C${i}`),
      ]).flat(),
    );
    const attendance = (value: number) => [
      { id: "NOME:TECNICO 1", technician: "Técnico 1", login: "", value },
    ];
    expect(vtPayments(rows, [], [], VT_SHEET_RULES)[0]).toMatchObject({ total: null });
    expect(
      vtPayments(rows, attendance(30), attendance(29700), {
        ...VT_SHEET_RULES,
        bonusOrders: 10,
      })[0],
    ).toMatchObject({
      productive: 10,
      revisits: 5,
      base: 30000,
      discount: 10000,
      bonus: 20000,
      total: 40000,
    });
    expect(
      vtPayments(rows, attendance(1), attendance(29701), { ...VT_SHEET_RULES, bonusOrders: 10 })[0],
    ).toMatchObject({ base: 1200, discount: 10000, bonus: 0, total: 0 });
  });

  it("liga nomes abreviados por palavras em ordem e usa o mesmo login nas duas bases", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 517, "C1", { technician: "João Ribeiro" }),
      order("2", "2026-11-01", 517, "C2", { technician: "Lia Alves" }),
    ]);
    const days = [
      loginAttendance("Lia da Silva Alves", "Z2", 0),
      loginAttendance("Pedro João de Souza Ribeiro", "Z1", 23),
    ];
    const entries = [
      loginAttendance("Z1", "Z1", 28800),
      { id: "NOME:LIA DA SILVA ALVES", technician: "Lia da Silva Alves", login: "", value: 29700 },
    ];
    expect(vtPayments(rows, days, entries, VT_SHEET_RULES)).toMatchObject([
      {
        technician: "João Ribeiro",
        days: 23,
        entry: 28800,
        total: 27600,
        attendance: { login: "Z1" },
      },
      { technician: "Lia Alves", days: 0, entry: 29700, total: 0, attendance: { login: "Z2" } },
    ]);
  });

  it("sugere diferenças pequenas de grafia, mas não calcula até escolher o cadastro", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 517, "C1", { technician: "Bia Lopes" }),
      order("2", "2026-11-01", 517, "C2", { technician: "Lia Souza" }),
    ]);
    const days = [
      loginAttendance("Bia Lope Lima", "Z1", 20),
      loginAttendance("Lia Sousa Silva", "Z2", 25),
    ];
    const entries = days.map((row) => ({ ...row, value: 28800 }));
    expect(vtPayments(rows, days, entries, VT_SHEET_RULES)).toMatchObject([
      { attendanceIssue: "suggested", days: 20, entry: 28800, base: null, total: null },
      { attendanceIssue: "suggested", days: 25, entry: 28800, base: null, total: null },
    ]);
    const links = new Map([
      ["BIA LOPES", "LOGIN:Z1"],
      ["LIA SOUZA", "LOGIN:Z2"],
    ]);
    expect(vtPayments(rows, days, entries, VT_SHEET_RULES, links).map((r) => r.total)).toEqual([
      24000, 30000,
    ]);
  });

  it("não escolhe homônimos, não mistura logins e não paga dois nomes pelo mesmo cadastro", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 517, "C1", { technician: "João Lima" }),
    ]);
    const dayA = loginAttendance("João da Silva Lima", "Z1", 20);
    const entryB = loginAttendance("João da Silva Lima", "Z2", 28800);
    const entryA = { ...dayA, value: 28800 };
    expect(vtPayments(rows, [dayA], [entryB], VT_SHEET_RULES)[0]).toMatchObject({
      attendanceIssue: "ambiguous",
      days: null,
      entry: null,
      total: null,
    });
    expect(
      vtPayments(rows, [dayA], [entryB], VT_SHEET_RULES, new Map([["JOAO LIMA", "LOGIN:Z1"]]))[0],
    ).toMatchObject({ attendanceIssue: "incomplete", days: 20, entry: null, total: null });
    const duplicate = classifyVtOrders([
      ...rows,
      order("2", "2026-11-01", 517, "C2", { technician: "Z1" }),
    ]);
    expect(vtPayments(duplicate, [dayA], [entryA], VT_SHEET_RULES)).toMatchObject([
      { attendanceIssue: "duplicate", total: null },
      { attendanceIssue: "duplicate", total: null },
    ]);
    expect(
      vtPayments(rows, [dayA, { ...dayA, value: 4 }], [entryA], VT_SHEET_RULES)[0],
    ).toMatchObject({ attendanceIssue: "incomplete", days: null, entry: 28800, total: null });
  });
});

const samples = process.env["VT_XLSX_SAMPLE_DIR"];
describe.skipIf(!samples)("XLSX fornecidos (leitura, sem copiar dados para o repositório)", () => {
  it.each([
    ["revisitas_Fortaleza.xlsx", "fortaleza", 63, 47],
    ["Revisitas_Natal_Parnamirim.xlsx", "natal", 110, 64],
  ] as const)(
    "valida %s e suas O.S. produtivas",
    async (name, city, count, productive) => {
      const bytes = await readFile(join(samples!, name));
      const result = await readVtWorkbook(
        new File([Uint8Array.from(bytes)], name),
        "orders",
        city,
        "2026-11",
      );
      expect(result.rows).toHaveLength(count);
      expect(classifyVtOrders(result.rows as VtOrder[]).filter((r) => r.productive)).toHaveLength(
        productive,
      );
    },
    20000,
  );
});

const attendanceSamples = process.env["VT_FTZ_ATTENDANCE_DIR"];
it.skipIf(!attendanceSamples)(
  "cruza os três arquivos de Fortaleza já importados",
  async () => {
    async function load(name: string, kind: "orders" | "days" | "entries") {
      const bytes = await readFile(join(attendanceSamples!, name));
      return (
        await readVtWorkbook(new File([Uint8Array.from(bytes)], name), kind, "fortaleza", "2026-11")
      ).rows;
    }
    const [orders, days, entries] = await Promise.all([
      load("revisitas_Fortaleza.xlsx", "orders"),
      load("dias VT-FTZ.xlsx", "days"),
      load("entradas_FTZ.xlsx", "entries"),
    ]);
    const calc = (links?: ReadonlyMap<string, string>) =>
      vtPayments(
        classifyVtOrders(orders as VtOrder[]),
        days as VtAttendance[],
        entries as VtAttendance[],
        VT_SHEET_RULES,
        links,
      );
    const payments = calc();
    expect(payments).toHaveLength(10);
    expect(payments.filter((r) => r.total !== null)).toHaveLength(8);
    expect(payments.every((r) => r.days !== null && r.entry !== null)).toBe(true);
    const pending = payments.filter((r) => r.total === null);
    expect(pending.every((r) => r.attendanceIssue === "suggested")).toBe(true);
    const links = new Map(pending.map((r) => [r.technician, `LOGIN:${r.attendance!.login}`]));
    expect(calc(links).every((r) => r.total !== null)).toBe(true);
  },
  20000,
);
