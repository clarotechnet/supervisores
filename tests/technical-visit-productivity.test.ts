import { describe, expect, it } from "vitest";
import { referenceCertificationRule } from "../src/components/quality/reference-certification-rule";
import { tcRule } from "../src/lib/quality-math";

describe("produtividade exclusiva de Visita técnica", () => {
  it("mantém a regra original inteira no TC de QQ e Certificação", () => {
    expect(referenceCertificationRule()).toEqual(tcRule());
    expect(referenceCertificationRule(false)).toEqual(tcRule());
  });
  it("altera somente o limite e sua descrição em Visita técnica", () => {
    const {
      label: standardLabel,
      prod: standardProd,
      ...standard
    } = referenceCertificationRule(false);
    const { label, prod, ...visit } = referenceCertificationRule(true);
    expect(visit).toEqual(standard);
    expect(standardProd).toBe(127);
    expect(prod).toBe(175);
    expect(label).toBe(standardLabel.replace("127", "175"));
    expect(visit.strict).toBe(false);
  });
  it("não deixa a regra da Visita técnica contaminar outra instância", () => {
    const visit = referenceCertificationRule(true);
    visit.prod = 127;
    expect(referenceCertificationRule(true).prod).toBe(175);
    expect(referenceCertificationRule(false).prod).toBe(127);
    expect(tcRule().prod).toBe(127);
  });
});
