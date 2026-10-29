import { describe, expect, it } from "vitest";
import { referenceCertificationRule } from "../src/components/quality/reference-certification-rule";
import { tcRule } from "../src/lib/quality-math";

describe("metas de produtividade independentes por painel", () => {
  it("muda somente a meta de produtividade do TC de QQ e Certificação para 150", () => {
    const original = tcRule();
    const expected = {
      ...original,
      prod: 150,
      label: original.label.replace("127", "150"),
    };
    expect(referenceCertificationRule()).toEqual(expected);
    expect(referenceCertificationRule(false)).toEqual(expected);
  });
  it("altera somente o limite e sua descrição em Visita técnica", () => {
    const {
      label: standardLabel,
      prod: standardProd,
      ...standard
    } = referenceCertificationRule(false);
    const { label, prod, ...visit } = referenceCertificationRule(true);
    expect(visit).toEqual(standard);
    expect(standardProd).toBe(150);
    expect(prod).toBe(175);
    expect(label).toBe(standardLabel.replace("150", "175"));
    expect(visit.strict).toBe(false);
  });
  it("não deixa a regra da Visita técnica contaminar outra instância", () => {
    const visit = referenceCertificationRule(true);
    visit.prod = 150;
    expect(referenceCertificationRule(true).prod).toBe(175);
    expect(referenceCertificationRule(false).prod).toBe(150);
    expect(tcRule().prod).toBe(127);
  });
  it.each([
    [false, 149.9, false],
    [false, 150, true],
    [false, 175, true],
    [true, 150, false],
    [true, 174.9, false],
    [true, 175, true],
  ])("aplica o limite inclusivo (VT=%s, pontos/dia=%s)", (visit, points, expected) => {
    const rule = referenceCertificationRule(visit);
    expect(rule.strict ? points > rule.prod : points >= rule.prod).toBe(expected);
  });
});
