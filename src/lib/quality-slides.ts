import type { QQRecord, TCRecord } from "./quality-math";
import { normalizeLogin, type QualityLogin } from "./quality-directory";
import {
  emptyQualityFilters,
  qualityCity,
  qualityPeriodPass,
  qqUnitPass,
  type QualityFilters,
  type QualityMode,
} from "./quality-scope";

export const QUALITY_SLIDE_FRONTS = [
  ["ND", "Novos domicílios"],
  ["MIG", "Migração"],
  ["PME", "PME"],
  ["ME", "Mudança de endereço"],
] as const;
export interface QualitySlide {
  panel: "qq" | "general" | "tc";
  city: string;
  front?: string;
  supervisor?: string;
  label: string;
  duration: number;
}
export interface QualitySlideSnapshot {
  mode: QualityMode;
  filters: QualityFilters;
  front: string;
  tcView: "result" | "daily";
  expanded: boolean;
}
export function buildQualitySlides(
  qq: QQRecord[],
  tc: TCRecord[],
  index: Map<string, QualityLogin>,
  snapshot: QualitySlideSnapshot,
  technicalVisit = false,
): QualitySlide[] {
  const { filters, mode } = snapshot;
  const qqUnits = mode === "tc" || mode === "logins" ? [] : filters.units;
  const tcUnits = mode === "tc" ? filters.units : [];
  const q = technicalVisit
    ? []
    : qq.filter(
        (r) => qualityPeriodPass(r.d.slice(0, 7), r.d, filters) && qqUnitPass(r.un, qqUnits),
      );
  const cities = [...new Set(q.map((r) => qualityCity(r.lt, r.ci, index)).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const deck: QualitySlide[] = cities.flatMap((city) =>
    QUALITY_SLIDE_FRONTS.map(([front, label]) => ({
      panel: "qq",
      city,
      front,
      label,
      duration: 30000,
    })),
  );
  if (q.length)
    deck.push({
      panel: "general",
      city: "",
      label: "Todas as cidades · visão consolidada",
      duration: 90000,
    });
  const teams = new Map<string, Set<string>>();
  for (const row of tc) {
    if (
      !qualityPeriodPass(`${row.year}-${String(row.month).padStart(2, "0")}`, row.day, filters) ||
      (tcUnits.length && !tcUnits.includes(row.baseUnit))
    )
      continue;
    const city = qualityCity(row.login, row.city, index);
    if (!city || !row.login) continue;
    if (!teams.has(city)) teams.set(city, new Set());
    teams.get(city)!.add(index.get(normalizeLogin(row.login))?.supervisor || "Sem supervisor");
  }
  for (const city of [...teams.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")))
    for (const supervisor of [...teams.get(city)!].sort(
      (a, b) =>
        Number(a === "Sem supervisor") - Number(b === "Sem supervisor") ||
        a.localeCompare(b, "pt-BR"),
    ))
      deck.push({ panel: "tc", city, supervisor, label: supervisor, duration: 30000 });
  return deck;
}
export function qualitySlideFilters(
  slide: QualitySlide,
  snapshot: QualitySlideSnapshot,
): QualityFilters {
  return {
    ...emptyQualityFilters(),
    months: [...snapshot.filters.months],
    start: snapshot.filters.start,
    end: snapshot.filters.end,
    units: [...((slide.panel === "tc") === (snapshot.mode === "tc") ? snapshot.filters.units : [])],
    cities: slide.city ? [slide.city] : [],
    supervisors: slide.supervisor ? [slide.supervisor] : [],
  };
}
export interface QualityPlayerState {
  active: boolean;
  paused: boolean;
  deck: QualitySlide[];
  index: number;
  remaining: number;
  deadline: number;
}
export const emptyQualityPlayer = (): QualityPlayerState => ({
  active: false,
  paused: false,
  deck: [],
  index: 0,
  remaining: 0,
  deadline: 0,
});
interface SlideClock {
  now(): number;
  setTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export class QualitySlidePlayer {
  state = emptyQualityPlayer();
  private snapshot: QualitySlideSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private visibilityPaused = false;
  constructor(
    private callbacks: {
      capture(): QualitySlideSnapshot;
      build(snapshot: QualitySlideSnapshot): QualitySlide[];
      show(slide: QualitySlide, snapshot: QualitySlideSnapshot): void;
      restore(snapshot: QualitySlideSnapshot): void;
      change(state: QualityPlayerState): void;
      error(error: unknown): void;
    },
    private clock: SlideClock = {
      now: () => Date.now(),
      setTimeout: (fn, delay) => globalThis.setTimeout(fn, delay),
      clearTimeout: (timer) => globalThis.clearTimeout(timer),
    },
  ) {}
  private clear() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
  private emit(next: QualityPlayerState) {
    this.state = next;
    this.callbacks.change(next);
  }
  private schedule() {
    this.clear();
    if (this.state.active && !this.state.paused)
      this.timer = this.clock.setTimeout(
        () => this.next(),
        Math.max(0, this.state.deadline - this.clock.now()),
      );
  }
  start(): boolean {
    if (this.state.active) return false;
    try {
      const snapshot = this.callbacks.capture(),
        deck = this.callbacks.build(snapshot);
      if (!deck.length) return false;
      this.snapshot = snapshot;
      this.emit({ ...emptyQualityPlayer(), active: true, deck });
      this.display(0, false);
      return true;
    } catch (error) {
      this.stop();
      this.callbacks.error(error);
      return false;
    }
  }
  private display(index: number, paused = this.state.paused) {
    this.clear();
    const deck = this.state.deck;
    if (!deck.length || !this.snapshot) {
      this.stop();
      return;
    }
    index = (index + deck.length) % deck.length;
    const slide = deck[index]!;
    this.callbacks.show(slide, this.snapshot);
    this.emit({
      ...this.state,
      index,
      paused,
      remaining: slide.duration,
      deadline: this.clock.now() + slide.duration,
    });
    this.schedule();
  }
  private move(direction: number) {
    if (!this.state.active || !this.snapshot) return;
    try {
      let index = this.state.index + direction;
      if (index >= this.state.deck.length) {
        const deck = this.callbacks.build(this.snapshot);
        this.emit({ ...this.state, deck });
        index = 0;
      }
      this.display(index);
    } catch (error) {
      this.stop();
      this.callbacks.error(error);
    }
  }
  next() {
    this.move(1);
  }
  previous() {
    this.move(-1);
  }
  pause() {
    if (!this.state.active || this.state.paused) return;
    this.clear();
    this.emit({
      ...this.state,
      paused: true,
      remaining: Math.max(0, this.state.deadline - this.clock.now()),
    });
  }
  resume() {
    if (!this.state.active || !this.state.paused || !this.snapshot) return;
    try {
      this.callbacks.show(this.state.deck[this.state.index]!, this.snapshot);
      this.emit({
        ...this.state,
        paused: false,
        deadline: this.clock.now() + this.state.remaining,
      });
      this.visibilityPaused = false;
      this.schedule();
    } catch (error) {
      this.stop();
      this.callbacks.error(error);
    }
  }
  visibility(hidden: boolean) {
    if (hidden && this.state.active && !this.state.paused) {
      this.visibilityPaused = true;
      this.pause();
    } else if (!hidden && this.visibilityPaused) this.resume();
  }
  stop() {
    this.clear();
    const snapshot = this.snapshot;
    this.snapshot = null;
    this.visibilityPaused = false;
    this.emit(emptyQualityPlayer());
    if (snapshot) this.callbacks.restore(snapshot);
  }
  dispose() {
    this.clear();
    this.snapshot = null;
  }
}
