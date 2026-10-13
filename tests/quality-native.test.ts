import { describe, expect, it } from "vitest";
import {
  associateDirectory,
  emptyQualityLogin,
  hydrateQuality,
  parseDirectoryMatrix,
  validQualityName,
} from "../src/lib/quality-directory";
import {
  aggregate,
  applyStatus,
  stat,
  qqQualifiedCategories,
  qqFrontMatches,
  qqMergeAgendaRecords,
  tcProjectionFor,
  type QQRecord,
  type TCRecord,
} from "../src/lib/quality-math";
import { mergeTC } from "../src/lib/quality-import";
const qq = (values: Partial<QQRecord> = {}): QQRecord => ({
  d: "2026-10-01",
  lt: "Z1",
  un: "NTL-DMV",
  ci: "Natal",
  cl: "RN",
  f: "ND",
  gf: "ND",
  b: 1,
  c: { TEC1: 1 },
  w: "1",
  contract: "1",
  os: "OS1",
  wo: "WO1",
  baixa: "100",
  responsible: "TECNICO",
  rawCategory: "TEC1",
  treatment: "COM QUEBRA DE AGENDA",
  service: "INSTALACAO",
  osGroup: "INSTALACAO",
  ...values,
});
const tc = (values: Partial<TCRecord> = {}): TCRecord => ({
  login: "Z1",
  name: "Teste",
  company: "",
  baseUnit: "NTL-DMV",
  mapSource: "base",
  qr: "0",
  tnum: "95",
  tden: "100",
  points: "127",
  day: "2026-09-21",
  month: 10,
  year: 2026,
  city: "Natal",
  sub: "",
  group: "",
  type: "",
  uf: "RN",
  wo: "WO1",
  finish: "21/09/2026 08:00:00",
  contract: "1",
  orders: "",
  lowCodes: "",
  revisitWo: "",
  noteAt: "01/10/2026",
  ...values,
});
describe("cadastro integrado de qualidade", () => {
  it("prioriza nome cadastrado válido e rejeita login/placeholder como nome", () => {
    expect(validQualityName("z1", "Z1")).toBe("");
    expect(validQualityName("Nome não localizado", "Z1")).toBe("");
    expect(validQualityName("  Nome correto  ", "Z1")).toBe("Nome correto");
    const state = {
      datasets: { certification: { records: [tc({ name: "Nome da origem" })] } },
      registry: {},
      imports: {},
    };
    expect(
      hydrateQuality(state, [{ ...emptyQualityLogin(), login: "Z1", full_name: "SEM NOME" }]).tc[0]
        ?.name,
    ).toBe("Nome da origem");
  });
  it("mantém a base de visita técnica isolada usando o mesmo cadastro de logins", () => {
    const state = {
      datasets: {
        certification: { records: [tc({ points: "127" })] },
        technical_visit: { records: [tc({ points: "150" })] },
      },
      registry: {},
      imports: {},
    };
    const directory = [{ ...emptyQualityLogin(), login: "Z1", full_name: "Nome compartilhado" }];
    expect(hydrateQuality(state, directory).tc[0]?.points).toBe("127");
    const visit = hydrateQuality(state, directory, "technical_visit");
    expect(visit.tc[0]?.points).toBe("150");
    expect(visit.tc[0]?.name).toBe("Nome compartilhado");
    expect(visit.qq).toHaveLength(0);
  });
  it("associa os dois formatos por nome completo e aceita duplicata idêntica", () => {
    const logins = parseDirectoryMatrix([
      ["login", "tecnico"],
      ["z1", "JOÃO SILVA"],
      ["Z2", "Outro"],
    ]);
    const rows = parseDirectoryMatrix([
      ["Login", "Colaborador", "CIdade", "Setor", "Supervisor"],
      ["", "JOAO SILVA", "Natal", "VT", "Gestor A"],
      ["", "JOAO SILVA", "Natal", "VT", "Gestor A"],
    ]);
    const result = associateDirectory([...logins, ...rows], []);
    expect(result.entries[0]).toMatchObject({
      login: "Z1",
      full_name: "JOÃO SILVA",
      city: "Natal",
      sector: "VT",
      supervisor: "Gestor A",
    });
    expect(result.entries[1]?.supervisor).toBe("");
    expect(result.warnings).toHaveLength(0);
  });
  it("não aproxima nomes nem escolhe supervisor conflitante", () => {
    const entry = { ...emptyQualityLogin(), login: "Z1", full_name: "JOAO SILVA" };
    const result = associateDirectory(
      [
        entry,
        { ...entry, login: "", supervisor: "A" },
        { ...entry, login: "", supervisor: "B" },
        { ...entry, login: "", full_name: "JOAO SILVA FILHO", supervisor: "C" },
      ],
      [],
    );
    expect(result.entries[0]?.supervisor).toBe("");
    expect(result.warnings).toHaveLength(1);
    expect(result.unmatchedNames).toHaveLength(1);
  });
  it("permite importar associações após os logins e preserva valores quando vazios", () => {
    const saved = {
      ...emptyQualityLogin(),
      login: "Z1",
      full_name: "Nome",
      city: "Natal",
      supervisor: "Antigo",
    };
    expect(
      associateDirectory(
        [{ ...emptyQualityLogin(), full_name: "Nome", supervisor: "Novo" }],
        [saved],
      ).entries[0],
    ).toMatchObject({ login: "Z1", city: "Natal", supervisor: "Novo" });
  });
  it("detecta login duplicado com nomes diferentes", () => {
    expect(() =>
      associateDirectory(
        [
          { ...emptyQualityLogin(), login: "Z1", full_name: "A" },
          { ...emptyQualityLogin(), login: "Z1", full_name: "B" },
        ],
        [],
      ),
    ).toThrow("nomes diferentes");
  });
  it("aplica cadastro sem alterar indicadores da base e expõe novos logins", () => {
    const state = {
      datasets: { quebra: { records: [qq()] }, certification: { records: [tc()] } },
      registry: {},
      imports: {},
    };
    const empty = hydrateQuality(state, []);
    expect(empty.missing).toHaveLength(1);
    const output = hydrateQuality(state, [
      { ...emptyQualityLogin(), login: "Z1", full_name: "Nome atualizado" },
    ]);
    expect(output.tc[0]?.name).toBe("Nome atualizado");
    expect(output.tc[0]?.points).toBe("127");
    expect(output.missing).toHaveLength(0);
  });
});
describe("regras originais no motor nativo", () => {
  it("preserva ND incluindo PME na frente e separa PME na visão geral", () => {
    const row = qq({ gf: "PME", f: "ND" });
    expect(qqFrontMatches(row, "ND")).toBe(true);
    expect(qqFrontMatches(row, "PME")).toBe(true);
    expect(qqFrontMatches(row, "ME")).toBe(false);
  });
  it("mantém rateio e denominador de todas as agendas", () => {
    const stats = stat([
      qq({ c: { TEC1: 1 / 3, GEO: 1 / 3, "Contato Cliente": 1 / 3 } }),
      qq({ c: { Outros: 1 } }),
    ]);
    expect(stats.q).toBe(1);
    expect(stats.pq).toBe(0.5);
    expect(stats.n).toBe(2);
  });
  it("mantém exceções cliente, agendamento não cumprido e baixa 409", () => {
    expect(qqQualifiedCategories(qq({ responsible: "REAG_CLIENTE" }))).toBe(null);
    expect(
      stat([
        qq({
          responsible: "REAG_CLIENTE",
          rawCategory: "AGENDAMENTO NÃO CUMPRIDO",
          c: { Baixa100: 1 },
        }),
      ]).q,
    ).toBe(1);
    expect(
      stat([
        qq({
          baixa: "409",
          responsible: "SEM_QUEBRA",
          rawCategory: "N/A",
          treatment: "SEM QUEBRA DE AGENDA",
        }),
      ]),
    ).toMatchObject({ n: 1, b: 0, q: 0 });
  });
  it("reimporta sem duplicar O.S. e WOs", () => {
    expect(qqMergeAgendaRecords([qq()], [qq({ b: 0 })]).rows).toHaveLength(1);
    expect(mergeTC([tc()], [tc({ points: "140" })])[0]?.points).toBe("140");
  });
  it("certifica com limites inclusivos de TEC1 e produtividade", () => {
    const values = aggregate([tc()]);
    applyStatus(values);
    expect(values[0]?.status).toBe(true);
    const bad = aggregate([tc({ points: "126.9" })]);
    applyStatus(bad);
    expect(bad[0]?.status).toBe(false);
  });
  it("conta retornos distintos em Fortaleza em cada recorte", () => {
    const values = aggregate([
      tc({ baseUnit: "FTZ-DMV_01", qr: "1", revisitWo: "RET1" }),
      tc({ wo: "WO2", baseUnit: "FTZ-DMV_01", qr: "1", revisitWo: "RET1" }),
    ]);
    expect(values[0]?.revBad).toBe(1);
    expect(values[0]?.revisit).toBe(0.5);
  });
  it("mantém projeção original e zero dias sem divisão inválida", () => {
    const values = aggregate([tc({ points: "100" })]);
    applyStatus(values);
    const plan = tcProjectionFor(values[0]!, { workDays: 2, pointedOrders: new Map([["Z1", 1]]) });
    expect(plan.prod.total).toBe(281);
    expect(plan.prod.daily).toBe(140.5);
    expect(tcProjectionFor(values[0]!, { workDays: 0, pointedOrders: new Map() }).prod.daily).toBe(
      null,
    );
  });
});
