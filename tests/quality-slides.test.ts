import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyQualityFilters, isQQAdhesionUnit, qqUnitPass } from "../src/lib/quality-scope";
import {
  buildQualitySlides,
  qualitySlideFilters,
  QualitySlidePlayer,
  type QualitySlideSnapshot,
  type QualitySlide,
} from "../src/lib/quality-slides";
import { emptyQualityLogin } from "../src/lib/quality-directory";
import type { QQRecord, TCRecord } from "../src/lib/quality-math";

const snapshot = (): QualitySlideSnapshot => ({
  mode: "general",
  filters: emptyQualityFilters(),
  front: "ME",
  tcView: "daily",
  expanded: true,
});
const q = (un = "NTL-DMV", d = "2026-10-01", ci = "Natal") => ({ un, d, ci, lt: "Z1" }) as QQRecord;
const t = (login = "Z1", city = "Natal", month = 10, day = "2026-10-01") =>
  ({ login, city, year: 2026, month, day, baseUnit: "NTL-DMV" }) as TCRecord;
const index = new Map([
  ["Z1", { ...emptyQualityLogin(), login: "Z1", full_name: "Nome", supervisor: "Supervisor A" }],
]);

describe("recorte padrão de Quebra Qualificada", () => {
  it("inclui somente Adesão sem seleção explícita", () => {
    for (const unit of ["NTL-DMV", "PWM-DMV", "JCR-DMV", "MRO-DMV", "FTZ-DMV_01"])
      expect(isQQAdhesionUnit(unit)).toBe(true);
    for (const unit of ["NTL-DMV_ADM", "NTL-DMV_VT", "NPA-DMV_MDU_VT", "OUTRA", "FTZ-DMV_01_VT"])
      expect(qqUnitPass(unit, [])).toBe(false);
  });
  it("inclui ADM, VT e outras unidades apenas quando selecionadas", () => {
    for (const unit of ["NTL-DMV_ADM", "NTL-DMV_VT", "OUTRA"])
      expect(qqUnitPass(unit, [unit])).toBe(true);
    expect(qqUnitPass("NTL-DMV", ["NTL-DMV_VT"])).toBe(false);
  });
});
describe("sequência nativa do novo HTML", () => {
  it("segue cidades/frentes -> consolidado -> cidade/supervisor e durações originais", () => {
    const deck = buildQualitySlides(
      [q(), q("NTL-DMV_VT", "2026-10-01", "Só VT")],
      [t(), t("Z2")],
      index,
      snapshot(),
    );
    expect(deck.map((s) => s.panel)).toEqual(["qq", "qq", "qq", "qq", "general", "tc", "tc"]);
    expect(deck.slice(0, 4).map((s) => s.front)).toEqual(["ND", "MIG", "PME", "ME"]);
    expect(deck[4]?.duration).toBe(90000);
    expect(deck.filter((s) => s.panel !== "general").every((s) => s.duration === 30000)).toBe(true);
    expect(deck.at(-1)?.supervisor).toBe("Sem supervisor");
    expect(deck.some((s) => s.city === "Só VT")).toBe(false);
  });
  it("respeita meses/datas e seleção explícita de outras unidades", () => {
    const s = snapshot();
    s.filters.months = ["2026-10"];
    s.filters.start = "2026-10-02";
    s.filters.units = ["NTL-DMV_VT"];
    const deck = buildQualitySlides(
      [q(), q("NTL-DMV_VT", "2026-10-02"), q("NTL-DMV_VT", "2026-09-02", "Setembro")],
      [t()],
      index,
      s,
    );
    expect(deck).toHaveLength(5);
    expect(qualitySlideFilters(deck[0]!, s).units).toEqual(["NTL-DMV_VT"]);
    expect(qualitySlideFilters(deck[0]!, s).months).toEqual(["2026-10"]);
    expect(s.filters.cities).toEqual([]);
  });
  it("Visita técnica usa somente TC de sua própria base", () => {
    const deck = buildQualitySlides([q()], [t()], index, snapshot(), true);
    expect(deck).toHaveLength(1);
    expect(deck[0]?.panel).toBe("tc");
  });
  it("mantém o supervisor da apresentação em quebras, visão geral e TC", () => {
    const s = snapshot();
    s.filters.supervisors = ["Supervisor A"];
    const deck = buildQualitySlides(
      [q(), { ...q("NTL-DMV", "2026-10-01", "Recife"), lt: "Z2" }],
      [t(), t("Z2", "Recife")],
      index,
      s,
    );
    expect(deck).toHaveLength(6);
    expect(deck.some((slide) => slide.city === "Recife")).toBe(false);
    expect(deck.filter((slide) => slide.panel === "tc").map((slide) => slide.supervisor)).toEqual([
      "Supervisor A",
    ]);
    for (const slide of deck)
      expect(qualitySlideFilters(slide, s).supervisors).toEqual(["Supervisor A"]);
    expect(s.filters.supervisors).toEqual(["Supervisor A"]);
  });
  it("permite várias equipes e Sem supervisor, inclusive nos slides de VT", () => {
    const s = snapshot();
    s.mode = "tc";
    const roster = new Map(index);
    roster.set("Z3", { ...emptyQualityLogin(), login: "Z3", supervisor: "Supervisor B" });
    const tc = [t(), t("Z2"), t("Z3")];
    s.filters.supervisors = ["Supervisor A", "Sem supervisor"];
    expect(buildQualitySlides([], tc, roster, s, true).map((slide) => slide.supervisor)).toEqual([
      "Supervisor A",
      "Sem supervisor",
    ]);
    s.filters.supervisors = ["Não existe no recorte"];
    expect(buildQualitySlides([q()], tc, roster, s, true)).toEqual([]);
  });
  it("não aproveita o filtro de unidade de TC como se fosse uma seleção explícita de QQ", () => {
    const s = snapshot();
    s.mode = "tc";
    s.filters.units = ["NTL-DMV_VT"];
    expect(
      buildQualitySlides([q(), q("NTL-DMV_VT")], [], index, s).filter((s) => s.panel === "qq"),
    ).toHaveLength(4);
    expect(
      qualitySlideFilters({ panel: "qq", city: "Natal", label: "ND", duration: 30000 }, s).units,
    ).toEqual([]);
  });
});
describe("reprodutor de slides", () => {
  afterEach(() => vi.useRealTimers());
  const setup = () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const s = snapshot(),
      shown: QualitySlide[] = [],
      restore = vi.fn(),
      error = vi.fn();
    const player = new QualitySlidePlayer({
      capture: () => structuredClone(s),
      build: () => buildQualitySlides([q()], [t()], index, s),
      show: (slide) => {
        shown.push(slide);
      },
      restore,
      change: vi.fn(),
      error,
    });
    return { player, shown, restore, error, s };
  };
  it("avança em 30s, mantém o consolidado 90s e repete o ciclo", () => {
    const { player } = setup();
    expect(player.start()).toBe(true);
    vi.advanceTimersByTime(30000);
    expect(player.state.index).toBe(1);
    vi.advanceTimersByTime(90000);
    expect(player.state.deck[player.state.index]?.panel).toBe("general");
    vi.advanceTimersByTime(89999);
    expect(player.state.index).toBe(4);
    vi.advanceTimersByTime(1);
    expect(player.state.deck[player.state.index]?.panel).toBe("tc");
    vi.advanceTimersByTime(30000);
    expect(player.state.index).toBe(0);
    player.stop();
  });
  it("pausa, mantém tempo restante, retoma e restaura exatamente os filtros", () => {
    const { player, restore, s } = setup();
    player.start();
    vi.advanceTimersByTime(10000);
    player.pause();
    expect(player.state.remaining).toBe(20000);
    vi.advanceTimersByTime(60000);
    expect(player.state.index).toBe(0);
    player.resume();
    vi.advanceTimersByTime(19999);
    expect(player.state.index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(player.state.index).toBe(1);
    player.stop();
    expect(restore).toHaveBeenCalledExactlyOnceWith(s);
    vi.advanceTimersByTime(1000000);
    expect(player.state.active).toBe(false);
  });
  it("pausa ao ocultar aba, mas não retoma uma pausa manual", () => {
    const { player } = setup();
    player.start();
    player.visibility(true);
    expect(player.state.paused).toBe(true);
    player.visibility(false);
    expect(player.state.paused).toBe(false);
    player.pause();
    player.visibility(true);
    player.visibility(false);
    expect(player.state.paused).toBe(true);
    player.stop();
  });
  it("permite anterior/seguinte enquanto pausado e limpa o timer ao desmontar", () => {
    const { player } = setup();
    player.start();
    player.pause();
    player.previous();
    expect(player.state.index).toBe(5);
    expect(player.state.paused).toBe(true);
    player.next();
    expect(player.state.index).toBe(0);
    player.resume();
    player.dispose();
    vi.advanceTimersByTime(60000);
    expect(player.state.index).toBe(0);
  });
  it("base vazia não inicia; erro restaura a sessão", () => {
    const { player, restore, error } = setup();
    const empty = new QualitySlidePlayer({
      capture: snapshot,
      build: () => [],
      show: vi.fn(),
      restore,
      change: vi.fn(),
      error,
    });
    expect(empty.start()).toBe(false);
    expect(restore).not.toHaveBeenCalled();
    player.start();
    player.stop();
    expect(error).not.toHaveBeenCalled();
    const broken = new QualitySlidePlayer({
      capture: snapshot,
      build: () => buildQualitySlides([q()], [], index, snapshot()),
      show: () => {
        throw Error("Teste");
      },
      restore,
      change: vi.fn(),
      error,
    });
    expect(broken.start()).toBe(false);
    expect(error).toHaveBeenCalledOnce();
    expect(broken.state.active).toBe(false);
  });
});
