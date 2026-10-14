// Per-renderer configuration: never mutate the shared/default TC rule.
export function referenceCertificationRule(technicalVisit = false) {
  const prod = technicalVisit ? 175 : 127;
  return {
    rev: 0.0701,
    tec: 0.95,
    prod,
    strict: false,
    label: `Regra vigente em todas as operações: revisita < 7,01%; TEC1 ≥ 95%; produtividade ≥ ${prod} pontos/dia`,
  };
}
