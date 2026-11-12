/** Percent input for this consultation only. No storage or project-data writes. */
export function parseQQMigrationGoal(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:[.,]\d+)?\s*%?$/.test(text)) return null;
  const percent = Number(text.replace(/\s*%$/, "").replace(",", "."));
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : null;
}

export function bindQQMigrationGoal(
  document: Pick<Document, "getElementById" | "createElement">,
  goals: { MIG: number },
  redraw: () => void,
): void {
  const input = document.getElementById("mQuebraMIG") as HTMLInputElement | null;
  if (!input) return;
  const format = (goal: number) =>
    (goal * 100).toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 12 });
  const defaultText = format(goals.MIG);
  const description = `Meta temporária desta consulta. Ao recarregar, volta ao padrão de ${defaultText}%.`;
  const help = document.createElement("small");
  help.id = "qqMigrationGoalHelp";
  help.textContent = description;
  help.className = "qq-import-help";
  help.setAttribute("aria-live", "polite");
  input.insertAdjacentElement("afterend", help);
  input.readOnly = false;
  input.removeAttribute("readonly");
  input.removeAttribute("tabindex");
  input.removeAttribute("aria-readonly");
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.setAttribute("aria-describedby", help.id);
  input.title = description;
  input.defaultValue = defaultText;
  input.value = defaultText;

  const apply = () => {
    const goal = parseQQMigrationGoal(input.value);
    if (goal === null) {
      input.setAttribute("aria-invalid", "true");
      help.textContent =
        "Informe um percentual de 0 a 100. A última meta válida continua aplicada.";
      help.style.color = "var(--red)";
      return false;
    }
    input.removeAttribute("aria-invalid");
    help.textContent = description;
    help.style.removeProperty("color");
    if (goals.MIG !== goal) {
      goals.MIG = goal;
      redraw();
    }
    return true;
  };
  input.addEventListener("input", apply);
  input.addEventListener("change", () => {
    if (apply()) input.value = format(goals.MIG);
  });
}
