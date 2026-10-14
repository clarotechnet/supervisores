import { filterPopoverPosition } from "@/lib/filter-popover";

// The original toolbar's positioning/dismissal belonged to its outer page
// script. Bind that behavior to the integrated toolbar, including Shadow DOM
// clicks in the chart area and layout changes caused by the app sidebar.
export function referenceFilters(header: HTMLElement) {
  const doc = header.ownerDocument;
  const win = doc.defaultView!;
  const pickers = Array.from(header.querySelectorAll<HTMLDetailsElement>("details.period-control"));
  const close = (picker: HTMLDetailsElement) => {
    picker.open = false;
    picker.querySelector("summary")?.setAttribute("aria-expanded", "false");
    picker.querySelector<HTMLElement>(".filter-popover")?.removeAttribute("data-positioned");
  };
  const closeAll = () => pickers.forEach(close);
  const place = (picker: HTMLDetailsElement) => {
    const trigger = picker.querySelector<HTMLElement>("summary");
    const menu = picker.querySelector<HTMLElement>(".filter-popover");
    if (!picker.open || !trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const toolbar = header.getBoundingClientRect();
    const viewport = { width: doc.documentElement.clientWidth, height: win.innerHeight };
    if (anchor.bottom <= 0 || anchor.top >= viewport.height) {
      close(picker);
      return;
    }
    menu.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
    menu.style.maxHeight = "";
    // On wrapped toolbars, opening below just this button would cover the
    // next row's Mês/Datas buttons. Keep the whole toolbar usable.
    const menuBox = menu.getBoundingClientRect();
    const position = filterPopoverPosition(
      { left: anchor.left, top: toolbar.top, bottom: Math.max(anchor.bottom, toolbar.bottom) },
      menuBox,
      viewport,
    );
    menu.style.left = `${position.left}px`;
    menu.style.right = "auto";
    menu.style.top = `${position.top}px`;
    menu.style.bottom = "auto";
    menu.style.maxHeight = `${Math.min(menuBox.height, position.maxHeight)}px`;
    menu.dataset["positioned"] = "true";
  };
  let frame = 0;
  let disposed = false;
  const reposition = () => {
    if (disposed) return;
    if (frame) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      pickers.forEach(place);
    });
  };
  const toggle = (event: Event) => {
    const picker = event.currentTarget as HTMLDetailsElement;
    if (picker.open) {
      pickers.forEach((other) => {
        if (other !== picker) close(other);
      });
      picker.querySelector("summary")?.setAttribute("aria-expanded", "true");
      place(picker);
    } else close(picker);
  };
  const outside = (event: Event) => {
    const path = event.composedPath();
    for (const picker of pickers) if (picker.open && !path.includes(picker)) close(picker);
  };
  const outsideFocus = (event: Event) => {
    const path = event.composedPath();
    const target = path[0];
    for (const picker of pickers) {
      if (!picker.open || path.includes(picker)) continue;
      // Clicking a non-focusable label can focus the panel's tabindex=-1 ancestor
      // before the browser activates its checkbox. That is not leaving the menu.
      // Actual pointer clicks outside are still handled independently above.
      if (target instanceof Node && target.contains(picker)) continue;
      close(picker);
    }
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const active = pickers.find((picker) => picker.open);
    if (!active) return;
    closeAll();
    active.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  pickers.forEach((picker) => picker.addEventListener("toggle", toggle));
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("click", outside, true);
  doc.addEventListener("focusin", outsideFocus, true);
  doc.addEventListener("keydown", escape, true);
  doc.addEventListener("scroll", reposition, true);
  doc.addEventListener("fullscreenchange", reposition);
  win.addEventListener("resize", reposition);
  const observer = new ResizeObserver(reposition);
  observer.observe(header);
  pickers.forEach((picker) => observer.observe(picker));
  return {
    closeAll,
    reposition,
    dispose: () => {
      disposed = true;
      closeAll();
      observer.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      pickers.forEach((picker) => picker.removeEventListener("toggle", toggle));
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("click", outside, true);
      doc.removeEventListener("focusin", outsideFocus, true);
      doc.removeEventListener("keydown", escape, true);
      doc.removeEventListener("scroll", reposition, true);
      doc.removeEventListener("fullscreenchange", reposition);
      win.removeEventListener("resize", reposition);
    },
  };
}
