type Cities = string | Iterable<string>;

function cityNames(cities: Cities): string[] {
  return (typeof cities === "string" ? [cities] : [...cities])
    .map((city) =>
      String(city)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

// A mixed-city aggregate retains the standard target; Mossoró's exception is local.
export function referenceCertificationRule(technicalVisit = false, cities: Cities = "") {
  const names = cityNames(cities);
  const mossoroOnly = names.length > 0 && names.every((city) => city === "MOSSORO");
  const prod = technicalVisit ? 175 : mossoroOnly ? 100 : 150;
  const target = referenceProductivityTarget(technicalVisit, names);
  return {
    rev: 0.0701,
    tec: 0.95,
    prod,
    strict: false,
    label: `Regra vigente em todas as operações: revisita < 7,01%; TEC1 ≥ 95%; produtividade ${target}`,
  };
}

export function referenceProductivityTarget(technicalVisit = false, cities: Cities = ""): string {
  if (technicalVisit) return "≥ 175 pontos/dia";
  const names = cityNames(cities);
  const mossoro = names.includes("MOSSORO");
  if (mossoro && names.some((city) => city !== "MOSSORO"))
    return "Mossoró ≥ 100 · demais ≥ 150 pontos/dia";
  return `≥ ${mossoro ? 100 : 150} pontos/dia`;
}
