import { describe, expect, it } from "vitest";
import { referenceCityMembers } from "../src/components/quality/reference-city-members";

describe("cidades do cadastro no filtro do Técnico Certificado", () => {
  it("seleciona nomes individuais e agrupados de Natal/Parnamirim sem perder os cadastrados", () => {
    const available = [
      "Natal",
      "Parnamirim",
      "NATAL/PARNAMIRIM",
      "Natal / Parnamirim",
      "NATAL / PARNAMIRIM",
      "Fortaleza",
      "Recife",
    ];
    expect(referenceCityMembers("Natal / Parnamirim", available)).toEqual(available.slice(0, 5));
    expect(referenceCityMembers("NATAL/PARNAMIRIM", available)).toEqual(available.slice(0, 5));
    expect(available).toHaveLength(7);
  });
  it("mantém os valores reais para o filtro e não inclui cidades de outro grupo", () => {
    expect(referenceCityMembers("Mossoró", ["MOSSORO", "Mossoró", "Recife", "MOSSORO"])).toEqual([
      "MOSSORO",
      "Mossoró",
    ]);
    expect(referenceCityMembers("", ["Natal", "Parnamirim"])).toEqual([]);
    expect(referenceCityMembers("Natal", ["Recife"])).toEqual([]);
  });
});
