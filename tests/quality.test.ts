import { describe, expect, it } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { assertQualityRecords, extractQualityHtml, qualityErrorMessage } from "../src/lib/quality";

const zip = (text: string) => Buffer.from(gzipSync(strToU8(text))).toString("base64");
const entity = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("importação do painel original de qualidade", () => {
  it("extrai bases e cadastros sem executar scripts do HTML", () => {
    const qq = `const QQ_INITIAL_GZIP="${zip(JSON.stringify([{ d: "2026-10-01", lt: "T1", b: 1 }]))}";\nconst NAME_MAP={"T1":"Teste"};\nconst QQ_SOURCE_UPDATES=[];\n`;
    const csv = "LOGIN_TECNICO;DATA_NOTA\nT1;01/10/2026";
    const tc = `const EMBEDDED_CSV_GZIP="${zip(csv)}";\nconst TECH_MAP={"T1":{"name":"Teste"}};\n`;
    const html = `<script>throw new Error('nao executar')</script><script id="supervisorSeed" type="application/json">{"T1":{"name":"Teste","supervisor":"Gestor"}}</script><iframe id="frameQQ" srcdoc="${entity(qq)}"></iframe><iframe id="frameTC" srcdoc="${entity(tc)}"></iframe>`;
    const extracted = extractQualityHtml(html);
    expect(extracted.quebra.records).toHaveLength(1);
    expect(extracted.certificationCsv).toBe(csv);
    expect(extracted.registry["T1"]?.supervisor).toBe("Gestor");
    expect(extracted.quebra.names).toEqual({ T1: "Teste" });
  });

  it("recusa um HTML diferente e registros incompatíveis antes de salvar", () => {
    expect(() => extractQualityHtml("<html>Outro painel</html>")).toThrow("HTML unificado");
    expect(() => assertQualityRecords("quebra", [{ d: "inválida", b: 1 }])).toThrow(
      "Base QQ inválida",
    );
    expect(() =>
      assertQualityRecords("certification", [{ login: "T1", day: "2026-10-01" }]),
    ).toThrow("data ausente");
  });

  it("identifica claramente uma migration ainda não instalada", () => {
    expect(qualityErrorMessage({ code: "PGRST205" })).toContain("supervisortechnet");
    expect(qualityErrorMessage(new Error("Falha de rede"))).toBe("Falha de rede");
  });
});
