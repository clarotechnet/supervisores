import { referenceFilters } from "./reference-filters";
import type { referenceScope } from "./reference-scope";

// Presentation changes layout only: the original controls and their listeners
// are moved, not copied. The source remains the sole owner of filters/math.
export function slaPresentation(scope: ReturnType<typeof referenceScope>) {
  const { shadow, body } = scope;
  const doc = body.ownerDocument;
  const byId = (id: string) => shadow.getElementById(id)!;
  const field = (id: string) => byId(id).closest<HTMLElement>(".fbox")!;
  const selected = (id: string) => {
    const select = byId(id) as HTMLSelectElement;
    return select.selectedOptions[0]?.textContent || "Todos";
  };
  const date = (id: string) => {
    const value = (byId(id) as HTMLInputElement).value;
    return value ? value.split("-").reverse().join("/") : "";
  };
  const configs = [
    {
      id: "guarantee",
      label: "Garantia",
      nodes: [shadow.querySelector<HTMLElement>(".indicator-row")!],
      value: () =>
        byId("indicatorTotal").classList.contains("selected") ? "Total · 30 dias" : "10 dias",
    },
    {
      id: "metric",
      label: "Cálculo",
      nodes: [shadow.querySelector<HTMLElement>(".metric-row")!],
      value: () =>
        byId("metricAttendance").classList.contains("selected") ? "Atendimento" : "Tarefas",
    },
    {
      id: "location",
      label: "Local",
      nodes: [field("fLocButton")],
      value: () => byId("fLocButton").textContent || "Todos",
    },
    { id: "uf", label: "UF", nodes: [field("fUF")], value: () => selected("fUF") },
    { id: "month", label: "Mês", nodes: [field("fMonth")], value: () => selected("fMonth") },
    { id: "type", label: "Tipo de OS", nodes: [field("fType")], value: () => selected("fType") },
    {
      id: "segment",
      label: "Segmento",
      nodes: [field("fSegment")],
      value: () => selected("fSegment"),
    },
    { id: "unit", label: "Unidade", nodes: [field("fBU")], value: () => selected("fBU") },
    {
      id: "source",
      label: "Fonte",
      nodes: [field("baseSelect")],
      value: () => selected("baseSelect"),
    },
    {
      id: "dates",
      label: "Datas",
      nodes: [
        field("fDateFrom"),
        field("fDateTo"),
        byId("clearPeriod").closest<HTMLElement>(".actions")!,
      ],
      value: () => {
        const from = date("fDateFrom"),
          to = date("fDateTo");
        return from || to ? `${from || "Início"} – ${to || "Fim"}` : "Todo o período";
      },
    },
  ];
  const bar = doc.createElement("nav");
  bar.className = "sla-mini-filters";
  bar.setAttribute("aria-label", "Filtros da apresentação SLA");
  bar.hidden = true;
  shadow.querySelector(".filter-panel")!.before(bar);
  const controls = configs.map((config) => {
    const details = doc.createElement("details");
    details.className = "period-control sla-mini-filter";
    details.dataset["filter"] = config.id;
    const summary = doc.createElement("summary");
    summary.setAttribute("aria-expanded", "false");
    const label = doc.createElement("span");
    label.className = "sla-mini-label";
    label.textContent = config.label;
    const value = doc.createElement("span");
    value.className = "sla-mini-value";
    summary.append(label, value);
    const menu = doc.createElement("div");
    menu.className = "filter-popover sla-mini-menu";
    menu.setAttribute("aria-label", config.label);
    details.append(summary, menu);
    bar.append(details);
    return { ...config, details, summary, menu, valueNode: value };
  });
  const menus = referenceFilters(bar);
  const moves: Array<{ node: HTMLElement; marker: Comment }> = [];
  let on = false;
  const move = (node: HTMLElement, target: HTMLElement) => {
    const marker = doc.createComment("SLA normal layout");
    node.replaceWith(marker);
    target.append(node);
    moves.push({ node, marker });
  };
  const refresh = () => {
    if (!on) return;
    for (const control of controls) {
      const value = control.value();
      if (control.valueNode.textContent !== value) control.valueNode.textContent = value;
      const title = `${control.label}: ${value}`;
      if (control.summary.title !== title) control.summary.title = title;
    }
    menus.reposition();
  };
  const interaction = (event: Event) => {
    refresh();
    const target = event.target as HTMLElement;
    if (target.tagName === "SELECT" || target.closest(".indicator-choice-btn,#clearFiltersBtn"))
      menus.closeAll();
  };
  bar.addEventListener("change", interaction);
  bar.addEventListener("click", interaction);
  bar.addEventListener("input", refresh);
  const observer = new MutationObserver(refresh);
  for (const node of [bar, shadow.querySelector(".filter-panel")!])
    observer.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });
  const setPresenting = (next: boolean) => {
    if (on === next) return;
    menus.closeAll();
    on = next;
    body.classList.toggle("sla-presenting", next);
    bar.hidden = !next;
    if (next) {
      byId("fLocMulti").classList.remove("open");
      byId("fLocButton").setAttribute("aria-expanded", "false");
      for (const control of controls) for (const node of control.nodes) move(node, control.menu);
      move(byId("clearFiltersBtn"), bar);
      refresh();
    } else {
      for (const { node, marker } of moves) marker.replaceWith(node);
      moves.length = 0;
    }
  };
  return {
    setPresenting,
    close: menus.closeAll,
    dispose() {
      observer.disconnect();
      setPresenting(false);
      menus.dispose();
      bar.removeEventListener("change", interaction);
      bar.removeEventListener("click", interaction);
      bar.removeEventListener("input", refresh);
      bar.remove();
    },
  };
}
