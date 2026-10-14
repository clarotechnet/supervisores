import type { ReferenceEnvironment, ReferenceParent } from "./reference-types";

// The reviewed rendering code lives in an isolated native DOM subtree, not an
// iframe. Selectors, styles and local storage are scoped to this module.
export function referenceScope(
  host: HTMLElement,
  css: string,
  markup: string,
  parent: ReferenceParent,
  editable: boolean,
  importFile: ReferenceEnvironment["importFile"],
) {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>:host{display:block;height:100%;--reference-viewport:900px}.reference-body{all:initial;display:block;min-height:100%;position:relative} ${css}\n[hidden]{display:none!important}</style><div class="reference-body unified-embed">${markup}</div>`;
  const body = shadow.querySelector<HTMLElement>(".reference-body")!;
  const cleanup: Array<() => void> = [];
  const listen = (
    target: EventTarget,
    type: string,
    fn: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => {
    target.addEventListener(type, fn, options);
    cleanup.push(() => target.removeEventListener(type, fn, options));
  };
  const realDocument = host.ownerDocument;
  const doc = new Proxy(
    {
      body,
      documentElement: body,
      scrollingElement: host,
      getElementById: (id: string) => shadow.getElementById(id),
      querySelector: (s: string) => shadow.querySelector(s),
      querySelectorAll: (s: string) => shadow.querySelectorAll(s),
      addEventListener: (
        type: string,
        fn: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
      ) => listen(type === "fullscreenchange" ? realDocument : shadow, type, fn, options),
      get activeElement() {
        return shadow.activeElement;
      },
    },
    {
      get(target, key) {
        if (key in target) return Reflect.get(target, key);
        const value = Reflect.get(realDocument, key, realDocument);
        return typeof value === "function" ? value.bind(realDocument) : value;
      },
    },
  ) as unknown as Document;
  const api = new Proxy(
    {
      parent,
      addEventListener: (
        type: string,
        fn: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
      ) => listen(window, type, fn, options),
      get innerWidth() {
        return host.clientWidth || 1280;
      },
      get innerHeight() {
        return host.clientHeight || 900;
      },
    },
    {
      get(target, key) {
        if (key in target) return Reflect.get(target, key);
        const value = Reflect.get(window, key, window);
        return typeof value === "function" ? value.bind(window) : value;
      },
    },
  ) as unknown as ReferenceEnvironment["window"];
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, String(value)),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  };
  class ScopedObserver extends ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      cleanup.push(() => this.disconnect());
    }
  }
  const timers = new Set<number>();
  const timeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    const id = window.setTimeout(fn, delay, ...args);
    timers.add(id);
    return id;
  }) as typeof window.setTimeout;
  const resize = () => {
    body.style.setProperty("--reference-viewport", `${host.clientHeight || 900}px`);
    body.style.setProperty("--reference-width", `${host.clientWidth || 1280}px`);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  cleanup.push(() => observer.disconnect());
  resize();
  let disposed = false;
  const frames = new Set<number>();
  const environment: ReferenceEnvironment = {
    document: doc,
    window: api,
    localStorage: storage,
    location: { search: "" },
    ResizeObserver: ScopedObserver,
    setTimeout: timeout,
    clearTimeout: (id) => {
      if (typeof id === "number") {
        timers.delete(id);
        window.clearTimeout(id);
      }
    },
    requestAnimationFrame: (fn) => {
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!disposed) fn(time);
      });
      frames.add(id);
      return id;
    },
    editable,
    importFile,
  };
  return {
    environment,
    shadow,
    body,
    dispose: () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
      timers.forEach((id) => window.clearTimeout(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      shadow.replaceChildren();
    },
  };
}
