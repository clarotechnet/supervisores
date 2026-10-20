import { describe, expect, it } from "vitest";
import { normalizeSlaRows, groupRows, calc, csvToRows } from "../src/lib/sla-math";
import { assertSlaSnapshot } from "../src/lib/sla-warranty";
import { importSlaFile, extractSlaHtml } from "../src/lib/sla-import";
const consolidated = (changes: Record<string, unknown> = {}) => ({
  DAT_NOTA: "01/10/2026",
  DAT_BAIXA: "01/09/2026",
  NUM_CONTA: "C1",
  COD_OS: "OS1",
  DSC_MUNICIPIO_BI: "Fortaleza",
  DSC_SGL_ESTADO: "CE",
  DSC_CLUSTER_BI: "Fortaleza",
  DSC_UNIDADE_NEGOCIO_UNIF: "FTZ-DMV_01",
  UN: "FTZ-DMV_01",
  DSC_TIPO_ORDEM_SERVICO: "INSTALAÇÃO",
  COD_LOGIN_TECNICO: "Z1",
  DSC_QUALIFICADOR_OS: "COM PADRAO",
  QTD_OS_ATEND_PADRAO: 1,
  QTD_LOG_OS_VT: 0,
  QTD_TAREFAS: 2,
  ...changes,
});
describe("SLA Garantia preservado do HTML v18", () => {
  it("separa indicadores pelas janelas exatas de 30 e 10 dias", () => {
    const data = normalizeSlaRows([
      consolidated(),
      consolidated({ COD_OS: "OS2", NUM_CONTA: "C2", DAT_BAIXA: "21/09/2026" }),
    ]);
    expect(data.records.map((row) => row.indicator)).toEqual([
      "Sla Garantia Total",
      "Sla Garantia",
    ]);
    expect(() => normalizeSlaRows([consolidated({ DAT_BAIXA: "22/09/2026" })])).toThrow(
      "distância",
    );
  });
  it("mantém o cálculo por atendimento e a ponderação original por tarefa", () => {
    const { records } = normalizeSlaRows([
      consolidated(),
      consolidated({
        COD_OS: "OS2",
        NUM_CONTA: "C2",
        QTD_TAREFAS: 3,
        QTD_LOG_OS_VT: 2,
        DSC_QUALIFICADOR_OS: "SEM PADRAO",
        QTD_OS_ATEND_PADRAO: 0,
      }),
    ]);
    const groups = groupRows(records);
    expect(calc(groups, "attendance")).toMatchObject({
      total: 2,
      good: 1,
      revis: 1,
      logs: 2,
      sla: 25,
    });
    expect(calc(groups, "tasks")).toMatchObject({
      total: 5,
      good: 2,
      revis: 3,
      logs: 6,
      sla: 200 / 11,
    });
    expect(records[1]?.taskCount).toBe(3);
  });
  it("não transforma sem padrão com zero logs em atendimento regular", () => {
    const { records } = normalizeSlaRows([
      consolidated({ DSC_QUALIFICADOR_OS: "SEM PADRAO", QTD_OS_ATEND_PADRAO: 0 }),
    ]);
    expect(calc(groupRows(records))).toMatchObject({ good: 0, revis: 1, logs: 0, sla: 0 });
  });
  it("remove cópias idênticas, mas rejeita conflitos e duplicação de atendimento consolidado", () => {
    expect(normalizeSlaRows([consolidated(), consolidated()]).records).toHaveLength(1);
    expect(() => normalizeSlaRows([consolidated(), consolidated({ QTD_TAREFAS: 3 })])).toThrow(
      "conflitantes",
    );
    expect(() => normalizeSlaRows([consolidated(), consolidated({ COD_OS: "OS2" })])).toThrow(
      "mesmo atendimento",
    );
  });
  it("CSV respeita aspas, BOM e separador e um reenvio não acrescenta linhas", async () => {
    const raw = consolidated();
    const headers = Object.keys(raw);
    const text = `\uFEFF${headers.join(";")}\n${headers.map((key) => String(raw[key as keyof typeof raw])).join(";")}`;
    expect(csvToRows(text)).toHaveLength(1);
    const file = new File([text], "sla.csv");
    const first = await importSlaFile(file);
    const again = await importSlaFile(file, first);
    expect(again.current.records).toEqual(first.current.records);
    expect(again.current.records).toHaveLength(1);
    expect(() => assertSlaSnapshot(again)).not.toThrow();
  });
  it("importa somente JSON de histórico, sem executar scripts do HTML", () => {
    const base = {
      ...normalizeSlaRows([consolidated()]),
      source: "synthetic",
      sourceType: "Excel",
    };
    const fields = Object.keys(base.records[0]!);
    const payload = {
      ...base,
      fields,
      rows: base.records.map((row) => fields.map((field) => row[field])),
    };
    const html = `<script id="dataset" type="application/json">${JSON.stringify(payload)}</script><script>throw Error('not executed')</script>`;
    expect(extractSlaHtml(html).current.records).toEqual(base.records);
  });
});
