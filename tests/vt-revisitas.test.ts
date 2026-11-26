import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { QualityLogin } from "../src/lib/quality-directory";
import {
  classifyVtOrders,
  parseVtAttendance,
  parseVtOrders,
  prepareVtOrderImport,
  VT_SHEET_RULES,
  vtDate,
  vtFilterOrderDetails,
  vtOrderKey,
  vtOrderMatchesCategory,
  vtOrderServiceOptions,
  vtPayments,
  vtSeconds,
  vtSummaries,
  vtTeamPayments,
  vtTeamScope,
  type VtOrder,
  type VtAttendance,
} from "../src/lib/vt-revisitas";
import { readVtWorkbook } from "../src/lib/vt-revisitas-xlsx";
import { vtMapArea } from "../src/lib/vt-revisitas-geography";

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
const registered = (
  login: string,
  full_name: string,
  city = "Fortaleza",
  sector = "Visita técnica",
): QualityLogin => ({ login, full_name, city, sector, supervisor: "" });

describe("Revisitas VT", () => {
  it("lista serviços sem duplicar grafias e combina o filtro de serviço com classificação e busca", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-25", 203, "C1", {
        neighborhood: "TIROL",
        service: "VISITA TECNICA - VIRTUA",
      }),
      order("2", "2026-11-24", 540, "C2", {
        neighborhood: "TIROL",
        service: "Visita Técnica - Virtua",
      }),
      order("3", "2026-11-23", 570, "C3", {
        neighborhood: "TIROL",
        service: "MANUTENCAO PREVENTIVA INDOOR I",
      }),
      order("4", "2026-11-22", 204, "C4", {
        neighborhood: "IGAPO",
        service: " VISITA TECNICA -  VIRTUA ",
      }),
      order("5", "2026-11-21", 517, "C5", { service: "" }),
    ]);
    expect(vtOrderServiceOptions(rows)).toEqual([
      { value: "MANUTENCAO PREVENTIVA INDOOR I", label: "MANUTENCAO PREVENTIVA INDOOR I" },
      { value: "VISITA TECNICA - VIRTUA", label: "VISITA TECNICA - VIRTUA" },
    ]);
    const filters = {
      category: "expunge",
      search: "Tírol",
      service: "VISITA TECNICA - VIRTUA",
    } as const;
    expect(vtFilterOrderDetails(rows, filters).map((row) => row.os)).toEqual(["1"]);
    expect(vtFilterOrderDetails(rows, { ...filters, service: "" }).map((row) => row.os)).toEqual([
      "1",
      "3",
    ]);
    expect(vtFilterOrderDetails(rows, { category: "all", search: "", service: "" })).toEqual(rows);
  });

  it("só paga logins VT da cidade, mas preserva o retorno feito pela Adesão", () => {
    const directory = [
      registered("Z1", "Ana Rodrigues de Almeida"),
      registered("Z2", "Laís Cunha", "Fortaleza", "Adesão/Serviços"),
      registered("Z3", "Técnico de Natal", "Natal"),
    ];
    const rows = classifyVtOrders([
      order("A", "2026-11-01", 517, "CONTRATO", { technician: "Ana Almeida" }),
      order("B", "2026-11-02", 517, "CONTRATO", { technician: "Laís Cunha" }),
      order("C", "2026-11-03", 517, "C2", { technician: "Z1" }),
      order("D", "2026-11-03", 517, "C3", { technician: "Técnico de Natal" }),
      order("E", "2026-11-03", 517, "C4", { technician: "Sem Cadastro" }),
    ]);
    const team = vtTeamScope(rows, directory, "fortaleza");
    expect(team.members.map((r) => r.login)).toEqual(["Z1"]);
    expect(team.rows.map((r) => [r.os, r.technicianLogin])).toEqual([
      ["C", "Z1"],
      ["A", "Z1"],
    ]);
    expect(team.rows.find((r) => r.os === "A")).toMatchObject({ revisited: true, returnOs: "B" });
    const days = [
      loginAttendance("Ana Rodrigues de Almeida", "Z1", 21),
      loginAttendance("Laís Cunha", "Z2", 25),
      loginAttendance("Técnico de Natal", "Z3", 25),
    ];
    const entries = days.map((r) => ({ ...r, value: 28500 }));
    expect(vtTeamPayments(team, days, entries, VT_SHEET_RULES)).toMatchObject([
      {
        login: "Z1",
        technician: "Ana Rodrigues de Almeida",
        productive: 2,
        revisits: 1,
        total: 25200,
      },
    ]);
    expect(vtTeamPayments(team, [], entries, VT_SHEET_RULES)).toMatchObject([
      { login: "Z1", attendanceIssue: "incomplete", total: null },
    ]);
  });

  it("não vincula homônimo da Adesão e só confirma grafia para o login VT correspondente", () => {
    const directory = [
      registered("Z1", "Lia Martins Lima"),
      registered("Z2", "Lia Martins Lima", "Fortaleza", "Adesão/Serviços"),
      registered("Z3", "Bia Lope dos Santos"),
      registered("Z4", "Cris Almeida", "Parnamirim"),
    ];
    const rows = classifyVtOrders([
      order("A", "2026-11-01", 517, "C1", { technician: "Lia Martins Lima" }),
      order("B", "2026-11-01", 517, "C2", { technician: "Bia Lopes" }),
      order("C", "2026-11-01", 517, "C3", { technician: "Z2" }),
    ]);
    const scope = (id: string) =>
      vtTeamScope(
        rows,
        directory,
        "fortaleza",
        new Map([
          ["BIA LOPES", id],
          ["LIA MARTINS LIMA", "LOGIN:Z1"],
        ]),
      );
    const rejected = scope("LOGIN:Z1");
    expect(rejected.rows).toEqual([]);
    expect([...rejected.pending.keys()]).toEqual(["Z3"]);
    expect(vtTeamPayments(rejected, [], [], VT_SHEET_RULES)).toMatchObject([
      { login: "Z3", attendanceIssue: "suggested", total: null },
    ]);
    const confirmed = scope("LOGIN:Z3");
    expect(confirmed.rows.map((r) => [r.os, r.technicianLogin])).toEqual([["B", "Z3"]]);
    expect(confirmed.attendance([loginAttendance("Bia Lope dos Santos", "Z2", 25)])).toEqual([]);
    expect(vtTeamScope(rows, directory, "natal").members.map((r) => r.login)).toEqual(["Z4"]);
  });

  it("mantém O.S. distintas da mesma WO, elimina repetições idênticas e rejeita conflito", () => {
    const imported = parseVtOrders(
      [heading, line("1"), line("2"), line("1")],
      "fortaleza",
      "2026-11",
    );
    expect(imported.rows.map((r) => r.id)).toEqual([
      "OS:1|WO:WO1|D:2026-11-18",
      "OS:2|WO:WO1|D:2026-11-18",
    ]);
    expect(imported.duplicates).toBe(1);
    expect(() =>
      parseVtOrders(
        [heading, line("1"), line("1").map((value, i) => (i === 6 ? 555 : value))],
        "fortaleza",
        "2026-11",
      ),
    ).toThrow(/Linhas 2 e 3:.*informações diferentes/);
  });
  it("preserva a mesma O.S. com outra WO ou em outro dia, escapando separadores da origem", () => {
    const withWo = (wo: string, day = "18/11/2026") =>
      line("1", "Fortaleza", day).map((value, index) => (index === 2 ? wo : value));
    const imported = parseVtOrders(
      [heading, withWo("A|B"), withWo("A%7CB"), withWo("A|B", "19/11/2026")],
      "fortaleza",
      "2026-11",
    );
    expect(imported.rows.map(({ id }) => id)).toEqual([
      "OS:1|WO:A%7CB|D:2026-11-18",
      "OS:1|WO:A%257CB|D:2026-11-18",
      "OS:1|WO:A%7CB|D:2026-11-19",
    ]);
    expect(imported.duplicates).toBe(0);
  });
  it("separa sem baixa de código zero e ainda bloqueia ordens com baixa inválida", () => {
    const columns = [...heading, "Status", "Data da Baixa", "Data Baixa Sistema"];
    const item = (os: string, code: number | string, status: string, at: string, system = "") => [
      ...line(os).map((value, i) => (i === 6 ? code : value)),
      status,
      at,
      system,
    ];
    const pending = item("1", "", "1", "");
    const cancelled = item("2", 0, "3", "18/11/2026");
    expect(parseVtOrders([columns, pending, cancelled], "fortaleza", "2026-11")).toMatchObject({
      rows: [{ os: "2", code: 0 }],
      pendingLines: [2],
    });
    expect(() => parseVtOrders([columns, pending], "fortaleza", "2026-11")).toThrow(
      /Nenhuma ordem com baixa/,
    );
    for (const broken of [
      item("3", "", "2", "18/11/2026"),
      item("3", "X", "1", ""),
      item("3", "", "1", "", "18/11/2026"),
    ]) {
      expect(() => parseVtOrders([columns, cancelled, broken], "fortaleza", "2026-11")).toThrow(
        /Linha 3: código de baixa (?:ausente|inválido)/,
      );
    }
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
  it.each([
    [516, "productive"],
    [510, "productive"],
    [302, "improductive"],
    [106, "improductive"],
    [570, "expunge"],
    [0, "cancelled"],
    [1, "cancelled"],
  ] as const)(
    "classifica a preventiva com baixa %i na categoria %s sem contar o retorno como revisita",
    (code, category) => {
      const original = order("original", "2026-11-13", 516);
      const preventive = order("preventiva", "2026-11-16", code, "C1", {
        service: "  Manutenção Preventiva  Indoor I  ",
      });
      const rows = classifyVtOrders([preventive, original]);
      expect(rows.find((r) => r.os === original.os)).toMatchObject({
        productive: true,
        expunged: false,
        revisited: false,
        returnOs: "",
      });
      expect(rows.find((r) => r.os === preventive.os)).toMatchObject({
        productive: category === "productive",
        improductive: category === "improductive",
        expunged: category === "expunge",
        cancelled: category === "cancelled",
        revisited: false,
        returnOs: "",
      });
    },
  );
  it("ignora a preventiva no vínculo mesmo quando o XLSX marcou a original como revisitada", () => {
    const rows = classifyVtOrders([
      order("original", "2026-11-13", 516, "C1", {
        sheetClassification: { improductive: false, revisited: true, expunged: false },
      }),
      order("preventiva", "2026-11-16", 516, "C1", {
        service: "MANUTENCAO PREVENTIVA INDOOR I",
      }),
    ]);
    expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
      productive: 2,
      expunged: 0,
      revisits: 0,
    });
    expect(rows.find((r) => r.os === "original")?.returnOs).toBe("");
  });
  it("preserva um retorno técnico válido depois de uma preventiva sem contá-lo duas vezes", () => {
    const rows = classifyVtOrders([
      order("retorno", "2026-11-17", 516),
      order("preventiva", "2026-11-16", 516, "C1", {
        service: "MANUTENCAO PREVENTIVA INDOOR I",
      }),
      order("original", "2026-11-13", 516),
    ]);
    expect(rows.filter((r) => r.revisited).map((r) => [r.os, r.returnOs])).toEqual([
      ["original", "retorno"],
    ]);
    expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
      productive: 3,
      expunged: 0,
      revisits: 1,
    });
  });
  it("mantém a visita de 08/11 como retorno de 04/11 apesar do cancelamento fora da janela", () => {
    const contract = "3618480";
    const rows = classifyVtOrders([
      order("original", "2026-11-04", 538, contract),
      order("retorno", "2026-11-08", 516, contract, { service: "VISITA TECNICA STREAMING" }),
      order("preventiva", "2026-11-13", 302, contract, {
        service: "MANUTENCAO PREVENTIVA INDOOR I",
      }),
      order("cancelada", "2026-11-16", 1, contract),
    ]);
    expect(rows.find((r) => r.os === "original")).toMatchObject({
      productive: true,
      revisited: true,
      returnOs: "retorno",
    });
    expect(rows.filter((r) => vtOrderMatchesCategory(r, "productive")).map((r) => r.os)).toEqual([
      "retorno",
      "original",
    ]);
    expect(rows.find((r) => r.os === "preventiva")).toMatchObject({
      expunged: false,
      productive: false,
      improductive: true,
      revisited: false,
    });
  });
  it("mantém a baixa 106 de uma visita comum como improdutiva mesmo com retorno cancelado", () => {
    const rows = classifyVtOrders([
      order("baixa106", "2026-11-11", 106),
      order("cancelada", "2026-11-12", 1),
    ]);
    expect(rows.find((r) => r.os === "baixa106")).toMatchObject({
      improductive: true,
      expunged: false,
      productive: false,
    });
  });
  it("usa a baixa da preventiva mesmo com expurgo, improdutividade ou revisita marcados no XLSX", () => {
    const service = "MANUTENCAO PREVENTIVA INDOOR I";
    const rows = classifyVtOrders([
      order("baixa510", "2026-11-13", 510, "C1", {
        service,
        sheetClassification: { improductive: false, expunged: true, revisited: false },
      }),
      order("baixa516", "2026-11-13", 516, "C2", {
        service,
        sheetClassification: { improductive: true, expunged: false, revisited: true },
      }),
      order("baixa302", "2026-11-13", 302, "C3", {
        service,
        sheetClassification: { improductive: false, expunged: false, revisited: true },
      }),
    ]);
    expect(rows.filter((r) => vtOrderMatchesCategory(r, "productive")).map((r) => r.code)).toEqual([
      516, 510,
    ]);
    expect(
      rows.filter((r) => vtOrderMatchesCategory(r, "improductive")).map((r) => r.code),
    ).toEqual([302]);
    expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
      productive: 2,
      improductive: 1,
      expunged: 0,
      revisits: 0,
    });
  });
  it("não inclui troca de equipamento streaming nas produtivas nem no cálculo de revisitas", () => {
    const rows = classifyVtOrders([
      order("original", "2026-11-18", 517),
      order("troca", "2026-11-20", 516, "C1", {
        service: " Troca de  Equipamento Streaming ",
        sheetClassification: { improductive: false, expunged: false, revisited: true },
      }),
      order("retorno", "2026-11-21", 516, "C1", { service: "VISITA TECNICA STREAMING" }),
    ]);
    expect(rows.find((r) => r.os === "troca")).toMatchObject({
      productive: false,
      improductive: false,
      revisited: false,
      returnOs: "",
    });
    expect(rows.find((r) => r.os === "original")).toMatchObject({
      revisited: true,
      returnOs: "retorno",
    });
    expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
      orders: 3,
      productive: 2,
      revisits: 1,
    });
  });
  it("considera 400 improdutivo e separa expurgos do volume produtivo", () => {
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
    expect(get("3")).toMatchObject({ expunged: true, productive: false, revisited: false });
    expect(get("5")).toMatchObject({ revisited: false });
    expect(get("7")).toMatchObject({ expunged: false, productive: false, improductive: true });
    expect(get("8")).toMatchObject({ revisited: false });
  });
  it("separa os códigos 0 e 1 de improdutivas, produtivas e expurgadas", () => {
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 517, "CANCELAMENTO"),
      order("2", "2026-11-02", 0, "CANCELAMENTO", { description: "CANCELAMENTO" }),
      order("3", "2026-11-01", 555, "REVISITA"),
      order("4", "2026-11-02", 1, "REVISITA", {
        description: "REVISITA CANCELADA",
        expunge: true,
      }),
      order("5", "2026-11-02", 400, "IMPRODUTIVA"),
    ]);
    const cancelled = rows.filter((r) => vtOrderMatchesCategory(r, "cancelled"));
    expect(cancelled.map((r) => r.code).sort()).toEqual([0, 1]);
    for (const row of cancelled) {
      expect(row).toMatchObject({
        productive: false,
        improductive: false,
        expunged: false,
        revisited: false,
        returnOs: "",
      });
    }
    expect(rows.find((r) => r.os === "1")).toMatchObject({ productive: true, revisited: false });
    expect(rows.find((r) => r.os === "3")).toMatchObject({
      expunged: false,
      productive: true,
      revisited: false,
    });
    expect(
      rows.filter((r) => vtOrderMatchesCategory(r, "improductive")).map((r) => r.code),
    ).toEqual([400]);
    expect(vtSummaries(rows, () => "Total")[0]).toEqual({
      name: "Total",
      orders: 5,
      productive: 2,
      revisits: 0,
      improductive: 1,
      cancelled: 2,
      expunged: 0,
    });
  });
  it.each([203, 204, 570, 473, 583])(
    "expurga a baixa %s sem retorno, inclusive de planilha antiga",
    (code) => {
      const rows = classifyVtOrders([
        order("relatorio", "2026-11-24", code, "C1"),
        order("planilha", "2026-11-24", code, "C2", {
          sheetClassification: { expunged: false, improductive: true, revisited: true },
        }),
      ]);
      for (const row of rows) {
        expect(vtOrderMatchesCategory(row, "all")).toBe(true);
        expect(vtOrderMatchesCategory(row, "expunge")).toBe(true);
        expect(vtOrderMatchesCategory(row, "productive")).toBe(false);
        expect(vtOrderMatchesCategory(row, "improductive")).toBe(false);
        expect(vtOrderMatchesCategory(row, "revisit")).toBe(false);
      }
      expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
        orders: 2,
        productive: 0,
        improductive: 0,
        expunged: 2,
        revisits: 0,
      });
    },
  );
  it.each([549, 540])("mantém produtiva a Visita Técnica – Virtua com baixa %s", (code) => {
    const service = " Visita Técnica - Virtua ";
    const rows = classifyVtOrders([
      order("visita", "2026-11-23", code, "C1", { service }),
      order("cancelada", "2026-11-24", 1, "C1"),
      order("importada", "2026-11-23", code, "C2", {
        service,
        sheetClassification: { expunged: false, improductive: true, revisited: false },
      }),
    ]);
    expect(
      rows
        .filter((r) => r.productive)
        .map((r) => r.os)
        .sort(),
    ).toEqual(["importada", "visita"]);
    expect(rows.every((r) => !r.expunged)).toBe(true);
  });
  it("não expurga fora da lista por limpeza de ruído, retorno ou marcação antiga", () => {
    const cleaning = { service: "Limpeza de Ruído Indoor" };
    const rows = classifyVtOrders([
      order("1", "2026-11-01", 106, "C1", cleaning),
      order("2", "2026-11-02", 517, "C1"),
      order("3", "2026-11-01", 517, "C2"),
      order("4", "2026-11-02", 106, "C2", cleaning),
      order("antiga-112", "2026-11-01", 112, "C3", {
        sheetClassification: { expunged: true, improductive: false, revisited: false },
      }),
      order("retorno-112", "2026-11-02", 517, "C3"),
    ]);
    expect(rows.some((r) => r.expunged)).toBe(false);
    expect(rows.find((r) => r.os === "antiga-112")).toMatchObject({
      improductive: true,
      productive: false,
    });
  });
  it("ignora expurgos no vínculo sem bloquear um retorno produtivo real", () => {
    const rows = classifyVtOrders([
      order("original", "2026-11-01", 517, "C1"),
      order("expurgada-1", "2026-11-02", 203, "C1"),
      order("retorno", "2026-11-03", 516, "C1"),
      order("expurgada-2", "2026-11-04", 204, "C1"),
      order("sem-retorno", "2026-11-01", 517, "C2", {
        sheetClassification: { revisited: true, expunged: false, improductive: false },
      }),
      order("unico-expurgo", "2026-11-03", 583, "C2"),
    ]);
    expect(rows.filter((r) => r.revisited).map((r) => [r.os, r.returnOs])).toEqual([
      ["original", "retorno"],
    ]);
  });
  it("usa Prod, Improd e Expurgadas do Sheets sem recalcular as ordens conferidas", () => {
    const columns = [...heading, "Mês", "Equipe", "Prod", "Improd", "Expurgadas"];
    const item = (
      os: string,
      day: string,
      code: number,
      prod: unknown,
      improd: number,
      exp: number,
      city = "Fortaleza",
    ) => [
      day,
      "C1",
      `WO${os}`,
      os,
      "Técnico 1",
      city,
      code,
      "Centro",
      "novembro 26",
      "VT",
      prod,
      improd,
      exp,
    ];
    const lines = [
      item("1", "01/11/2026", 302, 0, 1, 0),
      item("2", "02/11/2026", 302, 0, 0, 0),
      item("3", "03/11/2026", 517, 1, 0, 0),
      item("4", "04/11/2026", 473, 0, 1, 1),
      item("8", "05/11/2026", 517, 0, 0, 0),
      item("5", "06/11/2026", 0, 0, 1, 1),
      item("6", "01/10/2026", 517, null, 0, 0),
      item("7", "04/11/2026", 517, null, 0, 0, "Natal"),
    ];
    const imported = parseVtOrders([columns, ...lines], "fortaleza", "2026-11");
    expect(imported.fromSheet).toBe(true);
    const classified = classifyVtOrders(imported.rows);
    const classifiedByOs = new Map(classified.map((r) => [r.os, r]));
    expect(classifiedByOs.get("1")).toMatchObject({ productive: false, improductive: true });
    expect(classifiedByOs.get("2")).toMatchObject({ productive: true, revisited: false });
    expect(classifiedByOs.get("3")).toMatchObject({
      productive: true,
      revisited: true,
      returnOs: "8",
      expunged: false,
    });
    expect(classifiedByOs.get("4")).toMatchObject({
      productive: false,
      improductive: false,
      expunged: true,
    });
    expect(classifiedByOs.get("5")).toMatchObject({
      cancelled: true,
      improductive: false,
      expunged: false,
    });
    expect(vtSummaries(classified, () => "Total")[0]).toMatchObject({
      orders: 6,
      productive: 3,
      improductive: 1,
      expunged: 1,
      revisits: 1,
    });
    expect(() =>
      parseVtOrders([columns, item("9", "07/11/2026", 517, null, 0, 0)], "fortaleza", "2026-11"),
    ).toThrow(/coluna Prod.*resultado calculado/i);
  });
  it("prioriza a base classificada no XLSX do Sheets e lê só a competência selecionada", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Detalhe anterior").addRows([heading, line("1", "Fortaleza", "03/10/2026")]);
    const source = book.addWorksheet("Revisitas Imperium 2.0");
    source.addRows([
      [...heading, "Mês", "Equipe", "Prod", "Improd", "Expurgadas"],
      [...line("2"), "novembro 26", "VT", { formula: "0", result: 0 }, 0, 0],
    ]);
    source.getRow(16000).values = [...line("3", "Fortaleza", "03/10/2026"), "outubro 26", "VT"];
    const bytes = await book.xlsx.writeBuffer();
    const imported = await readVtWorkbook(
      new File([new Uint8Array(bytes)], "sheets.xlsx"),
      "orders",
      "fortaleza",
      "2026-11",
    );
    expect(imported).toMatchObject({
      kind: "orders",
      fromSheet: true,
      rows: [{ os: "2", sheetClassification: { revisited: false } }],
    });
  }, 20_000);
  it.each([
    ["Fortaleza", "fortaleza"],
    ["Natal", "natal"],
    ["Parnamirim", "natal"],
  ] as const)(
    "lê o XLSX com namespace prefixado para %s sem mudar a classificação",
    async (municipality, city) => {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      book.addWorksheet("Revisitas Imperium 2.0").addRows([
        [...heading, "Mês", "Equipe", "Prod", "Improd", "Expurgadas"],
        [
          ...line("2", municipality, new Date("2026-11-12T00:00:00Z")),
          "novembro 26",
          "VT",
          { formula: "0", result: 0 },
          1,
          0,
        ],
      ]);
      const bytes = new Uint8Array(await book.xlsx.writeBuffer());
      const parts = unzipSync(bytes);
      for (const name of [
        "xl/workbook.xml",
        "xl/styles.xml",
        "xl/sharedStrings.xml",
        "xl/worksheets/sheet1.xml",
      ]) {
        parts[name] = strToU8(
          strFromU8(parts[name]!)
            .replace(
              'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
              'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            )
            .replace(/<(\/?)([\w.-]+)(?=[\s/>])/g, "<$1x:$2"),
        );
      }
      const read = (data: Uint8Array) =>
        readVtWorkbook(
          new File([Uint8Array.from(data)], "revisitas.xlsx"),
          "orders",
          city,
          "2026-11",
        );
      const ordinary = await read(bytes);
      expect(ordinary).toMatchObject({
        kind: "orders",
        fromSheet: true,
        rows: [
          {
            os: "2",
            day: "2026-11-12",
            sheetClassification: { revisited: false, improductive: true, expunged: false },
          },
        ],
      });
      await expect(read(zipSync(parts))).resolves.toStrictEqual(ordinary);
    },
  );
  it.each(["FORTALEZA", "NATAL", "PARNAMIRIM"])(
    "mantém a O.S. conferida como improdutiva ao reimportar o relatório bruto de %s",
    (municipality) => {
      const raw = order("1", "2026-11-12", 517, "C1", { municipality });
      const checked = {
        ...raw,
        sheetClassification: { revisited: false, improductive: true, expunged: false },
      };
      const cancelled = order("2", "2026-11-13", 0, "C1", { municipality });
      const effectiveVisit = order("3", "2026-11-23", 505, "C1", { municipality });
      const prepared = prepareVtOrderImport([checked], [raw, cancelled, effectiveVisit]);
      expect(prepared).toMatchObject({ newRows: 2, retainedClassifications: 1 });
      expect(prepared.rows[0]?.sheetClassification).toEqual(checked.sheetClassification);
      const rows = classifyVtOrders(prepared.rows);
      expect(rows.find((r) => r.os === raw.os)).toMatchObject({
        productive: false,
        improductive: true,
        expunged: false,
      });
      expect(vtSummaries(rows, () => "Total")[0]).toMatchObject({
        productive: 1,
        improductive: 1,
        cancelled: 1,
        expunged: 0,
      });
    },
  );
  it("aceita nova classificação do Sheets e não reaproveita uma conferência de outra baixa", () => {
    const raw = order("1", "2026-11-12", 204);
    const previous = {
      ...raw,
      sheetClassification: { revisited: false, improductive: true, expunged: false },
    };
    const correction = {
      ...raw,
      sheetClassification: { revisited: false, improductive: false, expunged: true },
    };
    expect(prepareVtOrderImport([previous], [correction])).toEqual({
      rows: [correction],
      newRows: 0,
      retainedClassifications: 0,
    });
    for (const changed of [
      { ...raw, code: 505 },
      { ...raw, contract: "C2" },
    ]) {
      expect(prepareVtOrderImport([previous], [changed])).toEqual({
        rows: [changed],
        newRows: 0,
        retainedClassifications: 0,
      });
    }
    const otherAttendance = { ...raw, wo: "WO2" };
    expect(prepareVtOrderImport([previous], [otherAttendance])).toEqual({
      rows: [otherAttendance],
      newRows: 1,
      retainedClassifications: 0,
    });
  });
  it("avisa em português quando o arquivo não pode ser lido como XLSX", async () => {
    await expect(
      readVtWorkbook(new File(["inválido"], "revisitas.xlsx"), "orders", "fortaleza", "2026-11"),
    ).rejects.toThrow(/salve como pasta de trabalho do excel/i);
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

const batchDir = process.env["VT_FTZ_BATCH_DIR"];
it.skipIf(!batchDir)(
  "carrega os dois novos lotes de Fortaleza sem apagar as visitas do dia 18",
  async () => {
    const results = await Promise.all(
      ["vt-ftz_01_17.xlsx", "revisitas_Fortaleza.xlsx", "Vt-FTZ_19_22.xlsx"].map(async (name) => {
        const bytes = await readFile(join(batchDir!, name));
        const result = await readVtWorkbook(
          new File([Uint8Array.from(bytes)], name),
          "orders",
          "fortaleza",
          "2026-11",
        );
        if (result.kind !== "orders") throw Error("Esperado arquivo de O.S.");
        return result;
      }),
    );
    expect(results.map((result) => result.rows.length)).toEqual([1072, 63, 184]);
    expect(results.map((result) => result.pendingLines)).toEqual([[770, 1075], [], [11]]);
    const orders = results.flatMap(({ rows }) => rows);
    const merged = new Map(orders.map((row) => [vtOrderKey(row), row]));
    expect(merged.size).toBe(1319);
    expect(new Set(orders.map((row) => row.os)).size).toBeLessThan(merged.size);
    for (const row of orders) expect(row.id).toBe(vtOrderKey(row));
  },
  20000,
);

const samples = process.env["VT_XLSX_SAMPLE_DIR"];
describe.skipIf(!samples)("XLSX fornecidos (leitura, sem copiar dados para o repositório)", () => {
  it.each([
    [
      "revisitas_Fortaleza.xlsx",
      "fortaleza",
      { orders: 63, productive: 43, improductive: 1, expunged: 4, cancelled: 15, revisits: 0 },
    ],
    [
      "Revisitas_Natal_Parnamirim.xlsx",
      "natal",
      { orders: 110, productive: 58, improductive: 35, expunged: 7, cancelled: 10, revisits: 0 },
    ],
  ] as const)(
    "valida %s e o total de O.S. por classificação",
    async (name, city, totals) => {
      const bytes = await readFile(join(samples!, name));
      const result = await readVtWorkbook(
        new File([Uint8Array.from(bytes)], name),
        "orders",
        city,
        "2026-11",
      );
      expect(result.rows).toHaveLength(totals.orders);
      const unmapped = (result.rows as VtOrder[]).filter((row) => !vtMapArea(row)?.point);
      // "B VISTA" could stand for either Bela Vista or Boa Vista / Castelão.
      expect([...new Set(unmapped.map((row) => row.neighborhood))]).toEqual(
        city === "fortaleza" ? ["B VISTA"] : [],
      );
      expect(
        vtSummaries(classifyVtOrders(result.rows as VtOrder[]), () => "Total")[0],
      ).toMatchObject(totals);
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
